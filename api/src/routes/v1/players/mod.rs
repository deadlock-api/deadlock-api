pub mod account_stats;
pub mod card;
pub mod enemy_stats;
pub mod hero_stats;
pub(crate) mod match_history;
pub mod mate_stats;
pub mod mmr;
pub(crate) mod rank_predict;
pub mod steam;

use core::time::Duration;

use axum::http::StatusCode;
use rand::seq::SliceRandom;
use redis::AsyncTypedCommands;
use serde_json::json;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::middleware::cache::CacheControlMiddleware;
use crate::services::patreon;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
struct ApiDoc;

const INVITE_LINK_PREFIX: &str = "invite_link:";

async fn check_account_not_protected(state: &AppState, account_id: u32) -> APIResult<()> {
    if state
        .steam_client
        .is_user_protected(&state.pg_client, account_id)
        .await?
    {
        return Err(APIError::protected_user());
    }
    Ok(())
}

async fn check_patreon_access(
    pg: &sqlx::PgPool,
    rate_limit_key: &RateLimitKey,
    account_id: u32,
) -> APIResult<()> {
    let is_prioritized = patreon::is_account_prioritized(pg, i64::from(account_id)).await?;
    if !is_prioritized {
        let has_patron_key = match rate_limit_key.api_key {
            Some(api_key) => patreon::extractor::get_patron_id_for_api_key(pg, api_key)
                .await
                .is_some(),
            None => false,
        };
        if !has_patron_key {
            return Err(APIError::status_msg(
                StatusCode::FORBIDDEN,
                "This endpoint is only available to Patreon subscribers.",
            ));
        }
    }
    Ok(())
}

async fn apply_bot_rate_limits(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
    endpoint_name: &str,
) -> APIResult<()> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            endpoint_name,
            &[
                Quota::ip_limit(5, Duration::from_mins(1)),
                Quota::key_limit(20, Duration::from_mins(1)),
                Quota::key_limit(800, Duration::from_hours(1)),
                Quota::global_limit(200, Duration::from_mins(1)),
            ],
        )
        .await
        .map(|_| ())
}

async fn lookup_bot_for_friend(pg: &sqlx::PgPool, account_id: u32) -> APIResult<Option<String>> {
    let friend_id = i32::try_from(account_id).map_err(|_| {
        APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid account ID".to_owned())
    })?;
    match sqlx::query!(
        "SELECT bot_id FROM bot_friends WHERE friend_id = $1",
        friend_id
    )
    .fetch_one(pg)
    .await
    {
        Ok(r) => Ok(Some(r.bot_id)),
        Err(sqlx::Error::RowNotFound) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

async fn collect_invite_links(
    pg: &sqlx::PgPool,
    redis: &mut redis::aio::MultiplexedConnection,
) -> APIResult<Vec<String>> {
    let mut invite_keys_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut cursor: u64 = 0;
    loop {
        let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(format!("{INVITE_LINK_PREFIX}*"))
            .arg("COUNT")
            .arg(100)
            .query_async(redis)
            .await?;
        invite_keys_set.extend(keys);
        cursor = next_cursor;
        if cursor == 0 {
            break;
        }
    }
    let mut bot_ids: Vec<String> = invite_keys_set
        .into_iter()
        .filter_map(|k| k.strip_prefix(INVITE_LINK_PREFIX).map(str::to_owned))
        .collect();
    let counts: std::collections::HashMap<String, i64> = if bot_ids.is_empty() {
        std::collections::HashMap::new()
    } else {
        sqlx::query!(
            "SELECT bot_id, COUNT(*) AS count FROM bot_friends WHERE bot_id = ANY($1) GROUP BY bot_id",
            &bot_ids
        )
        .fetch_all(pg)
        .await?
        .into_iter()
        .map(|r| (r.bot_id, r.count.unwrap_or(0)))
        .collect()
    };
    bot_ids.shuffle(&mut rand::rng());
    bot_ids.sort_by_key(|id| counts.get(id).copied().unwrap_or(0));
    bot_ids.truncate(5);
    if bot_ids.is_empty() {
        return Ok(vec![]);
    }
    let selected_keys: Vec<String> = bot_ids
        .iter()
        .map(|id| format!("{INVITE_LINK_PREFIX}{id}"))
        .collect();
    let results: Vec<Option<String>> = AsyncTypedCommands::mget(redis, &selected_keys).await?;
    Ok(results.into_iter().flatten().collect())
}

pub(super) async fn resolve_bot_for_account(
    state: &mut AppState,
    rate_limit_key: &RateLimitKey,
    account_id: u32,
    endpoint_name: &str,
) -> APIResult<String> {
    check_account_not_protected(state, account_id).await?;
    check_patreon_access(&state.pg_client, rate_limit_key, account_id).await?;
    apply_bot_rate_limits(state, rate_limit_key, endpoint_name).await?;

    if let Some(bot_username) = lookup_bot_for_friend(&state.pg_client, account_id).await? {
        return Ok(bot_username);
    }

    let invites = collect_invite_links(&state.pg_client, &mut state.redis_client).await?;
    Err(APIError::StatusMsgJson {
        status: StatusCode::BAD_REQUEST,
        message: json!({
            "message": "Account ID is not a friend of any bot. Please add the bot as friend first using one of these invites.",
            "invites": invites,
        }),
    })
}

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(match_history::match_history))
        .routes(routes!(card::card))
        .routes(routes!(account_stats::account_stats))
        .routes(routes!(mate_stats::mate_stats))
        .routes(routes!(enemy_stats::enemy_stats))
        .routes(routes!(hero_stats::player_hero_stats))
        .routes(routes!(rank_predict::rank_predict))
        .merge(mmr::router())
        .merge(steam::router())
        .layer(
            CacheControlMiddleware::new(Duration::from_mins(5))
                .with_stale_while_revalidate(Duration::from_mins(5))
                .with_stale_if_error(Duration::from_mins(5)),
        )
}
