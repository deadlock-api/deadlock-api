use crate::state::AppState;
use tower_http::trace;
use tower_http::trace::TraceLayer;
use tracing::Level;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

mod health;
mod v1;
mod v2;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .nest("/v2", v2::router())
        .nest("/v1", v1::router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        )
        .routes(routes!(health::health_check))
}
