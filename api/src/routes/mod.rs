use crate::routes::v1::analytics::hero_stats;
use crate::routes::v1::players::match_history;
use crate::state::AppState;
use axum::routing::get;
use tower_http::trace;
use tower_http::trace::TraceLayer;
use tracing::Level;
use utoipa_axum::router::OpenApiRouter;

mod v1;

pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        // V2 Match History Endpoint for Backwards Compatibility with data.deadlock-api.com
        .route(
            "/v2/players/{account_id}/match-history",
            get(match_history::match_history_v2),
        )
        .route(
            "/v1/analytics/hero-win-loss-stats",
            get(hero_stats::hero_stats),
        )
        .nest("/v1", v1::router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO))
                .on_failure(trace::DefaultOnFailure::new().level(Level::ERROR)),
        )
}
