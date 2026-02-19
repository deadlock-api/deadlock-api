use core::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use cached::TimedCache;
use cached::proc_macro::cached;
use rand::seq::SliceRandom;
use redis::AsyncTypedCommands;
use serde::Serialize;
use serde_json::json;
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgAccountHeroStats, CMsgAccountStats, CMsgClientToGcGetAccountStats, EgcCitadelClientMessages,
};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::patreon;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::{
    SteamProxyQuery, SteamProxyRawResponse, SteamProxyResponse, SteamProxyResult,
};
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct PlayerAccountHeroStats {
    pub hero_id: Option<u32>,
    pub stat_id: Vec<u32>,
    pub total_value: Vec<u64>,
    pub medals_bronze: Vec<u32>,
    pub medals_silver: Vec<u32>,
    pub medals_gold: Vec<u32>,
}

impl From<CMsgAccountHeroStats> for PlayerAccountHeroStats {
    fn from(value: CMsgAccountHeroStats) -> Self {
        Self {
            hero_id: value.hero_id,
            stat_id: value.stat_id,
            total_value: value.total_value,
            medals_bronze: value.medals_bronze,
            medals_silver: value.medals_silver,
            medals_gold: value.medals_gold,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct PlayerAccountStats {
    pub(crate) account_id: u32,
    pub(crate) stats: Vec<PlayerAccountHeroStats>,
}

impl From<CMsgAccountStats> for PlayerAccountStats {
    fn from(value: CMsgAccountStats) -> Self {
        Self {
            account_id: value.account_id(),
            stats: value.stats.into_iter().map(Into::into).collect(),
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
pub(crate) async fn fetch_player_account_stats_raw(
    steam_client: &SteamClient,
    account_id: u32,
    bot_username: String,
) -> SteamProxyResult<SteamProxyRawResponse> {
    let msg = CMsgClientToGcGetAccountStats {
        account_id: Some(account_id),
        dev_access_hint: None,
        friend_access_hint: true.into(),
    };
    steam_client
        .call_steam_proxy_raw(SteamProxyQuery {
            msg_type: EgcCitadelClientMessages::KEMsgClientToGcGetAccountStats,
            msg,
            in_all_groups: None,
            in_any_groups: None,
            cooldown_time: Duration::from_secs(10),
            request_timeout: Duration::from_secs(2),
            username: bot_username.into(),
            soft_cooldown_millis: None,
        })
        .await
}

#[cached(
    ty = "TimedCache<u32, PlayerAccountStats>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(5*60)) }",
    result = true,
    convert = "{ account_id }",
    sync_writes = "by_key",
    key = "u32"
)]
pub(crate) async fn get_player_account_stats(
    steam_client: &SteamClient,
    account_id: u32,
    bot_username: String,
) -> APIResult<PlayerAccountStats> {
    let raw_data = tryhard::retry_fn(|| {
        fetch_player_account_stats_raw(steam_client, account_id, bot_username.clone())
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(10))
    .await?;
    let proto_player_account_stats: SteamProxyResponse<CMsgAccountStats> = raw_data.try_into()?;
    Ok(proto_player_account_stats.msg.into())
}

#[utoipa::path(
    get,
    path = "/{account_id}/account-stats",
    params(AccountIdQuery),
    responses(
        (status = OK, body = [PlayerAccountStats]),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = FORBIDDEN, description = "Account is not a Patreon subscriber or not prioritized."),
        (status = TOO_MANY_REQUESTS, description = "Rate limit exceeded"),
        (status = INTERNAL_SERVER_ERROR, description = "Fetching account stats failed")
    ),
    tags = ["Players"],
    summary = "Account Stats",
    description = "
This endpoint returns the player account stats for the given `account_id`.

!THIS IS A PATREON ONLY ENDPOINT!

You have to be friend with one of the bots to use this endpoint.
On first use this endpoint will return an error with a list of invite links to add the bot as friend.
From then on you can use this endpoint.

Protobuf definitions can be found here: [https://github.com/SteamDatabase/Protobufs](https://github.com/SteamDatabase/Protobufs)

Relevant Protobuf Messages:
- CMsgClientToGcGetAccountStats
- CMsgAccountStats

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 5req/min |
| Key | 20req/min & 800req/h |
| Global | 200req/min |
    "
)]
pub(super) async fn account_stats(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    rate_limit_key: RateLimitKey,
    State(mut state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }

    let is_prioritized =
        patreon::is_account_prioritized(&state.pg_client, i64::from(account_id)).await?;
    if !is_prioritized {
        return Err(APIError::status_msg(
            StatusCode::FORBIDDEN,
            "This endpoint is only available to Patreon subscribers.",
        ));
    }

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "account_stats",
            &[
                Quota::ip_limit(5, Duration::from_mins(1)),
                Quota::key_limit(20, Duration::from_mins(1)),
                Quota::key_limit(800, Duration::from_hours(1)),
                Quota::global_limit(200, Duration::from_mins(1)),
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
            let invite_keys = state.redis_client.keys("invite_link:*").await?;
            let mut invites = vec![];
            for invite_key in invite_keys {
                if let Ok(Some(invite)) = state.redis_client.get(&invite_key).await {
                    invites.push(invite);
                }
            }
            // Shuffle so the invites get used more equally (hopefully)
            invites.shuffle(&mut rand::rng());

            // return at most 5 invites
            invites.truncate(5);

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

    let player_account_stats =
        get_player_account_stats(&state.steam_client, account_id, bot_username).await?;
    Ok(Json(player_account_stats))
}
