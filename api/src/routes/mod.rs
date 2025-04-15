use crate::routes::v1::analytics::{hero_comb_stats, hero_stats};
use crate::routes::v1::players::match_history;
use crate::state::AppState;
use axum::extract::Request;
use axum::routing::get;
use querystring::querify;
use tower_http::trace;
use tower_http::trace::TraceLayer;
use tracing::{Level, span};
use utoipa_axum::router::OpenApiRouter;
use uuid::Uuid;

pub mod v1;

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
        .route(
            "/v1/analytics/hero-comb-win-loss-stats",
            get(hero_comb_stats::hero_comb_stats),
        )
        .nest("/v1", v1::router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<_>| {
                    let method = request.method();

                    let api_key = request
                        .headers()
                        .get("X-API-Key")
                        .and_then(|v| v.to_str().ok())
                        .map(String::from)
                        .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(&s)).ok());

                    let uri = request.uri().to_string();
                    let path = uri.split("?").next().unwrap_or(&uri);

                    let mut query = querify(request.uri().query().unwrap_or_default());
                    query.retain(|d| d.0 != "api_key"); // remove api_key from query

                    span!(Level::INFO, "request", %method, ?path, ?query, ?api_key)
                })
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO))
                .on_failure(trace::DefaultOnFailure::new().level(Level::ERROR)),
        )
}
