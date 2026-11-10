use core::time::Duration;
use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum_extra::extract::Query;
use cached::macros::cached;
use clickhouse::Row;
use clickhouse_utils::{BatchQueryMulti, ClickhouseBatcherMulti, in_clause};
use itertools::Itertools as _;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::rank::{account_cost, check_account_id_count};
use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::protected_accounts::{ensure_not_protected, without_protected};
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::rate_limiter::{Limits, Quota, RateLimit, Scope, describe};
use crate::utils::sql::POINT_LOOKUP_MAX_THREADS;
use crate::utils::types::AccountIdQuery;

/// Shared by both region endpoints and charged per requested account, since the `ClickHouse`
/// work scales with accounts, not requests: a 1000-account batch costs a thousand single lookups.
const RATE_LIMIT: RateLimit = RateLimit::new(
    "region",
    &[
        Quota::new(Scope::Ip, 10_000, Duration::from_mins(1)),
        Quota::new(Scope::Ip, 100_000, Duration::from_hours(1)),
        Quota::new(Scope::Key, 50_000, Duration::from_mins(1)),
        Quota::new(Scope::Key, 500_000, Duration::from_hours(1)),
        Quota::new(Scope::Global, 60_000, Duration::from_mins(1)),
    ],
);

fn rate_limits() -> Limits<'static> {
    Limits::from(RATE_LIMIT).unit(" accounts").note(
        "Shared by both region endpoints. Each requested account counts as one, so a batch of \
         100 accounts uses as much as 100 single lookups.",
    )
}

const MAX_BATCH_ACCOUNT_IDS: usize = 1_000;

#[derive(Debug, Clone, Row, Deserialize)]
pub(crate) struct ClusterMonthRow {
    account_id: u32,
    month: u32,
    cluster_id: u32,
    region: String,
    datacenter: String,
    matches: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub(crate) struct PlayerClusterMonth {
    /// Unix timestamp of the first day of the month (UTC).
    month: u32,
    /// The server cluster the matches were played on.
    cluster_id: u32,
    /// Region of the cluster's servers, e.g. `eu_west` or `us_north_central`. `null` if the
    /// cluster has not been seen in a replay yet.
    region: Option<String>,
    /// Datacenter(s) of the cluster's servers, e.g. `fra2`; comma-separated if the cluster spans
    /// several. `null` if the cluster has not been seen in a replay yet.
    datacenter: Option<String>,
    /// Number of the player's matches on this cluster in this month.
    matches: u64,
}

impl From<ClusterMonthRow> for PlayerClusterMonth {
    fn from(row: ClusterMonthRow) -> Self {
        Self {
            month: row.month,
            cluster_id: row.cluster_id,
            region: (!row.region.is_empty()).then_some(row.region),
            datacenter: (!row.datacenter.is_empty()).then_some(row.datacenter),
            matches: row.matches,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct PlayerRegionResponse {
    account_id: u32,
    /// The region the player played most matches in during their latest month with a known
    /// region. `null` if none of their matches has a known region.
    region: Option<String>,
    /// Unix timestamp of the month `region` was taken from.
    region_month: Option<u32>,
    /// Matches per month and server cluster, newest month first.
    history: Vec<PlayerClusterMonth>,
}

impl PlayerRegionResponse {
    fn new(account_id: u32, history: Vec<PlayerClusterMonth>) -> Self {
        let current = current_region(&history);
        Self {
            account_id,
            region_month: current.as_ref().map(|(_, month)| *month),
            region: current.map(|(region, _)| region),
            history,
        }
    }
}

pub(crate) struct PlayerRegionQuery;

/// The players' matches per month and server cluster, with each cluster's region from the demo
/// headers (`server_clusters_dict`). `player_cluster_matches` is sorted by `account_id`, so each
/// account is a primary-key range of a few 256-row granules (~10 ms for one account).
impl BatchQueryMulti for PlayerRegionQuery {
    type Key = u32;
    type Value = ClusterMonthRow;

    fn build_query(keys: &[u32]) -> String {
        let ids = in_clause(keys);
        format!(
            "
            SELECT
                account_id,
                toUInt32(toUnixTimestamp(toDateTime(month, 'UTC'))) AS month,
                cluster_id,
                dictGet('default.server_clusters_dict', 'region', toUInt64(cluster_id)) AS region,
                dictGet('default.server_clusters_dict', 'datacenter', toUInt64(cluster_id)) AS datacenter,
                sum(matches) AS matches
            FROM player_cluster_matches
            WHERE account_id IN ({ids})
            GROUP BY account_id, month, cluster_id
            SETTINGS log_comment = 'player_region', max_threads = {POINT_LOOKUP_MAX_THREADS}
            "
        )
    }

    fn key_of(value: &ClusterMonthRow) -> u32 {
        value.account_id
    }
}

pub(crate) type PlayerRegionBatcher = ClickhouseBatcherMulti<PlayerRegionQuery>;

/// The player's history, newest month first and most matches first within a month.
#[cached(
    max_size = 10_000,
    ttl_secs = 600,
    convert = "{ account_id }",
    key = "u32"
)]
async fn fetch_history(
    batcher: &PlayerRegionBatcher,
    account_id: u32,
) -> Result<Vec<PlayerClusterMonth>, APIError> {
    let mut history: Vec<PlayerClusterMonth> = batcher
        .load(account_id)
        .await?
        .into_iter()
        .map(PlayerClusterMonth::from)
        .collect();
    history.sort_by(|a, b| {
        b.month
            .cmp(&a.month)
            .then_with(|| b.matches.cmp(&a.matches))
            .then_with(|| a.cluster_id.cmp(&b.cluster_id))
    });
    Ok(history)
}

/// The region with the most matches in the latest month that has any known region; ties go to
/// the greater region name. The same rule as `player_latest_region_dict`.
fn current_region(history: &[PlayerClusterMonth]) -> Option<(String, u32)> {
    let month = history
        .iter()
        .filter(|h| h.region.is_some())
        .map(|h| h.month)
        .max()?;
    let mut per_region: HashMap<&str, u64> = HashMap::new();
    for entry in history.iter().filter(|h| h.month == month) {
        if let Some(region) = entry.region.as_deref() {
            let total = per_region.entry(region).or_default();
            *total = total.saturating_add(entry.matches);
        }
    }
    per_region
        .into_iter()
        .max_by(|(a_region, a_matches), (b_region, b_matches)| {
            a_matches
                .cmp(b_matches)
                .then_with(|| a_region.cmp(b_region))
        })
        .map(|(region, _)| (region.to_owned(), month))
}

#[utoipa::path(
    get,
    path = "/{account_id}/region",
    params(AccountIdQuery),
    responses(
        (status = OK, body = PlayerRegionResponse),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected"),
        (status = INTERNAL_SERVER_ERROR, description = "Region lookup failed"),
    ),
    tags = ["Players"],
    summary = "Region",
    description = describe(
        "
The server region a player plays in, from the game servers of their matches.

Each match's server cluster comes from its salts, and the cluster's region and datacenter from the
server names in replays. `region` is the region with the most matches in the player's latest month
with a known region; `history` lists their matches per month and cluster, newest month first, so
region changes show up month by month.

Only matches with known salts count. Clusters not yet seen in a replay have no region. Valve names
some partner-hosted servers separately (e.g. `dpkt-frankfurt` or `helsinki` next to `eu_west`).
",
        rate_limits(),
    )
)]
pub(super) async fn region(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<Json<PlayerRegionResponse>> {
    state
        .rate_limit_client
        .check(&rate_limit_key, RATE_LIMIT)
        .await?;
    ensure_not_protected(&state, &[account_id]).await?;

    let history = fetch_history(&state.batchers.player_region, account_id).await?;
    Ok(Json(PlayerRegionResponse::new(account_id, history)))
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub(crate) struct RegionBatchQuery {
    /// Comma separated list of account ids, in `SteamID3` or `SteamID64` format.
    #[param(inline, min_items = 1, max_items = 1_000)]
    #[serde(deserialize_with = "steam_id::de::account_ids")]
    account_ids: Vec<u32>,
}

#[utoipa::path(
    get,
    path = "/region",
    params(RegionBatchQuery),
    responses(
        (status = OK, body = [PlayerRegionResponse]),
        (status = BAD_REQUEST, description = "Invalid or missing account IDs"),
        (status = INTERNAL_SERVER_ERROR, description = "Region lookup failed"),
    ),
    tags = ["Players"],
    summary = "Batch Region",
    description = describe(
        "
Returns the server region of each player, the batch form of `/v1/players/{account_id}/region`.
See that endpoint for how the region is derived.

Every requested account is returned once, in no particular order. Players without any match with a
known region get a `null` `region`. Protected accounts are left out.
",
        rate_limits(),
    )
)]
pub(super) async fn region_batch(
    Query(RegionBatchQuery { account_ids }): Query<RegionBatchQuery>,
    State(state): State<AppState>,
    rate_limit_key: RateLimitKey,
) -> APIResult<Json<Vec<PlayerRegionResponse>>> {
    check_account_id_count(&account_ids, MAX_BATCH_ACCOUNT_IDS)?;
    let account_ids: Vec<u32> = account_ids.into_iter().unique().collect();
    state
        .rate_limit_client
        .charge(&rate_limit_key, RATE_LIMIT, account_cost(account_ids.len()))
        .await?;

    let account_ids = without_protected(&state, account_ids).await?;

    let batcher = &state.batchers.player_region;
    let regions = futures::future::try_join_all(account_ids.iter().map(|&account_id| async move {
        fetch_history(batcher, account_id)
            .await
            .map(|history| PlayerRegionResponse::new(account_id, history))
    }))
    .await?;
    Ok(Json(regions))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(
        month: u32,
        cluster_id: u32,
        region: Option<&str>,
        matches: u64,
    ) -> PlayerClusterMonth {
        PlayerClusterMonth {
            month,
            cluster_id,
            region: region.map(str::to_owned),
            datacenter: None,
            matches,
        }
    }

    #[test]
    fn picks_the_top_region_of_the_latest_known_month() {
        let history = [
            entry(300, 999, None, 50),
            entry(200, 271, Some("eu_west"), 3),
            entry(200, 272, Some("eu_west"), 2),
            entry(200, 129, Some("us_north_central"), 4),
            entry(100, 129, Some("us_north_central"), 40),
        ];
        assert_eq!(current_region(&history), Some(("eu_west".to_owned(), 200)));
    }

    #[test]
    fn ties_go_to_the_greater_region_name_and_unknown_only_is_none() {
        let history = [
            entry(200, 271, Some("eu_west"), 2),
            entry(200, 389, Some("us_southwest"), 2),
        ];
        assert_eq!(
            current_region(&history),
            Some(("us_southwest".to_owned(), 200))
        );
        assert_eq!(current_region(&[entry(200, 999, None, 5)]), None);
        assert_eq!(current_region(&[]), None);
    }

    #[test]
    fn empty_history_has_no_region() {
        let response = PlayerRegionResponse::new(7, vec![]);
        assert_eq!(response.region, None);
        assert_eq!(response.region_month, None);
    }
}
