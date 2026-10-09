use core::time::Duration;

use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::{APIError, LogInternal};
use crate::middleware::cache::CacheControlMiddleware;
use crate::services::patreon::repository::PatronRepository;
use crate::services::patreon::steam_accounts_repository::SteamAccountsRepository;
use crate::services::patreon::types::Patron;

mod status;
mod steam_accounts;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .route("/status", get(status::get_patron_status))
        .routes(routes!(
            steam_accounts::list_steam_accounts,
            steam_accounts::add_steam_account
        ))
        .routes(routes!(
            steam_accounts::delete_steam_account,
            steam_accounts::replace_steam_account
        ))
        .routes(routes!(steam_accounts::reactivate_steam_account))
        .layer(CacheControlMiddleware::new(Duration::from_secs(0)).private())
}

/// The session's patron record, read fresh for its current slot limit (the session may be stale).
async fn fetch_patron(app_state: &AppState, patron_id: uuid::Uuid) -> Result<Patron, APIError> {
    PatronRepository::new(
        app_state.pg_client.clone(),
        app_state.config.patron_encryption_key.clone(),
    )
    .get_patron_by_id(patron_id)
    .await
    .log_internal("Failed to get patron", "Failed to fetch patron data")?
    .ok_or_else(|| {
        tracing::error!("Patron not found for session patron_id: {patron_id}");
        APIError::internal("Patron record not found")
    })
}

/// The patron's active account count and its count of removed accounts still in cooldown,
/// queried concurrently. A failure maps to an internal error carrying `message`.
async fn account_counts(
    repo: &SteamAccountsRepository,
    patron_id: uuid::Uuid,
    message: &'static str,
) -> Result<(i32, i32), APIError> {
    tokio::try_join!(
        async {
            repo.count_active_accounts(patron_id)
                .await
                .log_internal("Failed to count active accounts", message)
        },
        async {
            repo.count_accounts_in_cooldown(patron_id)
                .await
                .log_internal("Failed to count accounts in cooldown", message)
        },
    )
}
