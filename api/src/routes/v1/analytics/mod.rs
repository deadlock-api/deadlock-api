pub mod ability_order_stats;
pub mod badge_distribution;
mod buff_stats;
pub mod build_item_stats;
mod common_filters;
pub mod game_stats;
pub mod hero_ban_stats;
pub mod hero_build_stats;
pub mod hero_comb_stats;
pub mod hero_counters_stats;
pub(crate) mod hero_pair_agg;
pub mod hero_scoreboard;
pub mod hero_stats;
pub mod hero_swap_stats;
pub mod hero_synergies_stats;
pub mod item_flow_stats;
mod item_permutation_stats;
pub mod item_stats;
mod kill_death_stats;
mod lane_common;
pub mod lane_matchup_stats;
pub mod lane_soul_curve;
pub mod player_performance_curve;
pub(crate) mod player_performance_curve_agg;
pub mod player_scoreboard;
mod player_stats_metrics;
mod power_up_buffs;
pub(crate) mod rollup_window;
pub mod scoreboard_types;

use core::time::Duration;

use axum::middleware::from_fn_with_state;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use crate::middleware::rate_limit::{RateLimitState, rate_limit};
use crate::services::rate_limiter::{self, Limits, Quota, RateLimit, Scope};

#[derive(OpenApi)]
#[openapi(tags((name = "Analytics", description = "
Comprehensive game statistics and analysis endpoints.
Provides detailed performance metrics for heroes, items, and players, including hero synergies, counters, and combinations.
Features scoreboards for both heroes and players.
")))]
struct ApiDoc;

/// Shared by all analytics endpoints.
const RATE_LIMIT: RateLimit = RateLimit::new(
    "analytics",
    &[
        Quota::new(Scope::Ip, 200, Duration::from_mins(1)),
        Quota::new(Scope::Key, 400, Duration::from_mins(1)),
        Quota::new(Scope::Global, 2000, Duration::from_mins(1)),
    ],
);

/// An endpoint description followed by the rate limits all analytics endpoints share.
fn describe(description: &str) -> String {
    rate_limiter::describe(
        description,
        Limits::from(RATE_LIMIT)
            .note("The rate limits below are **shared across all analytics endpoints**."),
    )
}

/// Responses are cached for at least 10 minutes, and until the query results behind them expire:
/// the endpoints cache those for an hour and answer from them until then.
pub(crate) const CACHE_CONTROL: CacheControlMiddleware =
    CacheControlMiddleware::new(Duration::from_mins(10))
        .with_stale_while_revalidate(Duration::from_mins(20))
        .until_cached_results_expire();

pub(super) fn router(state: &AppState) -> OpenApiRouter<AppState> {
    let rate_limit_state = RateLimitState {
        client: state.rate_limit_client.clone(),
        limit: RATE_LIMIT,
    };

    OpenApiRouter::with_openapi(ApiDoc::openapi()).merge(
        OpenApiRouter::new()
            .routes(routes!(ability_order_stats::ability_order_stats))
            .routes(routes!(ability_order_stats::ability_order_tree))
            .routes(routes!(ability_order_stats::ability_max_first_stats))
            .routes(routes!(player_stats_metrics::player_stats_metrics))
            .routes(routes!(kill_death_stats::kill_death_stats))
            .routes(routes!(hero_stats::hero_stats))
            .routes(routes!(hero_ban_stats::hero_ban_stats))
            .routes(routes!(hero_swap_stats::hero_swap_stats))
            .routes(routes!(hero_build_stats::hero_build_stats))
            .routes(routes!(item_stats::item_stats))
            .routes(routes!(item_permutation_stats::item_permutation_stats))
            .routes(routes!(item_flow_stats::item_flow_stats))
            .routes(routes!(hero_counters_stats::hero_counters_stats))
            .routes(routes!(hero_synergies_stats::hero_synergies_stats))
            .routes(routes!(hero_comb_stats::hero_comb_stats))
            .routes(routes!(lane_matchup_stats::lane_matchup_stats))
            .routes(routes!(lane_soul_curve::lane_soul_curve))
            .routes(routes!(build_item_stats::build_item_stats))
            .routes(routes!(badge_distribution::badge_distribution))
            .routes(routes!(game_stats::game_stats))
            .routes(routes!(buff_stats::buff_stats))
            .routes(routes!(player_performance_curve::player_performance_curve))
            .nest(
                "/scoreboards",
                OpenApiRouter::with_openapi(ApiDoc::openapi())
                    .routes(routes!(player_scoreboard::player_scoreboard))
                    .routes(routes!(hero_scoreboard::hero_scoreboard)),
            )
            .layer(from_fn_with_state(rate_limit_state, rate_limit))
            .layer(CACHE_CONTROL),
    )
}
