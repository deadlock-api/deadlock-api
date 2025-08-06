use axum::Json;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use serde::Deserialize;
use tracing::debug;
use utoipa::IntoParams;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::mmr_history::MMRHistory;
use crate::utils::parse::comma_separated_deserialize;

#[derive(Deserialize, IntoParams, Clone)]
pub(crate) struct AccountIdsQuery {
    /// Comma separated list of account ids, Account IDs are in `SteamID3` format.
    #[param(inline, min_items = 1, max_items = 10_000)]
    #[serde(deserialize_with = "comma_separated_deserialize")]
    pub(crate) account_ids: Vec<u32>,
}

#[derive(Deserialize, IntoParams, Default, Clone, Eq, PartialEq, Hash)]
pub(super) struct HeroMMRQuery {
    /// The hero ID to fetch the MMR history for. See more: <https://assets.deadlock-api.com/v2/heroes>
    hero_id: u8,
}

fn build_mmr_query(account_ids: &[u32]) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "
    SELECT account_id, match_id, start_time, player_score, rank, division, division_tier
    FROM mmr_history
    WHERE account_id IN ({account_ids})
    ORDER BY match_id DESC
    LIMIT 1 BY account_id
    "
    )
}

fn build_hero_mmr_query(account_ids: &[u32], hero_id: u8) -> String {
    let account_ids = account_ids
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "
    SELECT account_id, match_id, start_time, player_score, rank, division, division_tier
    FROM hero_mmr_history
    WHERE hero_id = {hero_id} AND account_id IN ({account_ids})
    ORDER BY match_id DESC
    LIMIT 1 BY account_id
    "
    )
}

async fn get_mmr(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
) -> APIResult<Vec<MMRHistory>> {
    let query = build_mmr_query(account_ids);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

async fn get_hero_mmr(
    ch_client: &clickhouse::Client,
    account_ids: &[u32],
    hero_id: u8,
) -> APIResult<Vec<MMRHistory>> {
    let query = build_hero_mmr_query(account_ids, hero_id);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/mmr",
    params(AccountIdsQuery),
    responses(
        (status = OK, description = "MMR", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mmr")
    ),
    tags = ["Players"],
    summary = "MMR",
    description = "
# STOP! READ THIS FIRST!

Please be very careful when using this endpoint and make yourself familiar with the way we calculate the MMR.

You can see our calculation script here: https://github.com/deadlock-api/deadlock-api-tools/blob/master/mmr-calc/mmr_calc.py

In short what we do:
1. Starting at the first match that has avg_team_badge assigned
2. We compare the avg_team_badge from metadata file and the average MMR from our database
    (If a player is not yet in our MMR database, we use the average MMR of the team)
3. From 2. we get an error (delta) and we calculate the error back to every player
4. We assign the error to the player and calculate the new MMR
5. We repeat 2-4 for every match

Player Score is the index for this array

    [0,11,12,13,14,15,16,21,22,23,24,25,26,31,32,33,34,35,36,41,42,43,44,45,46,51,52,53,54,55,56,61,62,63,64,65,66,71,72,73,74,75,76,81,82,83,84,85,86,91,92,93,94,95,96,101,102,103,104,105,106,111,112,113,114,115,116]

which is the order of all ranks.
So to get the rank we get the closest index from the player score.

**Example:**
- Player Score: 7.8 -> Index 8 -> Rank 22
- Player Score: 7.2 -> Index 7 -> Rank 21

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    ",
)]
pub(super) async fn mmr(
    Query(AccountIdsQuery { account_ids }): Query<AccountIdsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_mmr(&state.ch_client_ro, &account_ids).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/mmr/{hero_id}",
    params(AccountIdsQuery, HeroMMRQuery),
    responses(
        (status = OK, description = "Hero MMR", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr")
    ),
    tags = ["Players"],
    summary = "Hero MMR",
    description = "
# STOP! READ THIS FIRST!

Please be very careful when using this endpoint and make yourself familiar with the way we calculate the MMR.

You can see our calculation script here: https://github.com/deadlock-api/deadlock-api-tools/blob/master/mmr-calc/mmr_calc.py

In short what we do:
1. Starting at the first match that has avg_team_badge assigned
2. We compare the avg_team_badge from metadata file and the average MMR from our database
    (If a player is not yet in our MMR database, we use the average MMR of the team)
3. From 2. we get an error (delta) and we calculate the error back to every player
4. We assign the error to the player and calculate the new MMR
5. We repeat 2-4 for every match

Player Score is the index for this array

    [0,11,12,13,14,15,16,21,22,23,24,25,26,31,32,33,34,35,36,41,42,43,44,45,46,51,52,53,54,55,56,61,62,63,64,65,66,71,72,73,74,75,76,81,82,83,84,85,86,91,92,93,94,95,96,101,102,103,104,105,106,111,112,113,114,115,116]

which is the order of all ranks.
So to get the rank we get the closest index from the player score.

**Example:**
- Player Score: 7.8 -> Index 8 -> Rank 22
- Player Score: 7.2 -> Index 7 -> Rank 21

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    ",
)]
pub(super) async fn hero_mmr(
    Path(HeroMMRQuery { hero_id }): Path<HeroMMRQuery>,
    Query(AccountIdsQuery { account_ids }): Query<AccountIdsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_mmr(&state.ch_client_ro, &account_ids, hero_id)
        .await
        .map(Json)
}
