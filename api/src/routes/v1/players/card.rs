use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use cached::TimedCache;
use cached::proc_macro::cached;
use itertools::Itertools;
use serde::Serialize;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgCitadelProfileCard, CMsgClientToGcGetProfileCard, EgcCitadelClientMessages,
    c_msg_citadel_profile_card,
};

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::{
    SteamProxyQuery, SteamProxyRawResponse, SteamProxyResponse, SteamProxyResult,
};
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Serialize, ToSchema)]
struct PlayerCardSlotStat {
    stat_id: Option<i32>,
    stat_score: Option<u32>,
}

impl From<c_msg_citadel_profile_card::slot::Stat> for PlayerCardSlotStat {
    fn from(value: c_msg_citadel_profile_card::slot::Stat) -> Self {
        Self {
            stat_id: value.stat_id,
            stat_score: value.stat_score,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct PlayerCardSlotHero {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    id: Option<u32>,
    kills: Option<u32>,
    wins: Option<u32>,
}

impl From<c_msg_citadel_profile_card::slot::Hero> for PlayerCardSlotHero {
    fn from(value: c_msg_citadel_profile_card::slot::Hero) -> Self {
        Self {
            id: value.hero_id,
            wins: value.hero_wins,
            kills: value.hero_kills,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct PlayerCardSlot {
    slot_id: Option<u32>,
    hero: Option<PlayerCardSlotHero>,
    stat: Option<PlayerCardSlotStat>,
}

impl From<c_msg_citadel_profile_card::Slot> for PlayerCardSlot {
    fn from(value: c_msg_citadel_profile_card::Slot) -> Self {
        Self {
            slot_id: value.slot_id,
            hero: value.hero.map(Into::into),
            stat: value.stat.map(Into::into),
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct PlayerCard {
    account_id: Option<u32>,
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    ranked_badge_level: Option<u32>,
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    ranked_rank: Option<u32>,
    /// See more: <https://assets.deadlock-api.com/v2/ranks>
    ranked_subrank: Option<u32>,
    slots: Vec<PlayerCardSlot>,
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
    ty = "TimedCache<u32, SteamProxyRawResponse>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(5 * 60)) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn fetch_player_card_raw(
    steam_client: &SteamClient,
    account_id: u32,
) -> SteamProxyResult<SteamProxyRawResponse> {
    let msg = CMsgClientToGcGetProfileCard {
        account_id: Some(account_id),
        dev_access_hint: None,
        friend_access_hint: None,
    };
    steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetProfileCard,
            msg,
            in_all_groups: Some(vec!["LowRateLimitApis".to_owned()]),
            in_any_groups: None,
            cooldown_time: Duration::from_secs(10),
            request_timeout: Duration::from_secs(2),
            username: None,
        })
        .await
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
    description = "
This endpoint returns the player card for the given `account_id`, serialized as protobuf message.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetProfileCard
- CMsgCitadelProfileCard

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/min |
| Key | 20req/min & 800req/h |
| Global | 200req/min |
    "
)]
pub(super) async fn card_raw(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "card",
            &[
                Quota::ip_limit(5, Duration::from_secs(60)),
                Quota::key_limit(20, Duration::from_secs(60)),
                Quota::key_limit(800, Duration::from_secs(60 * 60)),
                Quota::global_limit(200, Duration::from_secs(60)),
            ],
        )
        .await?;
    let steam_response =
        tryhard::retry_fn(|| fetch_player_card_raw(&state.steam_client, account_id))
            .retries(3)
            .fixed_backoff(Duration::from_millis(10))
            .await?;
    Ok(BASE64_STANDARD.decode(&steam_response.data)?)
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
    description = "
This endpoint returns the player card for the given `account_id`.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetProfileCard
- CMsgCitadelProfileCard

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/min |
| Key | 20req/min & 800req/h |
| Global | 200req/min |
    "
)]
pub(super) async fn card(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "card",
            &[
                Quota::ip_limit(5, Duration::from_secs(60)),
                Quota::key_limit(20, Duration::from_secs(60)),
                Quota::key_limit(800, Duration::from_secs(60 * 60)),
                Quota::global_limit(200, Duration::from_secs(60)),
            ],
        )
        .await?;
    let raw_data = tryhard::retry_fn(|| fetch_player_card_raw(&state.steam_client, account_id))
        .retries(3)
        .fixed_backoff(Duration::from_millis(10))
        .await?;
    let proto_player_card: SteamProxyResponse<CMsgCitadelProfileCard> = raw_data.try_into()?;
    let player_card: PlayerCard = proto_player_card.msg.into();
    Ok(Json(player_card))
}
