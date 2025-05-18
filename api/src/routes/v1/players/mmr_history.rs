use crate::error::APIResult;
use crate::routes::v1::players::types::AccountIdQuery;
use crate::state::AppState;
use crate::utils::parse::parse_steam_id;
use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use tracing::debug;
use utoipa::{IntoParams, ToSchema};

#[derive(Deserialize, IntoParams, Default)]
pub struct HeroMMRHistoryQuery {
    /// The players SteamID3
    #[serde(default)]
    #[serde(deserialize_with = "parse_steam_id")]
    pub account_id: u32,
    /// The hero ID to fetch the MMR history for.
    pub hero_id: u8,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize, ToSchema)]
pub struct MMRHistory {
    pub match_id: u64,
    /// Player Score is the index for the rank array (internally used for the rank regression)
    pub player_score: f32,
    /// The Player Rank
    pub rank: u32,
    /// Extracted from the rank the division (rank // 10)
    pub division: u32,
    /// Extracted from the rank the division tier (rank % 10)
    pub division_tier: u32,
}

fn build_mmr_history_query(account_id: u32) -> String {
    format!(
        r#"
    SELECT match_id, player_score, rank, division, division_tier
    FROM mmr_history FINAL
    WHERE account_id = {account_id}
    ORDER BY match_id
    "#
    )
}

fn build_hero_mmr_history_query(account_id: u32, hero_id: u8) -> String {
    format!(
        r#"
    SELECT match_id, player_score, rank, division, division_tier
    FROM hero_mmr_history FINAL
    WHERE account_id = {account_id} AND hero_id = {hero_id}
    ORDER BY match_id
    "#
    )
}

#[cached(
    ty = "TimedCache<u32, Vec<MMRHistory>>",
    create = "{ TimedCache::with_lifespan(5 * 60) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn get_mmr_history(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> APIResult<Vec<MMRHistory>> {
    let query = build_mmr_history_query(account_id);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[cached(
    ty = "TimedCache<(u32, u8), Vec<MMRHistory>>",
    create = "{ TimedCache::with_lifespan(5 * 60) }",
    result = true,
    convert = "{ (account_id, hero_id) }",
    sync_writes = "by_key",
    key = "(u32, u8)"
)]
async fn get_hero_mmr_history(
    ch_client: &clickhouse::Client,
    account_id: u32,
    hero_id: u8,
) -> APIResult<Vec<MMRHistory>> {
    let query = build_hero_mmr_history_query(account_id, hero_id);
    debug!(?query);
    Ok(ch_client.query(&query).fetch_all().await?)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history",
    params(AccountIdQuery),
    responses(
        (status = OK, description = "MMR History", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch mmr history")
    ),
    tags = ["Players"],
    summary = "MMR History",
    description = r#"
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
"#,
)]
pub async fn mmr_history(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_mmr_history(&state.ch_client, account_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/{account_id}/mmr-history/{hero_id}",
    params(HeroMMRHistoryQuery),
    responses(
        (status = OK, description = "Hero MMR History", body = [MMRHistory]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR, description = "Failed to fetch hero mmr history")
    ),
    tags = ["Players"],
    summary = "Hero MMR History",
    description = r#"
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
"#,
)]
pub async fn hero_mmr_history(
    Path(path): Path<HeroMMRHistoryQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    get_hero_mmr_history(&state.ch_client, path.account_id, path.hero_id)
        .await
        .map(Json)
}
