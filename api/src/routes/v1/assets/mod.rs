use core::time::Duration;

use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

mod common;
mod heroes;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/heroes", heroes::router())
        .layer(
            CacheControlMiddleware::new(Duration::from_hours(1))
                .with_stale_while_revalidate(Duration::from_hours(24))
                .with_stale_if_error(Duration::from_hours(24)),
        )
}
