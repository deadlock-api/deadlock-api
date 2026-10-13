pub mod enemy_stats;
pub mod hero_stats;
mod ingest_status;
pub(crate) mod match_history;
pub mod mate_stats;
pub mod mmr;
pub(crate) mod rank;
mod rank_distribution;
mod roster_stats;
pub mod steam;

use core::time::Duration;

use axum::http::StatusCode;
use rand::seq::SliceRandom;
use redis::AsyncTypedCommands;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
struct ApiDoc;

const INVITE_LINK_PREFIX: &str = "invite_link:";

/// Fails with [`APIError::protected_user`] if any of `account_ids` is a protected account. The
/// protected set is fetched (from its cache) once for all of them.
pub(crate) async fn ensure_not_protected(state: &AppState, account_ids: &[u32]) -> APIResult<()> {
    if account_ids.is_empty() {
        return Ok(());
    }
    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    if account_ids.iter().any(|id| protected_users.contains(id)) {
        return Err(APIError::protected_user());
    }
    Ok(())
}

/// `account_ids` without the protected accounts, in their original order. The protected set is
/// fetched (from its cache) once for all of them.
pub(crate) async fn without_protected(
    state: &AppState,
    account_ids: impl IntoIterator<Item = u32>,
) -> APIResult<Vec<u32>> {
    let protected_users = state
        .steam_client
        .get_protected_users(&state.pg_client)
        .await?;
    Ok(account_ids
        .into_iter()
        .filter(|id| !protected_users.contains(id))
        .collect())
}

pub(crate) async fn lookup_bot_for_friend(
    pg: &sqlx::PgPool,
    account_id: u32,
) -> APIResult<Option<String>> {
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

/// Up to five friend invite links of the bots with the fewest friends, for an account that is not
/// a bot friend yet.
pub(crate) async fn collect_invite_links(
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

#[expect(deprecated)]
pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(match_history::match_history))
        .routes(routes!(mate_stats::mate_stats))
        .routes(routes!(enemy_stats::enemy_stats))
        .routes(routes!(hero_stats::player_hero_stats))
        .routes(routes!(ingest_status::ingest_status))
        .routes(routes!(rank::rank))
        .routes(routes!(rank::rank_batch))
        .routes(routes!(rank::rank_image))
        .routes(routes!(rank::rank_avg_image))
        .routes(routes!(rank_distribution::rank_distribution))
        .routes(routes!(rank::rank_predict))
        .routes(routes!(rank::rank_predict_image))
        .routes(routes!(rank::rank_predict_avg_image))
        .merge(mmr::router())
        .merge(steam::router())
        .layer(
            CacheControlMiddleware::new(Duration::from_mins(5))
                .with_stale_while_revalidate(Duration::from_mins(1)),
        )
}

#[cfg(test)]
mod tests {
    use utoipa::openapi::Deprecated;

    use super::*;

    /// utoipa marks an operation deprecated from the handler's Rust `#[deprecated]` attribute,
    /// not from the `utoipa::path` macro, so the rank-predict aliases lose their deprecation
    /// flag silently if that attribute is dropped.
    #[test]
    fn rank_predict_paths_are_deprecated_aliases() {
        let api = router().get_openapi().clone();
        for path in [
            "/{account_id}/rank",
            "/{account_id}/rank/image",
            "/rank",
            "/rank/image",
            "/rank/distribution",
        ] {
            assert!(api.paths.paths.contains_key(path), "missing path {path}");
        }
        for path in [
            "/{account_id}/rank-predict",
            "/{account_id}/rank-predict/image",
            "/rank-predict/image",
        ] {
            let op = api
                .paths
                .paths
                .get(path)
                .and_then(|item| item.get.as_ref())
                .expect("missing GET operation");
            assert!(
                matches!(op.deprecated, Some(Deprecated::True)),
                "{path} not deprecated"
            );
        }
    }
}
