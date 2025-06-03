mod card;
mod enemy_stats;
mod hero_stats;
pub(crate) mod match_history;
mod mate_stats;
pub(super) mod mmr_history;
mod party_stats;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;
use crate::utils::parse::parse_steam_id;
use serde::Deserialize;
use std::time::Duration;
use utoipa::{IntoParams, OpenApi};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

#[derive(Deserialize, IntoParams, Default)]
pub(crate) struct AccountIdQuery {
    /// The players SteamID3
    #[serde(default)]
    #[serde(deserialize_with = "parse_steam_id")]
    account_id: u32,
}

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(
            OpenApiRouter::new()
                .routes(routes!(match_history::match_history))
                .routes(routes!(mmr_history::mmr_history))
                .routes(routes!(mmr_history::hero_mmr_history))
                .routes(routes!(card::card_raw))
                .routes(routes!(card::card))
                .layer(CacheControlMiddleware::new(Duration::from_secs(5 * 60))),
        )
        .merge(
            OpenApiRouter::new()
                .routes(routes!(mate_stats::mate_stats))
                .routes(routes!(enemy_stats::enemy_stats))
                .routes(routes!(party_stats::party_stats))
                .routes(routes!(hero_stats::hero_stats))
                .layer(CacheControlMiddleware::new(Duration::from_secs(60 * 60))),
        )
}
