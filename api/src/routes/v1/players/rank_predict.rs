use core::time::Duration;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock};

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use clickhouse::Row;
use itertools::Itertools;
use metrics::{counter, gauge, histogram};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot};
use tracing::{debug, warn};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::rank_predictor::{RankPrediction, RankPredictor, badge_to_idx};
use crate::utils::types::AccountIdQuery;

const N_MATCHES: usize = 30;
const RECENCY_ALPHA: f64 = 0.85;
const BATCH_WINDOW_MS: u64 = 100;
const MAX_BATCH_SIZE: usize = 1000;

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
    account_id: u32,
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

#[derive(Debug, Clone, Row, Deserialize)]
struct PlayerCreepRow {
    account_id: u32,
    match_id: u64,
    max_creep_kills: u32,
    max_possible_creeps: u32,
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
    cs_efficiency: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct RankPredictResponse {
    #[serde(flatten)]
    pub(crate) prediction: RankPrediction,
    /// Number of recent matches used for the prediction
    pub(crate) matches_used: usize,
}

struct RankPredictBatchRequest {
    account_id: u32,
    response_tx: oneshot::Sender<APIResult<RankPredictResponse>>,
}

pub(crate) struct RankPredictBatcher {
    tx: mpsc::Sender<RankPredictBatchRequest>,
}

impl Clone for RankPredictBatcher {
    fn clone(&self) -> Self {
        Self {
            tx: self.tx.clone(),
        }
    }
}

impl RankPredictBatcher {
    pub(crate) fn new(ch_client: clickhouse::Client, predictor: Arc<RankPredictor>) -> Self {
        let (tx, rx) = mpsc::channel(4096);
        tokio::spawn(batch_loop(ch_client, predictor, rx));
        Self { tx }
    }

    pub(crate) async fn load(&self, account_id: u32) -> APIResult<RankPredictResponse> {
        let (response_tx, response_rx) = oneshot::channel();
        self.tx
            .send(RankPredictBatchRequest {
                account_id,
                response_tx,
            })
            .await
            .map_err(|_| APIError::internal("Rank predict batcher unavailable"))?;
        counter!("rank_predict_batcher.requests").increment(1);
        response_rx
            .await
            .map_err(|_| APIError::internal("Rank predict batcher dropped response"))?
    }
}

fn batch_window(prev_batch_size: usize) -> Duration {
    if prev_batch_size >= MAX_BATCH_SIZE {
        Duration::ZERO
    } else {
        Duration::from_millis(BATCH_WINDOW_MS)
    }
}

async fn batch_loop(
    ch_client: clickhouse::Client,
    predictor: Arc<RankPredictor>,
    mut rx: mpsc::Receiver<RankPredictBatchRequest>,
) {
    let mut prev_batch_size: usize = 0;

    while let Some(first) = rx.recv().await {
        let mut pending = vec![first];

        let window = batch_window(prev_batch_size);
        let deadline = tokio::time::Instant::now() + window;
        loop {
            if pending.len() >= MAX_BATCH_SIZE {
                break;
            }
            match tokio::time::timeout_at(deadline, rx.recv()).await {
                Ok(Some(req)) => pending.push(req),
                Ok(None) | Err(_) => break,
            }
        }

        prev_batch_size = pending.len();
        gauge!("rank_predict_batcher.window_ms").set(window.as_secs_f64() * 1000.0);

        let ch = ch_client.clone();
        let pred = predictor.clone();
        tokio::spawn(async move { execute_batch(&ch, &pred, pending).await });
    }
}

#[allow(clippy::cast_precision_loss)]
async fn execute_batch(
    ch_client: &clickhouse::Client,
    predictor: &RankPredictor,
    pending: Vec<RankPredictBatchRequest>,
) {
    let batch_size = pending.len();
    let mut senders: HashMap<u32, Vec<oneshot::Sender<APIResult<RankPredictResponse>>>> =
        HashMap::new();
    for req in pending {
        senders
            .entry(req.account_id)
            .or_default()
            .push(req.response_tx);
    }

    let unique_ids = senders.len();
    histogram!("rank_predict_batcher.batch_size").record(batch_size as f64);
    histogram!("rank_predict_batcher.unique_ids").record(unique_ids as f64);
    counter!("rank_predict_batcher.batches").increment(1);

    let account_ids: Vec<u32> = senders.keys().copied().collect();

    let start = tokio::time::Instant::now();
    let result = fetch_matches_batch(ch_client, &account_ids).await;
    histogram!("rank_predict_batcher.query_duration_seconds").record(start.elapsed().as_secs_f64());

    let matches_by_account = match result {
        Ok(m) => m,
        Err(e) => {
            counter!("rank_predict_batcher.errors").increment(1);
            warn!("Rank predict batch query failed: {e}");
            for (_, txs) in senders {
                for tx in txs {
                    let _ = tx.send(Err(APIError::internal("Batch query failed")));
                }
            }
            return;
        }
    };

    for (account_id, txs) in senders {
        let maybe_response = if let Some(matches) = matches_by_account.get(&account_id) {
            match aggregate_features(matches) {
                Some(features) => match predictor.predict(features) {
                    Ok(prediction) => Ok(RankPredictResponse {
                        prediction,
                        matches_used: N_MATCHES,
                    }),
                    Err(e) => Err((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Inference failed: {e}"),
                    )),
                },
                None => Err((
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!(
                        "Not enough eligible matches for prediction (found {}, need {N_MATCHES}).",
                        matches.len()
                    ),
                )),
            }
        } else {
            counter!("rank_predict_batcher.not_found").increment(1);
            Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Not enough eligible matches for prediction (found 0, need {N_MATCHES})."),
            ))
        };

        for tx in txs {
            let result = match &maybe_response {
                Ok(resp) => Ok(resp.clone()),
                Err((status, msg)) => Err(APIError::status_msg(*status, msg.clone())),
            };
            let _ = tx.send(result);
        }
    }
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::too_many_lines
)]
async fn fetch_matches_batch(
    ch: &clickhouse::Client,
    account_ids: &[u32],
) -> clickhouse::error::Result<HashMap<u32, Vec<Match>>> {
    if account_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let ids_csv: String = account_ids.iter().map(ToString::to_string).join(", ");
    let query = format!(
        "SELECT
            pmh.account_id,
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
        WHERE pmh.account_id IN ({ids_csv})
          AND pmh.match_mode IN ('Ranked', 'Unranked')
          AND pmh.game_mode = 'Normal'
          AND mi.average_badge_team0 > 0
          AND mi.average_badge_team1 > 0
        ORDER BY pmh.account_id, pmh.match_id DESC
        LIMIT 1 BY pmh.account_id, match_id
        LIMIT {N_MATCHES} BY pmh.account_id",
    );
    debug!("Batch match rows query: {query}");
    let match_rows: Vec<MatchRow> = ch.query(&query).fetch_all().await?;

    let mut rows_by_account: HashMap<u32, Vec<&MatchRow>> = HashMap::new();
    for row in &match_rows {
        rows_by_account.entry(row.account_id).or_default().push(row);
    }
    rows_by_account.retain(|_, rows| rows.len() >= N_MATCHES);

    if rows_by_account.is_empty() {
        return Ok(HashMap::new());
    }

    let enemy_tuples: String = rows_by_account
        .values()
        .flat_map(|rows| rows.iter())
        .map(|r| format!("({}, {})", r.match_id, r.enemy_team))
        .unique()
        .join(", ");
    let enemy_query = format!(
        "SELECT
            match_id,
            team,
            avg(net_worth)         AS nw_avg,
            avg(max_player_damage) AS dmg_avg
        FROM match_player
        WHERE (match_id, team) IN ({enemy_tuples})
        GROUP BY match_id, team"
    );
    debug!("Batch enemy stats query: {enemy_query}");

    let creep_tuples: String = rows_by_account
        .iter()
        .flat_map(|(&aid, rows)| rows.iter().map(move |r| format!("({aid}, {})", r.match_id)))
        .unique()
        .join(", ");
    let creep_query = format!(
        "SELECT account_id, match_id, max_creep_kills, max_possible_creeps
         FROM match_player
         WHERE (account_id, match_id) IN ({creep_tuples})"
    );
    debug!("Batch player creep stats query: {creep_query}");

    let (enemy_stats, creep_rows): (Vec<EnemyStatsRow>, Vec<PlayerCreepRow>) = tokio::try_join!(
        ch.query(&enemy_query).fetch_all(),
        ch.query(&creep_query).fetch_all(),
    )?;

    let enemy_map: HashMap<(u64, i8), &EnemyStatsRow> = enemy_stats
        .iter()
        .map(|e| ((e.match_id, e.team), e))
        .collect();
    let creep_map: HashMap<(u32, u64), &PlayerCreepRow> = creep_rows
        .iter()
        .map(|c| ((c.account_id, c.match_id), c))
        .collect();
    let result = rows_by_account
        .into_iter()
        .map(|(account_id, rows)| {
            let matches = rows
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
                    let cs_efficiency = creep_map.get(&(account_id, r.match_id)).map(|c| {
                        f64::from(c.max_creep_kills) / f64::from(c.max_possible_creeps.max(1))
                    });
                    Match {
                        hero_id: r.hero_id,
                        player_kills: r.player_kills,
                        duration_s: r.match_duration_s,
                        own_team_badge: f64::from(badge_to_idx(own_raw)),
                        enemy_team_badge: f64::from(badge_to_idx(enemy_raw)),
                        enemy_nw_avg: enemy_nw,
                        enemy_dmg_avg: enemy_dmg,
                        cs_efficiency,
                    }
                })
                .collect();
            (account_id, matches)
        })
        .collect();

    Ok(result)
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
fn aggregate_features(matches: &[Match]) -> Option<[f64; 17]> {
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
    let batcher = state.rank_predict_batcher.as_ref().ok_or_else(|| {
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

    batcher.load(account_id).await.map(Json)
}
