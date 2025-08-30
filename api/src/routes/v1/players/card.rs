use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use clickhouse::Row;
use redis::AsyncTypedCommands;
use serde::Serialize;
use serde_json::json;
use tracing::warn;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgCitadelProfileCard, CMsgClientToGcGetProfileCard, EgcCitadelClientMessages,
    c_msg_citadel_profile_card,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
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
    account_id: u32,
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
            account_id: value.account_id(),
            ranked_badge_level: value.ranked_badge_level,
            ranked_rank: value.ranked_badge_level.map(|b| b / 10),
            ranked_subrank: value.ranked_badge_level.map(|b| b % 10),
            slots: value.slots.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Row)]
struct PlayerCardClickhouse {
    account_id: u32,
    ranked_badge_level: Option<u32>,
    slots_slots_id: Vec<Option<u32>>,
    slots_hero_id: Vec<Option<u32>>,
    slots_hero_kills: Vec<Option<u32>>,
    slots_hero_wins: Vec<Option<u32>>,
    slots_stat_id: Vec<Option<i32>>,
    slots_stat_score: Vec<Option<u32>>,
}

impl From<PlayerCard> for PlayerCardClickhouse {
    fn from(value: PlayerCard) -> Self {
        Self {
            account_id: value.account_id,
            ranked_badge_level: value.ranked_badge_level,
            slots_slots_id: value.slots.iter().map(|s| s.slot_id).collect(),
            slots_hero_id: value
                .slots
                .iter()
                .map(|s| s.hero.as_ref().map(|h| h.id))
                .flatten()
                .collect(),
            slots_hero_kills: value
                .slots
                .iter()
                .map(|s| s.hero.as_ref().map(|h| h.kills))
                .flatten()
                .collect(),
            slots_hero_wins: value
                .slots
                .iter()
                .map(|s| s.hero.as_ref().map(|h| h.wins))
                .flatten()
                .collect(),
            slots_stat_id: value
                .slots
                .iter()
                .map(|s| s.stat.as_ref().map(|h| h.stat_id))
                .flatten()
                .collect(),
            slots_stat_score: value
                .slots
                .iter()
                .map(|s| s.stat.as_ref().map(|h| h.stat_score))
                .flatten()
                .collect(),
        }
    }
}

#[cached(
    ty = "TimedCache<u32, SteamProxyRawResponse>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(60)) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
pub(crate) async fn fetch_player_card_raw(
    steam_client: &SteamClient,
    account_id: u32,
    bot_username: String,
) -> SteamProxyResult<SteamProxyRawResponse> {
    let msg = CMsgClientToGcGetProfileCard {
        account_id: Some(account_id),
        dev_access_hint: None,
        friend_access_hint: true.into(),
    };
    steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetProfileCard,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(10),
            request_timeout: Duration::from_secs(2),
            username: bot_username.into(),
        })
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
    State(mut state): State<AppState>,
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

    let friend_id = i32::try_from(account_id).map_err(|_| {
        APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid account ID".to_owned())
    })?;
    let bot_username = match sqlx::query!(
        "SELECT bot_id FROM bot_friends WHERE friend_id = $1",
        friend_id
    )
    .fetch_one(&state.pg_client)
    .await
    {
        Ok(r) => r.bot_id,
        Err(sqlx::Error::RowNotFound) => {
            let invite_keys = state
                .redis_client
                .keys("invite_link:*")
                .await?
                .into_iter()
                .map(|k| k.to_string())
                .collect::<Vec<_>>();
            let mut invites = vec![];
            for invite_key in invite_keys {
                if let Ok(Some(invite)) = state.redis_client.get(&invite_key).await {
                    invites.push(invite);
                }
            }
            return Err(APIError::StatusMsgJson {
                status: StatusCode::BAD_REQUEST,
                message: json!({
                    "message": "Account ID is not a friend of any bot. Please add the bot as friend first using one of these invites.",
                    "invites": invites,
                }),
            });
        }
        Err(e) => return Err(e.into()),
    };

    let raw_data = tryhard::retry_fn(|| {
        fetch_player_card_raw(&state.steam_client, account_id, bot_username.clone())
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await?;
    let proto_player_card: SteamProxyResponse<CMsgCitadelProfileCard> = raw_data.try_into()?;
    let player_card: PlayerCard = proto_player_card.msg.into();
    let ch_player_card: PlayerCardClickhouse = player_card.clone().into();
    tokio::spawn(async move {
        let Ok(mut inserter) = state
            .ch_client
            .insert::<PlayerCardClickhouse>("player_card")
        else {
            warn!("Failed to create inserter for player card");
            return;
        };
        if let Err(e) = inserter.write(&ch_player_card).await {
            warn!("Failed to insert player card into Clickhouse: {e:?}");
        }
        if let Err(e) = inserter.end().await {
            warn!("Failed to insert player card into Clickhouse: {e:?}");
        }
    });
    Ok(Json(player_card))
}
