use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use cached::macros::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::ch_cost::TrackedQuery as _;
use crate::services::protected_accounts::ensure_not_protected;
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Row, Deserialize)]
struct ClusterMonthRow {
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

/// The player's matches per month and server cluster, with each cluster's region from the demo
/// headers (`server_clusters_dict`). Reads only the player's rows (~1k rows, ~10 ms).
#[cached(
    max_size = 10_000,
    ttl_secs = 600,
    sync_writes = "by_key",
    convert = "{ account_id }",
    key = "u32"
)]
async fn fetch_cluster_months(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<Vec<PlayerClusterMonth>> {
    let rows = ch_client
        .query(
            "
            SELECT
                toUInt32(toUnixTimestamp(toDateTime(month, 'UTC'))) AS month,
                cluster_id,
                dictGet('default.server_clusters_dict', 'region', toUInt64(cluster_id)) AS region,
                dictGet('default.server_clusters_dict', 'datacenter', toUInt64(cluster_id)) AS datacenter,
                sum(matches) AS matches
            FROM player_cluster_matches
            WHERE account_id = ?
            GROUP BY month, cluster_id
            ORDER BY month DESC, matches DESC, cluster_id
            SETTINGS log_comment = 'player_region'
            ",
        )
        .bind(account_id)
        .fetch_all_tracked::<ClusterMonthRow>()
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| PlayerClusterMonth {
            month: row.month,
            cluster_id: row.cluster_id,
            region: (!row.region.is_empty()).then_some(row.region),
            datacenter: (!row.datacenter.is_empty()).then_some(row.datacenter),
            matches: row.matches,
        })
        .collect())
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
    description = "
The server region a player plays in, from the game servers of their matches.

Each match's server cluster comes from its salts, and the cluster's region and datacenter from the
server names in replays. `region` is the region with the most matches in the player's latest month
with a known region; `history` lists their matches per month and cluster, so region changes show
up month by month.

Only matches with known salts count. Clusters not yet seen in a replay have no region.
"
)]
pub(super) async fn region(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<Json<PlayerRegionResponse>> {
    ensure_not_protected(&state, &[account_id]).await?;

    let history = fetch_cluster_months(&state.ch_client_ro, account_id).await?;
    let current = current_region(&history);
    Ok(Json(PlayerRegionResponse {
        account_id,
        region_month: current.as_ref().map(|(_, month)| *month),
        region: current.map(|(region, _)| region),
        history,
    }))
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
}
