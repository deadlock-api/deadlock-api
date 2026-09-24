use core::time::Duration;

use axum::routing::get;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

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
