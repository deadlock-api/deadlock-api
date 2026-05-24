use std::collections::HashMap;
use std::sync::LazyLock;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::IntoResponse;
use clickhouse::Row;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::clickhouse_batcher::{BatchQueryMulti, ClickhouseBatcherMulti, in_clause};
use crate::services::rank_predictor::{
    N_FEATURES, RankPrediction, RankPredictorError, badge_to_idx, idx_to_badge,
};
use crate::utils::types::AccountIdQuery;

const N_MATCHES: usize = 30;
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
pub(crate) struct MatchRow {
    account_id: u32,
    match_id: u64,
    hero_id: u32,
    player_team: i8,
    player_kills: u32,
    player_deaths: u32,
    player_assists: u32,
    player_denies: u32,
    player_net_worth: u32,
    player_won: bool,
    max_shots_hit: u32,
    max_shots_missed: u32,
    match_duration_s: u32,
    average_badge_team0: Option<u32>,
    average_badge_team1: Option<u32>,
    enemy_team: u8,
}

pub(crate) struct RankPredictMatchesQuery;

impl BatchQueryMulti for RankPredictMatchesQuery {
    type Key = u32;
    type Value = MatchRow;

    fn build_query(keys: &[u32]) -> String {
        format!(
            "SELECT
                account_id,
                match_id,
                hero_id,
                team AS player_team,
                kills AS player_kills,
                deaths AS player_deaths,
                assists AS player_assists,
                denies AS player_denies,
                net_worth AS player_net_worth,
                won AS player_won,
                max_shots_hit,
                max_shots_missed,
                duration_s AS match_duration_s,
                average_badge_team0,
                average_badge_team1,
                if(team = 'Team0', 1, 0) AS enemy_team
            FROM (
                SELECT
                    account_id,
                    match_id,
                    hero_id,
                    team,
                    kills,
                    deaths,
                    assists,
                    denies,
                    net_worth,
                    won,
                    max_shots_hit,
                    max_shots_missed,
                    duration_s,
                    average_badge_team0,
                    average_badge_team1
                FROM match_player
                WHERE account_id IN ({})
                  AND match_mode IN ('Ranked', 'Unranked')
                  AND game_mode = 'Normal'
                  AND average_badge_team0 > 0
                  AND average_badge_team1 > 0
                ORDER BY account_id, match_id DESC
                LIMIT 1 BY account_id, match_id
            )
            ORDER BY account_id, match_id DESC
            LIMIT {} BY account_id
            SETTINGS log_comment = 'rank_predict_matches', apply_patch_parts = 0",
            in_clause(keys),
            N_MATCHES,
        )
    }

    fn key_of(value: &MatchRow) -> u32 {
        value.account_id
    }
}

pub(crate) type RankPredictMatchesBatcher = ClickhouseBatcherMulti<RankPredictMatchesQuery>;

#[derive(Debug, Clone, Row, Deserialize)]
struct EnemyStatsRow {
    match_id: u64,
    team: i8,
    nw_avg: f64,
    dmg_avg: f64,
}

#[derive(Debug, Clone, Row, Deserialize)]
struct PlayerCreepRow {
    match_id: u64,
    max_creep_kills: u32,
    max_possible_creeps: u32,
}

#[derive(Debug, Clone)]
struct Match {
    hero_id: u32,
    player_kills: u32,
    player_deaths: u32,
    player_assists: u32,
    player_denies: u32,
    player_net_worth: f64,
    won: bool,
    duration_s: u32,
    own_team_badge: f64,
    enemy_team_badge: f64,
    enemy_nw_avg: f64,
    enemy_dmg_avg: f64,
    cs_efficiency: Option<f64>,
    shot_accuracy: Option<f64>,
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
    batcher: &RankPredictMatchesBatcher,
    ch: &clickhouse::Client,
    account_id: u32,
) -> APIResult<Vec<Match>> {
    let match_rows = batcher.load(account_id).await?;

    if match_rows.len() < N_MATCHES {
        return Ok(Vec::new());
    }

    // Explicit (match_id, team) tuples let ClickHouse prune match_player by primary key
    // instead of scanning the full table.
    let tuples: String = match_rows
        .iter()
        .map(|r| format!("({}, {})", r.match_id, r.enemy_team))
        .join(", ");

    let enemy_query = format!(
        "SELECT
            match_id,
            team,
            avg(net_worth)         AS nw_avg,
            avg(max_player_damage) AS dmg_avg
        FROM match_player
        WHERE (match_id, team) IN ({tuples})
        GROUP BY match_id, team
        SETTINGS log_comment = 'rank_predict_enemy_stats', apply_patch_parts = 0"
    );
    debug!("Enemy stats query: {enemy_query}");

    let match_ids: String = match_rows.iter().map(|r| r.match_id.to_string()).join(", ");
    let creep_query = format!(
        "SELECT match_id, max_creep_kills, max_possible_creeps
         FROM match_player
         WHERE match_id IN ({match_ids}) AND account_id = {account_id}
         SETTINGS log_comment = 'rank_predict_creep_stats', apply_patch_parts = 0"
    );
    debug!("Player creep stats query: {creep_query}");

    let (enemy_stats, creep_rows): (Vec<EnemyStatsRow>, Vec<PlayerCreepRow>) = tokio::try_join!(
        async {
            ch.query(&enemy_query)
                .fetch_all()
                .await
                .map_err(|e| APIError::internal(format!("ClickHouse query failed: {e}")))
        },
        async {
            ch.query(&creep_query)
                .fetch_all()
                .await
                .map_err(|e| APIError::internal(format!("ClickHouse query failed: {e}")))
        },
    )?;

    let enemy_map: HashMap<(u64, i8), &EnemyStatsRow> = enemy_stats
        .iter()
        .map(|e| ((e.match_id, e.team), e))
        .collect();
    let creep_map: HashMap<u64, &PlayerCreepRow> =
        creep_rows.iter().map(|c| (c.match_id, c)).collect();

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
            let shots_total = r.max_shots_hit + r.max_shots_missed;
            let shot_accuracy = if shots_total == 0 {
                None
            } else {
                Some(f64::from(r.max_shots_hit) / f64::from(shots_total))
            };
            let cs_efficiency = creep_map
                .get(&r.match_id)
                .map(|c| f64::from(c.max_creep_kills) / f64::from(c.max_possible_creeps.max(1)));
            Match {
                hero_id: r.hero_id,
                player_kills: r.player_kills,
                player_deaths: r.player_deaths,
                player_assists: r.player_assists,
                player_denies: r.player_denies,
                player_net_worth: f64::from(r.player_net_worth),
                won: r.player_won,
                duration_s: r.match_duration_s,
                own_team_badge: f64::from(badge_to_idx(own_raw)),
                enemy_team_badge: f64::from(badge_to_idx(enemy_raw)),
                enemy_nw_avg: enemy_nw,
                enemy_dmg_avg: enemy_dmg,
                cs_efficiency,
                shot_accuracy,
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
    clippy::cast_possible_wrap,
    clippy::too_many_lines
)]
fn aggregate_features(matches: &[Match]) -> Option<[f64; N_FEATURES]> {
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

    // Weighted mean over a subset of indices with weights re-normalized over
    // the surviving rows. Matches the Python pipeline's NaN-skipping behavior
    // for shot_accuracy_wmean and nw_ratio_wmean.
    let wmean_masked = |vals: &[(usize, f64)], ws: &[f64], default: f64| -> f64 {
        let wsum: f64 = vals.iter().map(|&(i, _)| ws[i]).sum();
        if wsum <= 0.0 {
            return default;
        }
        vals.iter().map(|&(i, v)| v * (ws[i] / wsum)).sum()
    };

    let own_badge_mean = own_b.iter().sum::<f64>() / N_MATCHES as f64;
    let enemy_badge_mean = enemy_b.iter().sum::<f64>() / N_MATCHES as f64;

    let cs_efficiencies: Vec<f64> = window.iter().filter_map(|m| m.cs_efficiency).collect();
    let cs_efficiency_mean = if cs_efficiencies.is_empty() {
        0.0
    } else {
        cs_efficiencies.iter().sum::<f64>() / cs_efficiencies.len() as f64
    };

    let cs_x_hero_vals: Vec<f64> = window
        .iter()
        .zip(hero_hist_badges.iter())
        .filter_map(|(m, &hero_badge)| m.cs_efficiency.map(|cs| cs * hero_badge.max(1.0)))
        .collect();
    let cs_x_hero_badge = if cs_x_hero_vals.is_empty() {
        0.0
    } else {
        cs_x_hero_vals.iter().sum::<f64>() / cs_x_hero_vals.len() as f64
    };

    // New per-match per-game-context scalars.
    let per_match: Vec<(f64, f64, f64, f64)> = window
        .iter()
        .map(|m| {
            let dur_min = (f64::from(m.duration_s) / 60.0).max(1.0);
            let kda =
                f64::from(m.player_kills + m.player_assists) / f64::from(m.player_deaths.max(1));
            let denies_pm = f64::from(m.player_denies) / dur_min;
            let nw_pm = m.player_net_worth / dur_min;
            let win = if m.won { 1.0 } else { 0.0 };
            (kda, denies_pm, nw_pm, win)
        })
        .collect();
    let kdas: Vec<f64> = per_match.iter().map(|t| t.0).collect();
    let denies_pms: Vec<f64> = per_match.iter().map(|t| t.1).collect();
    let nw_pms: Vec<f64> = per_match.iter().map(|t| t.2).collect();
    let wins: Vec<f64> = per_match.iter().map(|t| t.3).collect();

    let shot_acc_vals: Vec<(usize, f64)> = window
        .iter()
        .enumerate()
        .filter_map(|(i, m)| m.shot_accuracy.map(|v| (i, v)))
        .collect();
    let shot_accuracy_wmean = wmean_masked(&shot_acc_vals, w_norm, 0.0);

    let nw_ratio_vals: Vec<(usize, f64)> = window
        .iter()
        .enumerate()
        .filter_map(|(i, m)| {
            if m.enemy_nw_avg > 0.0 {
                Some((i, m.player_net_worth / m.enemy_nw_avg))
            } else {
                None
            }
        })
        .collect();
    let nw_ratio_wmean = wmean_masked(&nw_ratio_vals, w_norm, 1.0);

    Some([
        wmean(&own_b, w_norm),
        wmean(&enemy_b, w_norm),
        own_badge_mean,
        enemy_badge_mean,
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
        cs_efficiency_mean,
        cs_x_hero_badge,
        shot_accuracy_wmean,
        wmean(&wins, w_norm),
        wmean(&nw_pms, w_norm),
        wmean(&kdas, w_norm),
        wmean(&denies_pms, w_norm),
        nw_ratio_wmean,
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
| R²     | 0.949 |
| MAE    | 1.08 sub-ranks |
| RMSE   | 1.89 sub-ranks |
| Within ±1 sub-rank | 77.6% |
| Within ±3 sub-rank | 93.9% |
| Within ±5 sub-rank | 97.7% |
| Within ±6 sub-rank | 98.6% |
| Within ±10 sub-rank | 99.6% |

Accuracy by tier:

| Tier range | n | MAE |
|------------|---|-----|
| Low (1-4)  | 404 | 3.68 sub-ranks |
| Mid (5-7)  | 777 | 2.91 sub-ranks |
| High (8-11)| 25,556 | 0.98 sub-ranks |

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
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let prediction = predict_rank_for_account(&state, account_id).await?;

    Ok(Json(RankPredictResponse {
        prediction,
        matches_used: N_MATCHES,
    }))
}

pub(crate) async fn predict_rank_for_account(
    state: &AppState,
    account_id: u32,
) -> APIResult<RankPrediction> {
    let predictor = state.rank_predictor.as_ref().ok_or_else(|| {
        APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "Rank prediction model is not loaded.",
        )
    })?;

    let matches = fetch_matches(
        &state.batchers.rank_predict_matches,
        &state.ch_client_ro,
        account_id,
    )
    .await?;

    let features = aggregate_features(&matches).ok_or_else(|| {
        APIError::status_msg(
            StatusCode::UNPROCESSABLE_ENTITY,
            format!(
                "Not enough eligible matches for prediction (found {}, need {N_MATCHES}).",
                matches.len()
            ),
        )
    })?;

    predictor
        .predict(features)
        .map_err(|e: RankPredictorError| APIError::internal(format!("Inference failed: {e}")))
}

#[derive(Debug, Default, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankPredictImageFormat {
    #[default]
    Png,
    Webp,
}

impl RankPredictImageFormat {
    fn suffix(self) -> &'static str {
        match self {
            Self::Png => "",
            Self::Webp => "_webp",
        }
    }
}

#[derive(Debug, Default, Deserialize, utoipa::IntoParams)]
pub(crate) struct RankPredictImageQuery {
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    format: RankPredictImageFormat,
}

#[utoipa::path(
    get,
    path = "/{account_id}/rank-predict/image",
    params(AccountIdQuery, RankPredictImageQuery),
    responses(
        (status = OK, description = "Predicted rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected or endpoint unavailable"),
        (status = NOT_FOUND, description = "No image available for the predicted rank"),
        (status = UNPROCESSABLE_ENTITY, description = "Not enough recent ranked matches (need 30)"),
        (status = SERVICE_UNAVAILABLE, description = "Rank prediction model not loaded"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Prediction failed"),
    ),
    tags = ["Players"],
    summary = "Rank Predict Image",
    description = "Returns the predicted rank badge image directly (binary), not a URL. Use `?format=webp` for WebP."
)]
pub(super) async fn rank_predict_image(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(RankPredictImageQuery { format }): Query<RankPredictImageQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let prediction = predict_rank_for_account(&state, account_id).await?;
    serve_rank_image(&state, prediction.badge, format).await
}

async fn serve_rank_image(
    state: &AppState,
    badge: i32,
    format: RankPredictImageFormat,
) -> APIResult<(HeaderMap, Bytes)> {
    let rank = badge / 10;
    let subrank = badge % 10;
    let suffix = format.suffix();

    let image_url = state
        .assets_client
        .fetch_ranks()
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch ranks: {e}")))?
        .iter()
        .find(|r| r.tier == u32::try_from(rank).unwrap_or_default())
        .and_then(|r| {
            r.images
                .get(&format!("large_subrank{subrank}{suffix}"))
                .or(r.images.get(&format!("small_subrank{subrank}{suffix}")))
                .cloned()
        })
        .ok_or_else(|| {
            APIError::status_msg(
                StatusCode::NOT_FOUND,
                "No image available for the predicted rank.",
            )
        })?;

    let response = reqwest::get(&image_url)
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch rank image: {e}")))?;

    if !response.status().is_success() {
        return Err(APIError::internal(format!(
            "Rank image request failed with status {}",
            response.status()
        )));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_owned();

    let bytes: Bytes = response
        .bytes()
        .await
        .map_err(|e| APIError::internal(format!("Failed to read rank image bytes: {e}")))?;

    let mut headers = HeaderMap::new();
    if let Ok(value) = content_type.parse() {
        headers.insert(header::CONTENT_TYPE, value);
    }
    Ok((headers, bytes))
}

const MAX_AVG_ACCOUNT_IDS: usize = 12;

fn deserialize_account_ids<'de, D>(deserializer: D) -> Result<Vec<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = String::deserialize(deserializer)?;
    raw.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.parse::<u32>().map_err(serde::de::Error::custom))
        .collect()
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub(crate) struct RankPredictAvgImageQuery {
    /// Comma-separated list of account IDs (max 12).
    #[serde(deserialize_with = "deserialize_account_ids")]
    account_ids: Vec<u32>,
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    format: RankPredictImageFormat,
}

#[utoipa::path(
    get,
    path = "/rank-predict/image",
    params(RankPredictAvgImageQuery),
    responses(
        (status = OK, description = "Average predicted rank badge image", content(
            ([u8] = "image/png"),
            ([u8] = "image/webp"),
        )),
        (status = BAD_REQUEST, description = "Invalid or missing account IDs"),
        (status = FORBIDDEN, description = "One of the users is protected"),
        (status = NOT_FOUND, description = "No image available for the predicted rank"),
        (status = UNPROCESSABLE_ENTITY, description = "Not enough recent ranked matches for one or more accounts"),
        (status = SERVICE_UNAVAILABLE, description = "Rank prediction model not loaded"),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Prediction failed"),
    ),
    tags = ["Players"],
    summary = "Rank Predict Avg Image",
    description = "Returns the average predicted rank badge image (binary) for a comma-separated list of account IDs. Use `?format=webp` for WebP."
)]
pub(super) async fn rank_predict_avg_image(
    Query(RankPredictAvgImageQuery {
        account_ids,
        format,
    }): Query<RankPredictAvgImageQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if account_ids.is_empty() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "At least one account ID is required.",
        ));
    }
    if account_ids.len() > MAX_AVG_ACCOUNT_IDS {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Too many account IDs (max {MAX_AVG_ACCOUNT_IDS})."),
        ));
    }

    let unique_ids: Vec<u32> = account_ids.into_iter().unique().collect();

    for &account_id in &unique_ids {
        if state
            .steam_client
            .is_user_protected(&state.pg_client, account_id)
            .await?
        {
            return Err(APIError::protected_user());
        }
    }

    let predictions = futures::future::try_join_all(
        unique_ids
            .iter()
            .map(|&account_id| predict_rank_for_account(&state, account_id)),
    )
    .await?;

    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
    let avg_idx = {
        let sum: f32 = predictions.iter().map(|p| p.raw_score).sum();
        (sum / predictions.len() as f32).round() as i32
    };
    let avg_badge = idx_to_badge(avg_idx);

    serve_rank_image(&state, avg_badge, format).await
}
