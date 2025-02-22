use crate::state::AppState;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

mod health;
mod v1;
mod v2;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(health::health_check))
        .nest("/v2", v2::router())
        .nest("/v1", v1::router())
}
