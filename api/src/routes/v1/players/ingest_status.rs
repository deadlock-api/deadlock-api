use axum::Json;
use axum::extract::{Path, State};
use cached::macros::cached;
use serde::Serialize;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::players::ensure_not_protected;
use crate::utils::types::AccountIdQuery;

/// How recent an ingest tool upload must be for the account to count as running the tool.
pub(crate) const INGEST_ACTIVE_WINDOW_DAYS: u32 = 14;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct IngestStatusResponse {
    account_id: u32,
    /// Whether the ingest tool uploaded a salt for this account within the window that was then verified.
    active: bool,
    /// Unix timestamp of the most recent verified upload within the window.
    last_upload_at: Option<u32>,
    /// The window, in days, an upload must fall in to count.
    window_days: u32,
}

/// The newest upload the ingest tool sent as `account_id` whose own salt was verified.
///
/// `POST /v1/matches/salts` takes any `username` unverified, so an upload only counts once the
/// downloader verified that very salt (match, cluster and metadata salt), not merely some salt of
/// its match: the endpoint drops salts that are already verified, so only the first sender of a
/// salt nobody had yet is credited, and a username cannot be put on someone else's salt. Verdicts
/// are separate rows without a `username`, hence the second lookup. Unix timestamp `0` means no
/// such upload.
#[cached(
    max_size = 10_000,
    ttl_secs = 600,
    sync_writes = "by_key",
    convert = "{ account_id }",
    key = "u32"
)]
async fn fetch_last_upload_at(
    ch_client: &clickhouse::Client,
    account_id: u32,
) -> clickhouse::error::Result<u32> {
    let username = format!("ingest-tool:{account_id}");
    ch_client
        .query(
            "
            WITH uploads AS (
                SELECT match_id, cluster_id, metadata_salt, created_at
                FROM match_salts
                WHERE created_at >= now() - toIntervalDay(?) AND username = ?
            )
            SELECT toUnixTimestamp(max(created_at))
            FROM uploads
            WHERE (match_id, cluster_id, metadata_salt) IN (
                SELECT match_id, cluster_id, metadata_salt FROM match_salts
                WHERE verified_at IS NOT NULL AND match_id IN (SELECT match_id FROM uploads)
            )
            SETTINGS log_comment = 'player_ingest_status'
            ",
        )
        .bind(INGEST_ACTIVE_WINDOW_DAYS)
        .bind(username)
        .fetch_one::<u32>()
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
    ),
    tags = ["Internal"],
    summary = "Ingest Status",
    description = "
Internal endpoint used by the website's player tracker gate.

Returns whether the [ingest tool](https://deadlock-api.com/ingest-cache) uploaded match salts for
this account within the last 14 days. Only uploads whose own salt was verified count.
"
)]
pub(super) async fn ingest_status(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    State(state): State<AppState>,
) -> APIResult<Json<IngestStatusResponse>> {
    ensure_not_protected(&state, &[account_id]).await?;

    let last_upload_at = fetch_last_upload_at(&state.ch_client_ro, account_id).await?;
    let last_upload_at = (last_upload_at > 0).then_some(last_upload_at);
    Ok(Json(IngestStatusResponse {
        account_id,
        active: last_upload_at.is_some(),
        last_upload_at,
        window_days: INGEST_ACTIVE_WINDOW_DAYS,
    }))
}
