use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rank_predictor::{RankPrediction, RankPredictorError};
use crate::utils::types::AccountIdQuery;

const N_MATCHES: usize = 30;
/// Fetch more than `N_MATCHES` so hero-history covers matches outside the aggregation window.
const FETCH_LIMIT: usize = N_MATCHES + 50;
const RECENCY_ALPHA: f32 = 0.85;

#[derive(Debug, Clone, Row, Deserialize)]
struct CombinedMatchRow {
    hero_id: u32,
    player_team: i8,
    player_kills: u32,
    match_duration_s: u32,
    average_badge_team0: Option<u32>,
    average_badge_team1: Option<u32>,
    enemy_nw_avg: Option<f64>,
    enemy_dmg_avg: Option<f64>,
}

#[derive(Debug, Clone)]
struct Match {
    hero_id: u32,
    player_kills: u32,
    duration_s: u32,
    own_team_badge: f32,
    enemy_team_badge: f32,
    enemy_nw_avg: Option<f32>,
    enemy_dmg_avg: Option<f32>,
}

#[derive(Debug, Serialize, ToSchema)]
pub(crate) struct RankPredictResponse {
    #[serde(flatten)]
    pub(crate) prediction: RankPrediction,
    /// Number of recent matches used for the prediction
    pub(crate) matches_used: usize,
}

#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
async fn fetch_matches(
    ch: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<Vec<Match>> {
    let rows: Vec<CombinedMatchRow> = ch
        .query(
            "WITH t_matches AS (
                SELECT
                    pmh.match_id,
                    pmh.hero_id,
                    pmh.player_team,
                    pmh.player_kills,
                    pmh.match_duration_s,
                    mi.average_badge_team0,
                    mi.average_badge_team1
                FROM player_match_history pmh FINAL
                JOIN match_info mi FINAL USING (match_id)
                WHERE pmh.account_id = ?
                  AND pmh.match_mode IN ('Ranked', 'Unranked')
                  AND pmh.game_mode = 'Normal'
                  AND mi.average_badge_team0 > 0
                  AND mi.average_badge_team1 > 0
                ORDER BY pmh.start_time DESC
                LIMIT ?
            ),
            t_enemy_stats AS (
                SELECT
                    match_id,
                    team,
                    avg(net_worth) AS nw_avg,
                    avg(max_player_damage) AS dmg_avg
                FROM match_player FINAL
                WHERE match_id IN (SELECT match_id FROM t_matches)
                GROUP BY match_id, team
            )
            SELECT
                m.hero_id,
                m.player_team,
                m.player_kills,
                m.match_duration_s,
                m.average_badge_team0,
                m.average_badge_team1,
                toNullable(es.nw_avg) AS enemy_nw_avg,
                toNullable(es.dmg_avg) AS enemy_dmg_avg
            FROM t_matches m
            LEFT JOIN t_enemy_stats es
                ON es.match_id = m.match_id
                AND es.team = if(m.player_team = 'Team0', 'Team1', 'Team0')",
        )
        .bind(account_id)
        .bind(FETCH_LIMIT as u64)
        .fetch_all()
        .await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let b0 = r.average_badge_team0.unwrap_or(0) as f32;
            let b1 = r.average_badge_team1.unwrap_or(0) as f32;
            let (own_badge, enemy_badge) = if r.player_team == 0 {
                (b0, b1)
            } else {
                (b1, b0)
            };
            Match {
                hero_id: r.hero_id,
                player_kills: r.player_kills,
                duration_s: r.match_duration_s,
                own_team_badge: own_badge,
                enemy_team_badge: enemy_badge,
                enemy_nw_avg: r.enemy_nw_avg.map(|v| v as f32),
                enemy_dmg_avg: r.enemy_dmg_avg.map(|v| v as f32),
            }
        })
        .collect())
}

#[allow(clippy::cast_precision_loss)]
fn kills_per_min(m: &Match) -> f32 {
    let dur = (m.duration_s as f32 / 60.0).max(1.0);
    m.player_kills as f32 / dur
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap
)]
fn aggregate_features(matches: &[Match]) -> Option<[f32; 13]> {
    if matches.len() < N_MATCHES {
        return None;
    }

    let window = &matches[..N_MATCHES];

    let weights: Vec<f32> = (0..N_MATCHES)
        .map(|i| RECENCY_ALPHA.powi(i as i32))
        .collect();
    let w_sum: f32 = weights.iter().sum();
    let w_norm: Vec<f32> = weights.iter().map(|w| w / w_sum).collect();

    let hero_avg: HashMap<u32, f32> = {
        let mut sums: HashMap<u32, (f32, u32)> = HashMap::new();
        for m in matches {
            let e = sums.entry(m.hero_id).or_insert((0.0, 0));
            e.0 += m.own_team_badge;
            e.1 += 1;
        }
        sums.into_iter()
            .map(|(hero, (sum, cnt))| (hero, sum / cnt as f32))
            .collect()
    };

    let (own_b, enemy_b, hero_hist_badges): (Vec<f32>, Vec<f32>, Vec<f32>) = window
        .iter()
        .map(|m| {
            let hist = *hero_avg.get(&m.hero_id).unwrap_or(&m.own_team_badge);
            (m.own_team_badge, m.enemy_team_badge, hist)
        })
        .multiunzip();

    let per_hero_max = hero_avg.values().copied().fold(f32::NEG_INFINITY, f32::max);

    let all_kills_pm: Vec<f32> = matches.iter().map(kills_per_min).collect();
    let hist_kills_pm = all_kills_pm.iter().sum::<f32>() / all_kills_pm.len() as f32;
    let kills_pm = &all_kills_pm[..N_MATCHES];

    let hist_hero_diversity = hero_avg.len() as f32;

    let wmean =
        |vals: &[f32], ws: &[f32]| -> f32 { vals.iter().zip(ws.iter()).map(|(v, w)| v * w).sum() };
    let wstd = |vals: &[f32], ws: &[f32]| -> f32 {
        let mean = wmean(vals, ws);
        vals.iter()
            .zip(ws.iter())
            .map(|(v, w)| w * (v - mean).powi(2))
            .sum::<f32>()
            .sqrt()
    };
    let r10mean = |vals: &[f32]| vals[..10].iter().sum::<f32>() / 10.0;

    let (enemy_nw_avg_mean, enemy_dmg_avg_mean) = {
        let (nw_sum, dmg_sum, count) =
            window
                .iter()
                .fold((0.0f32, 0.0f32, 0u32), |(nw, dmg, n), m| {
                    match m.enemy_nw_avg {
                        Some(v) => (nw + v, dmg + m.enemy_dmg_avg.unwrap_or(0.0), n + 1),
                        None => (nw, dmg, n),
                    }
                });
        if count > 0 {
            (nw_sum / count as f32, dmg_sum / count as f32)
        } else {
            (0.0, 0.0)
        }
    };

    Some([
        wmean(&own_b, &w_norm),
        wmean(&enemy_b, &w_norm),
        r10mean(&own_b),
        r10mean(&enemy_b),
        wstd(&own_b, &w_norm),
        enemy_nw_avg_mean,
        enemy_dmg_avg_mean,
        wmean(&hero_hist_badges, &w_norm),
        per_hero_max,
        hist_kills_pm,
        hist_hero_diversity,
        wmean(kills_pm, &w_norm),
        r10mean(kills_pm),
    ])
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank-predict",
    params(AccountIdQuery),
    responses(
        (status = OK, body = RankPredictResponse),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = UNPROCESSABLE_ENTITY, description = "Not enough recent ranked matches (need 30)"),
        (status = SERVICE_UNAVAILABLE, description = "Rank prediction model not loaded"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Prediction failed"),
    ),
    tags = ["Players"],
    summary = "Rank Predict",
    description = "
Predicts a player's current rank badge from their last 30 ranked/unranked matches using a stacked
ONNX ensemble (Ridge + XGBoost + LightGBM). Requires at least 30 eligible matches (Ranked or
Unranked, Normal game mode) with valid badge data.

> **This is an ML prediction and may be inaccurate.** The model has no access to the player's
> actual hidden MMR — it infers rank from match context signals only.

### Model Accuracy (5-fold cross-validation)

| Metric | Value |
|--------|-------|
| R²     | 0.924 |
| MAE    | 3.35 sub-ranks |
| RMSE   | 4.55 sub-ranks |
| Within ±1 sub-rank | 30% |
| Within ±3 sub-ranks | 64% |
| Within ±5 sub-ranks | 83% |
| Within ±6 sub-ranks | 88% |

Accuracy by tier:

| Tier range | MAE |
|------------|-----|
| Low (1–4)  | 4.46 sub-ranks |
| Mid (5–7)  | 3.93 sub-ranks |
| High (8–11)| 2.84 sub-ranks |

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
"
)]
pub(super) async fn rank_predict(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<Json<RankPredictResponse>> {
    let predictor = state.rank_predictor.as_ref().ok_or_else(|| {
        APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "Rank prediction model is not loaded.",
        )
    })?;

    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let matches = fetch_matches(&state.ch_client_ro, account_id)
        .await
        .map_err(|e| APIError::internal(format!("ClickHouse query failed: {e}")))?;

    let features = aggregate_features(&matches).ok_or_else(|| {
        APIError::status_msg(
            StatusCode::UNPROCESSABLE_ENTITY,
            format!(
                "Not enough eligible matches for prediction (found {}, need {N_MATCHES}).",
                matches.len()
            ),
        )
    })?;

    let prediction = predictor
        .predict(features)
        .map_err(|e: RankPredictorError| APIError::internal(format!("Inference failed: {e}")))?;

    Ok(Json(RankPredictResponse {
        prediction,
        matches_used: N_MATCHES,
    }))
}
