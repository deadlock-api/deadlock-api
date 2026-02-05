use core::time::Duration;

use axum::routing::{delete, get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

mod status;
mod steam_accounts;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .route("/status", get(status::get_patron_status))
        .route(
            "/steam-accounts",
            get(steam_accounts::list_steam_accounts).post(steam_accounts::add_steam_account),
        )
        .route(
            "/steam-accounts/{account_id}",
            delete(steam_accounts::delete_steam_account).put(steam_accounts::replace_steam_account),
        )
        .route(
            "/steam-accounts/{account_id}/reactivate",
            post(steam_accounts::reactivate_steam_account),
        )
        .layer(CacheControlMiddleware::new(Duration::from_secs(0)).private())
}
