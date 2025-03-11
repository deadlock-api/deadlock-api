use crate::config::Config;
use crate::error::{APIError, APIResult};
use crate::routes::v1::players::types::AccountIdQuery;
use crate::state::AppState;
use crate::utils;
use crate::utils::limiter::{RateLimitQuota, apply_limits};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use itertools::Itertools;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgCitadelProfileCard, CMsgClientToGcGetProfileCard, EgcCitadelClientMessages,
    c_msg_citadel_profile_card,
};

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PlayerCardSlotStat {
    pub stat_id: Option<i32>,
    pub stat_score: Option<u32>,
}

impl From<c_msg_citadel_profile_card::slot::Stat> for PlayerCardSlotStat {
    fn from(value: c_msg_citadel_profile_card::slot::Stat) -> Self {
        Self {
            stat_id: value.stat_id,
            stat_score: value.stat_score,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PlayerCardSlotHero {
    pub hero_id: Option<u32>,
    pub hero_kills: Option<u32>,
    pub hero_wins: Option<u32>,
}

impl From<c_msg_citadel_profile_card::slot::Hero> for PlayerCardSlotHero {
    fn from(value: c_msg_citadel_profile_card::slot::Hero) -> Self {
        Self {
            hero_id: value.hero_id,
            hero_wins: value.hero_wins,
            hero_kills: value.hero_kills,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PlayerCardSlot {
    pub slot_id: Option<u32>,
    pub hero: Option<PlayerCardSlotHero>,
    pub stat: Option<PlayerCardSlotStat>,
}

impl From<c_msg_citadel_profile_card::Slot> for PlayerCardSlot {
    fn from(value: c_msg_citadel_profile_card::Slot) -> Self {
        Self {
            slot_id: value.slot_id,
            hero: value.hero.map(|r| r.into()),
            stat: value.stat.map(|r| r.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PlayerCard {
    pub account_id: Option<u32>,
    pub ranked_badge_level: Option<u32>,
    pub ranked_rank: Option<u32>,
    pub ranked_subrank: Option<u32>,
    pub slots: Vec<PlayerCardSlot>,
}

impl From<CMsgCitadelProfileCard> for PlayerCard {
    fn from(value: CMsgCitadelProfileCard) -> Self {
        Self {
            account_id: value.account_id,
            ranked_badge_level: value.ranked_badge_level,
            ranked_rank: value.ranked_badge_level.map(|b| b / 10),
            ranked_subrank: value.ranked_badge_level.map(|b| b % 10),
            slots: value.slots.into_iter().map_into().collect(),
        }
    }
}

#[cached(
    ty = "TimedCache<u32, Vec<u8>>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn fetch_player_card_raw(
    config: &Config,
    http_client: &reqwest::Client,
    account_id: u32,
) -> APIResult<Vec<u8>> {
    let msg = CMsgClientToGcGetProfileCard {
        account_id: Some(account_id),
        dev_access_hint: None,
        friend_access_hint: None,
    };
    utils::steam::call_steam_proxy(
        config,
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcGetProfileCard,
        msg,
        &["LowRateLimitApis"],
        Duration::from_secs(10),
        Duration::from_secs(2),
    )
    .await
    .map_err(|e| APIError::InternalError {
        message: format!("Failed to fetch player card: {e}"),
    })
    .and_then(|r| {
        BASE64_STANDARD
            .decode(&r.data)
            .map_err(|e| APIError::InternalError {
                message: format!("Failed to decode player card: {e}"),
            })
    })
}

async fn parse_player_card_raw(raw_data: &[u8]) -> APIResult<PlayerCard> {
    CMsgCitadelProfileCard::decode(raw_data)
        .map(|r| r.into())
        .map_err(|e| APIError::InternalError {
            message: format!("Failed to parse player card: {e}"),
        })
}

#[utoipa::path(
    get,
    path = "/{account_id}/card/raw",
    params(AccountIdQuery),
    responses(
        (status = OK, body = [u8]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching player card failed")
    ),
    tags = ["Players"],
    summary = "Card as Protobuf",
    description = r#"
This endpoint returns the player card for the given `account_id`, serialized as protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetProfileCard
- CMsgCitadelProfileCard
    "#
)]
pub async fn card_raw(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "card",
        &[RateLimitQuota::ip_limit(100, Duration::from_secs(1))],
    )
    .await?;
    tryhard::retry_fn(|| fetch_player_card_raw(&state.config, &state.http_client, account_id))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await
}

#[utoipa::path(
    get,
    path = "/{account_id}/card",
    params(AccountIdQuery),
    responses(
        (status = OK, body = [PlayerCard]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching match history failed")
    ),
    tags = ["Players"],
    summary = "Card",
    description = r#"
This endpoint returns the player card for the given `account_id`.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetProfileCard
- CMsgCitadelProfileCard
    "#
)]
pub async fn card(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    apply_limits(
        &headers,
        &state,
        "card",
        &[RateLimitQuota::ip_limit(100, Duration::from_secs(1))],
    )
    .await?;
    let raw_data =
        tryhard::retry_fn(|| fetch_player_card_raw(&state.config, &state.http_client, account_id))
            .retries(3)
            .fixed_backoff(Duration::from_millis(10))
            .await?;
    parse_player_card_raw(&raw_data).await.map(Json)
}
