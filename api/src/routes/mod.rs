use axum::extract::Request;
use axum::routing::get;
use tower_http::trace;
use tower_http::trace::TraceLayer;
use tracing::{Level, span};
use utoipa_axum::router::OpenApiRouter;
use uuid::Uuid;

use crate::context::AppState;
use crate::routes::v1::analytics::{
    badge_distribution, hero_comb_stats, hero_stats, item_stats, player_scoreboard,
};
use crate::routes::v1::players;
use crate::utils::parse;

pub mod v1;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .route(
            "/v1/players/{account_id}/hero-stats",
            get(players::hero_stats::hero_stats_single),
        )
        .route(
            "/v1/players/{account_id}/steam",
            get(players::steam::route::steam_single),
        )
        .route(
            "/v1/analytics/hero-win-loss-stats",
            get(hero_stats::hero_stats),
        )
        .route(
            "/v1/analytics/hero-comb-win-loss-stats",
            get(hero_comb_stats::hero_comb_stats),
        )
        .route(
            "/v1/analytics/item-win-loss-stats",
            get(item_stats::item_stats),
        )
        .route(
            "/v1/matches/badge-distribution",
            get(badge_distribution::badge_distribution),
        )
        .route(
            "/v1/players/scoreboard",
            get(player_scoreboard::player_scoreboard),
        )
        .nest("/v1", v1::router())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<_>| {
                    let method = request.method();
                    let headers = request.headers();

                    let api_key = headers
                        .get("X-API-Key")
                        .and_then(|v| v.to_str().ok())
                        .map(String::from)
                        .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(&s)).ok());

                    let uri = request.uri().to_string();
                    let path = uri.split('?').next().unwrap_or(&uri);

                    let mut query = parse::querify(request.uri().query().unwrap_or_default());
                    query.retain(|d| d.0 != "api_key"); // remove api_key from query

                    let ip = headers
                        .get("CF-Connecting-IP")
                        .or(headers.get("X-Real-IP"))
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("0.0.0.0");

                    span!(Level::INFO, "request", %method, ?path, ?query, ?api_key, ?ip)
                })
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO))
                .on_failure(trace::DefaultOnFailure::new().level(Level::ERROR)),
        )
}
