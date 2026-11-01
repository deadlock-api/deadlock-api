//! The bots' Steam friends (`bot_friends` in Postgres) and their friend invite links (Redis
//! `invite_link:<bot id>`). Only a bot's friends get their match history fetched live from Steam;
//! everyone else gets the stored history.

use std::collections::{HashMap, HashSet};

use axum::http::StatusCode;
use rand::seq::SliceRandom as _;
use redis::AsyncTypedCommands;

use crate::error::{APIError, APIResult};

const INVITE_LINK_PREFIX: &str = "invite_link:";

/// The bot `account_id` is friends with, if any.
pub(crate) async fn lookup_bot_for_friend(
    pg: &sqlx::PgPool,
    account_id: u32,
) -> APIResult<Option<String>> {
    let Ok(friend_id) = i32::try_from(account_id) else {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            "Invalid account ID".to_owned(),
        ));
    };
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
    redis: &mut redis::aio::ConnectionManager,
) -> APIResult<Vec<String>> {
    let mut invite_keys_set: HashSet<String> = HashSet::new();
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
    let counts: HashMap<String, i64> = if bot_ids.is_empty() {
        HashMap::new()
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
