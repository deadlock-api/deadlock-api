use core::time::Duration;

use axum::routing::{get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

mod patreon;
mod webhook;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .route("/patreon", get(patreon::login))
        .route("/patreon/callback", get(patreon::callback))
        .route("/patreon/logout", post(patreon::logout))
        .route("/patreon/webhook", post(webhook::webhook))
        .layer(CacheControlMiddleware::new(Duration::from_secs(0)).private())
}
