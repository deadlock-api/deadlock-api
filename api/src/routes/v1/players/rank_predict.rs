use std::collections::HashMap;
use std::sync::LazyLock;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::warn;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rank_predictor::{RankPrediction, RankPredictorError, badge_to_idx};
use crate::utils::types::AccountIdQuery;

const N_MATCHES: usize = 30;
const FETCH_LIMIT: usize = N_MATCHES;
const RECENCY_ALPHA: f64 = 0.85;

static W_NORM: LazyLock<[f64; N_MATCHES]> = LazyLock::new(|| {
    let mut weights = [0.0f64; N_MATCHES];
    let mut sum = 0.0f64;
    for (i, w) in weights.iter_mut().enumerate() {
        #[allow(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
        {
            *w = RECENCY_ALPHA.powi(i as i32);
        }
        sum += *w;
    }
    for w in &mut weights {
        *w /= sum;
    }
    weights
});

#[derive(Debug, Clone, Row, Deserialize)]
struct MatchRow {
    match_id: u64,
    hero_id: u32,
    player_team: i8,
    player_kills: u32,
    match_duration_s: u32,
    average_badge_team0: Option<u32>,
    average_badge_team1: Option<u32>,
    enemy_team: u8,
}

#[derive(Debug, Clone, Row, Deserialize)]
struct EnemyStatsRow {
    match_id: u64,
    team: i8,
    nw_avg: f64,
    dmg_avg: f64,
}

#[derive(Debug, Clone)]
struct Match {
    hero_id: u32,
    player_kills: u32,
    duration_s: u32,
    own_team_badge: f64,
    enemy_team_badge: f64,
    enemy_nw_avg: f64,
    enemy_dmg_avg: f64,
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
    // Step 1: Get the match rows (fast — uses pmh primary key).
    let match_rows: Vec<MatchRow> = ch
        .query(
            "SELECT
                pmh.match_id,
                pmh.hero_id,
                pmh.player_team,
                pmh.player_kills,
                pmh.match_duration_s,
                mi.average_badge_team0,
                mi.average_badge_team1,
                if(pmh.player_team = 'Team0', 1, 0) AS enemy_team
            FROM player_match_history pmh
            JOIN match_info mi USING (match_id)
            WHERE pmh.account_id = ?
              AND pmh.match_mode IN ('Ranked', 'Unranked')
              AND pmh.game_mode = 'Normal'
              AND mi.average_badge_team0 > 0
              AND mi.average_badge_team1 > 0
            ORDER BY pmh.match_id DESC
            LIMIT 1 BY match_id
            LIMIT ?",
        )
        .bind(account_id)
        .bind(FETCH_LIMIT as u64)
        .fetch_all()
        .await?;

    if match_rows.len() < N_MATCHES {
        return Ok(Vec::new());
    }

    // Step 2: Fetch enemy stats with explicit (match_id, team) tuples so ClickHouse
    // can prune match_player by primary key instead of scanning the full table.
    let tuples: String = match_rows
        .iter()
        .map(|r| format!("({}, {})", r.match_id, r.enemy_team))
        .join(", ");

    let enemy_stats: Vec<EnemyStatsRow> = ch
        .query(&format!(
            "SELECT
                match_id,
                team,
                avg(net_worth)         AS nw_avg,
                avg(max_player_damage) AS dmg_avg
            FROM match_player
            WHERE (match_id, team) IN ({tuples})
            GROUP BY match_id, team"
        ))
        .fetch_all()
        .await?;

    // Index enemy stats by (match_id, team) for O(1) lookup.
    let enemy_map: HashMap<(u64, i8), &EnemyStatsRow> = enemy_stats
        .iter()
        .map(|e| ((e.match_id, e.team), e))
        .collect();

    Ok(match_rows
        .into_iter()
        .map(|r| {
            let b0 = r.average_badge_team0.unwrap_or(0).cast_signed();
            let b1 = r.average_badge_team1.unwrap_or(0).cast_signed();
            let (own_raw, enemy_raw) = if r.player_team == 0 {
                (b0, b1)
            } else {
                (b1, b0)
            };
            let (enemy_nw, enemy_dmg) = enemy_map
                .get(&(r.match_id, r.enemy_team.cast_signed()))
                .map_or((0.0, 0.0), |e| (e.nw_avg, e.dmg_avg));
            Match {
                hero_id: r.hero_id,
                player_kills: r.player_kills,
                duration_s: r.match_duration_s,
                own_team_badge: f64::from(badge_to_idx(own_raw)),
                enemy_team_badge: f64::from(badge_to_idx(enemy_raw)),
                enemy_nw_avg: enemy_nw,
                enemy_dmg_avg: enemy_dmg,
            }
        })
        .collect())
}

#[allow(clippy::cast_precision_loss)]
fn kills_per_min(m: &Match) -> f64 {
    let dur = (f64::from(m.duration_s) / 60.0).max(1.0);
    f64::from(m.player_kills) / dur
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap
)]
fn aggregate_features(matches: &[Match]) -> Option<[f64; 13]> {
    if matches.len() < N_MATCHES {
        return None;
    }

    let window = &matches[..N_MATCHES];
    let w_norm: &[f64; N_MATCHES] = &W_NORM;

    // Build hero averages and total kills/min from the window only (matching Python predict.py).
    let mut hero_sums: HashMap<u32, (f64, u32)> = HashMap::new();
    let mut total_kills_pm = 0.0f64;
    for m in window {
        let e = hero_sums.entry(m.hero_id).or_insert((0.0, 0));
        e.0 += m.own_team_badge;
        e.1 += 1;
        total_kills_pm += kills_per_min(m);
    }
    let hist_kills_pm = total_kills_pm / N_MATCHES as f64;
    let hero_avg: HashMap<u32, f64> = hero_sums
        .iter()
        .map(|(&hero, &(sum, cnt))| (hero, sum / f64::from(cnt)))
        .collect();
    let hist_hero_diversity = hero_avg.len() as f64;
    let per_hero_max = hero_avg.values().copied().fold(f64::NEG_INFINITY, f64::max);

    let (own_b, enemy_b, hero_hist_badges): (Vec<f64>, Vec<f64>, Vec<f64>) = window
        .iter()
        .map(|m| {
            let hist = *hero_avg.get(&m.hero_id).unwrap_or(&m.own_team_badge);
            (m.own_team_badge, m.enemy_team_badge, hist)
        })
        .multiunzip();

    let kills_pm: Vec<f64> = window.iter().map(kills_per_min).collect();

    let (enemy_nw_sum, enemy_dmg_sum) = window.iter().fold((0.0f64, 0.0f64), |(nw, dmg), m| {
        (nw + m.enemy_nw_avg, dmg + m.enemy_dmg_avg)
    });
    let enemy_nw_avg_mean = enemy_nw_sum / N_MATCHES as f64;
    let enemy_dmg_avg_mean = enemy_dmg_sum / N_MATCHES as f64;

    let wmean = |vals: &[f64], ws: &[f64]| -> f64 { vals.iter().zip(ws).map(|(v, w)| v * w).sum() };
    let wstd = |vals: &[f64], ws: &[f64]| -> f64 {
        let mean = wmean(vals, ws);
        vals.iter()
            .zip(ws)
            .map(|(v, w)| w * (v - mean).powi(2))
            .sum::<f64>()
            .sqrt()
    };
    let r10mean = |vals: &[f64]| vals[..10].iter().sum::<f64>() / 10.0;

    Some([
        wmean(&own_b, w_norm),
        wmean(&enemy_b, w_norm),
        r10mean(&own_b),
        r10mean(&enemy_b),
        wstd(&own_b, w_norm),
        enemy_nw_avg_mean,
        enemy_dmg_avg_mean,
        wmean(&hero_hist_badges, w_norm),
        per_hero_max,
        hist_kills_pm,
        hist_hero_diversity,
        wmean(&kills_pm, w_norm),
        r10mean(&kills_pm),
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
Predicts a player's current rank badge from their last 30 ranked/unranked matches.
Requires at least 30 eligible matches (Ranked or Unranked, Normal game mode) with valid badge data.

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
