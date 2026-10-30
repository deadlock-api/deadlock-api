use axum::routing::{get, post};
use utoipa_axum::router::OpenApiRouter;

use crate::context::AppState;
use crate::middleware::cors;
use crate::routes::v1::analytics::{
    self, badge_distribution, hero_comb_stats, hero_stats, item_stats, player_scoreboard,
};
use crate::routes::v1::{data_privacy, players};

pub mod v1;
pub mod v2;

pub(super) fn router(state: &AppState) -> OpenApiRouter<AppState> {
    // Aliases outside their families' routers, so each takes its family's cache policy instead
    // of the global 2-minute default.
    OpenApiRouter::new()
        .route(
            "/v1/players/{account_id}/hero-stats",
            get(players::hero_stats::hero_stats_single).layer(players::CACHE_CONTROL),
        )
        .route(
            "/v1/data-privacy/request-deletion",
            post(data_privacy::request_deletion),
        )
        .route(
            "/v1/data-privacy/request-tracking",
            post(data_privacy::request_tracking),
        )
        .route(
            "/v1/players/{account_id}/steam",
            get(players::steam::route::steam_single).layer(players::steam::CACHE_CONTROL),
        )
        .route(
            "/v1/analytics/hero-win-loss-stats",
            get(hero_stats::hero_stats).layer(analytics::CACHE_CONTROL),
        )
        .route(
            "/v1/analytics/hero-comb-win-loss-stats",
            get(hero_comb_stats::hero_comb_stats).layer(analytics::CACHE_CONTROL),
        )
        .route(
            "/v1/analytics/item-win-loss-stats",
            get(item_stats::item_stats).layer(analytics::CACHE_CONTROL),
        )
        .route(
            "/v1/matches/badge-distribution",
            get(badge_distribution::badge_distribution).layer(analytics::CACHE_CONTROL),
        )
        .route(
            "/v1/players/scoreboard",
            get(player_scoreboard::player_scoreboard).layer(analytics::CACHE_CONTROL),
        )
        .nest("/v2", v2::router())
        .layer(cors::public())
        .nest("/v1", v1::router(state))
}
