use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use cached::macros::cached;
use serde::Serialize;
use sqlx::{Pool, Postgres};
use tracing::warn;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::ch_cost::TrackedQuery as _;
use crate::services::protected_accounts::ensure_not_protected;
use crate::services::tracker_access::INGEST_ACTIVE_WINDOW_DAYS;
use crate::utils::types::AccountIdQuery;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct IngestStatusResponse {
    account_id: u32,
    /// Whether the account's player tracker is open to everyone: it or one of its Steam friends
    /// ran an ingest client within the window, or a patron prioritizes it.
    active: bool,
    /// Whether a Steam friend of the account uploaded with an ingest client within the window.
    friend_active: bool,
    /// Whether the account is one of a patron's active prioritized accounts.
    prioritized: bool,
    /// Unix timestamp of the account's own most recent verified upload within the window.
    last_upload_at: Option<u32>,
    /// The window, in days, an upload must fall in to count.
    window_days: u32,
}

/// The account's Steam friends, empty for a private or unknown profile.
#[cached(
    max_size = 10_000,
    ttl_secs = 600,
    sync_writes = "by_key",
    convert = "{ account_id }",
    key = "u32"
)]
async fn fetch_friends(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<Vec<u32>> {
    let friends = ch_client
        .query(
            "SELECT `friends.account_id` FROM steam_profiles FINAL WHERE account_id = ? \
             SETTINGS log_comment = 'player_ingest_status_friends'",
        )
        .bind(account_id)
        .fetch_optional_tracked::<Vec<u32>>()
        .await?;
    Ok(friends.unwrap_or_default())
}

/// Whether any patron prioritizes the account. Downgrades and removals soft-delete the row, so
/// only rows without `deleted_at` count, as in the fetch queue.
#[cached(
    max_size = 10_000,
    ttl_secs = 300,
    sync_writes = "by_key",
    convert = "{ account_id }",
    key = "u32"
)]
async fn fetch_prioritized(pg_client: &Pool<Postgres>, account_id: u32) -> sqlx::Result<bool> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM prioritized_steam_accounts \
         WHERE steam_id3 = $1 AND deleted_at IS NULL)",
    )
    .bind(i64::from(account_id))
    .fetch_one(pg_client)
    .await
}

#[utoipa::path(
    get,
    path = "/{account_id}/ingest-status",
    params(AccountIdQuery),
    responses(
        (status = OK, body = IngestStatusResponse),
        (status = BAD_REQUEST, description = "Invalid account ID"),
        (status = FORBIDDEN, description = "User is protected"),
        (status = INTERNAL_SERVER_ERROR, description = "Ingest status lookup failed"),
        (status = SERVICE_UNAVAILABLE, description = "The ingest uploaders are still loading"),
    ),
    tags = ["Internal"],
    summary = "Ingest Status",
    description = "
Internal endpoint used by the website's player tracker gate.

Returns whether the account's player tracker is open to everyone. It is when, within the last 14
days, an ingest client that sends the player's account id (the
[ingest tool](https://deadlock-api.com/ingest-cache), Deadlock Plus or the DeadChaps companion)
uploaded match salts for the account or for one of its Steam friends, or when a patron prioritizes
the account. Only uploads whose own salt was verified count.
"
)]
pub(super) async fn ingest_status(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<Json<IngestStatusResponse>> {
    ensure_not_protected(&state, &[account_id]).await?;

    let snapshot = state.tracker_access.snapshot().ok_or_else(|| {
        APIError::status_msg(
            StatusCode::SERVICE_UNAVAILABLE,
            "The ingest uploaders are still loading. Retry in a minute.",
        )
    })?;
    let last_upload_at = snapshot.last_upload_at(account_id);

    let (friends, prioritized) = tokio::join!(
        fetch_friends(&state.ch_client_ro, account_id),
        fetch_prioritized(&state.pg_client, account_id),
    );
    let friend_active = snapshot.is_uploader_friend(account_id, &friends?);
    // A Postgres outage leaves the ingest checks standing; the website's own-account check still
    // opens a patron's accounts.
    let prioritized = prioritized.unwrap_or_else(|e| {
        warn!("Failed to check prioritized account {account_id}: {e}");
        false
    });

    Ok(Json(IngestStatusResponse {
        account_id,
        active: last_upload_at.is_some() || friend_active || prioritized,
        friend_active,
        prioritized,
        last_upload_at,
        window_days: INGEST_ACTIVE_WINDOW_DAYS,
    }))
}
