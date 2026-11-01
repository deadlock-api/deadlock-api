//! Accounts whose owners opted out of tracking (`protected_user_accounts` in Postgres): the
//! cached set every route checks before returning a player's data, the opt-out and opt-in
//! writes, and the `ClickHouse` row policies that hide those accounts from the public SQL and
//! data dump users.

use std::collections::HashSet;
use std::sync::Arc;

use cached::Cached as _;
use cached::macros::cached;
use sqlx::{Pool, Postgres};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::utils::sql::id_list;

/// The protected account ids, cached for a day; [`protect`] and [`unprotect`] clear the cache.
#[cached(
    ttl_secs = 86400,
    convert = "{ 0 }",
    key = "u8",
    result_fallback = true
)]
pub(crate) async fn protected_accounts(
    pg_client: &Pool<Postgres>,
) -> sqlx::Result<Arc<HashSet<u32>>> {
    let protected_users = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(pg_client)
        .await?
        .into_iter()
        .map(|r| r.steam_id)
        .map(i32::cast_unsigned)
        .collect();
    Ok(Arc::new(protected_users))
}

/// Whether `account_id` is a protected account.
pub(crate) async fn is_protected(
    pg_client: &Pool<Postgres>,
    account_id: u32,
) -> sqlx::Result<bool> {
    protected_accounts(pg_client)
        .await
        .map(|p| p.contains(&account_id))
}

/// Fails with [`APIError::protected_user`] if any of `account_ids` is a protected account. The
/// protected set is fetched (from its cache) once for all of them.
pub(crate) async fn ensure_not_protected(state: &AppState, account_ids: &[u32]) -> APIResult<()> {
    if account_ids.is_empty() {
        return Ok(());
    }
    let protected = protected_accounts(&state.pg_client).await?;
    if account_ids.iter().any(|id| protected.contains(id)) {
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
    let protected = protected_accounts(&state.pg_client).await?;
    Ok(account_ids
        .into_iter()
        .filter(|id| !protected.contains(id))
        .collect())
}

/// `protected_user_accounts.steam_id` is `INTEGER`: store the u32 bit pattern, read back with
/// `i32::cast_unsigned`, so ids of 2^31 and above round-trip.
const fn steam_id_i32(steam_id: u32) -> i32 {
    steam_id.cast_signed()
}

/// Marks `steam_id` as protected. Call [`update_row_policy`] afterwards.
pub(crate) async fn protect(pg_client: &Pool<Postgres>, steam_id: u32) -> APIResult<()> {
    let steam_id_i32 = steam_id_i32(steam_id);
    sqlx::query!(
        r#"
        INSERT INTO protected_user_accounts (steam_id)
        VALUES ($1)
        ON CONFLICT (steam_id) DO NOTHING
        "#,
        steam_id_i32
    )
    .execute(pg_client)
    .await?;

    PROTECTED_ACCOUNTS.write().await.cache_clear();

    Ok(())
}

/// Lifts the protection of `steam_id`. Call [`update_row_policy`] afterwards.
pub(crate) async fn unprotect(pg_client: &Pool<Postgres>, steam_id: u32) -> APIResult<()> {
    let steam_id_i32 = steam_id_i32(steam_id);
    sqlx::query!(
        r#"
        DELETE FROM protected_user_accounts
        WHERE steam_id = $1
        "#,
        steam_id_i32
    )
    .execute(pg_client)
    .await?;

    PROTECTED_ACCOUNTS.write().await.cache_clear();

    Ok(())
}

/// Row policies hiding protected accounts and anonymous players (`account_id = 0`), by the table
/// they guard. Every table with an `account_id` column that `api_readonly_user` or `dump_user` can
/// read needs one.
const GDPR_ROW_POLICIES: [(&str, &str); 6] = [
    ("gdpr_protection_mp", "match_player"),
    ("gdpr_protection_sp", "steam_profiles"),
    ("gdpr_protection_spon", "steam_profile_observed_names"),
    ("gdpr_protection_pms", "player_match_stats"),
    ("gdpr_protection_pmh", "player_match_history"),
    ("gdpr_protection_pmr", "player_match_roster"),
];

/// Rewrites the `ClickHouse` row policies from the current protected accounts.
pub(crate) async fn update_row_policy(
    pg_client: &Pool<Postgres>,
    ch_client: &clickhouse::Client,
) -> APIResult<()> {
    let protected_accounts: Vec<u32> = sqlx::query!("SELECT steam_id FROM protected_user_accounts")
        .fetch_all(pg_client)
        .await?
        .into_iter()
        .map(|record| record.steam_id.cast_unsigned())
        .collect();

    let filter = row_policy_filter(&protected_accounts);
    for (policy, table) in GDPR_ROW_POLICIES {
        ch_client
            .query(&format!(
                "CREATE ROW POLICY OR REPLACE {policy} ON {table} AS RESTRICTIVE FOR SELECT USING {filter} TO api_readonly_user, dump_user"
            ))
            .execute()
            .await?;
    }

    Ok(())
}

/// Hides protected accounts and `account_id = 0`. Anonymous players all share that id, so they
/// can't be told apart and must not show up in any result (2026-11-01).
fn row_policy_filter(protected_accounts: &[u32]) -> String {
    if protected_accounts.is_empty() {
        "(account_id != 0)".to_owned()
    } else {
        format!(
            "(account_id != 0 AND account_id NOT IN ({}))",
            id_list(protected_accounts)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn row_policy_always_hides_anonymous_players() {
        assert_eq!(row_policy_filter(&[]), "(account_id != 0)");
        assert_eq!(
            row_policy_filter(&[7, 9]),
            "(account_id != 0 AND account_id NOT IN (7, 9))"
        );
    }
}
