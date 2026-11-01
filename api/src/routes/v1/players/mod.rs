pub mod enemy_stats;
pub mod hero_stats;
mod ingest_status;
pub(crate) mod match_history;
pub mod mate_stats;
pub mod mmr;
pub(crate) mod rank;
mod rank_distribution;
mod roster_stats;
pub mod steam;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(OpenApi)]
#[openapi(tags((name = "Players", description = "Player related endpoints")))]
struct ApiDoc;

pub(crate) const CACHE_CONTROL: CacheControlMiddleware =
    CacheControlMiddleware::new(Duration::from_mins(5))
        .with_stale_while_revalidate(Duration::from_mins(1));

#[expect(deprecated, reason = "registers deprecated handlers")]
pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(match_history::match_history))
        .routes(routes!(mate_stats::mate_stats))
        .routes(routes!(enemy_stats::enemy_stats))
        .routes(routes!(hero_stats::player_hero_stats))
        .routes(routes!(ingest_status::ingest_status))
        .routes(routes!(rank::rank))
        .routes(routes!(rank::rank_batch))
        .routes(routes!(rank::rank_image))
        .routes(routes!(rank::rank_avg_image))
        .routes(routes!(rank_distribution::rank_distribution))
        .routes(routes!(rank::rank_predict))
        .routes(routes!(rank::rank_predict_image))
        .routes(routes!(rank::rank_predict_avg_image))
        .merge(mmr::router())
        .merge(steam::router())
        .layer(CACHE_CONTROL)
}

#[cfg(test)]
mod tests {
    use utoipa::openapi::Deprecated;

    use super::*;

    /// utoipa marks an operation deprecated from the handler's Rust `#[deprecated]` attribute,
    /// not from the `utoipa::path` macro, so the rank-predict aliases lose their deprecation
    /// flag silently if that attribute is dropped.
    #[test]
    fn rank_predict_paths_are_deprecated_aliases() {
        let api = router().get_openapi().clone();
        for path in [
            "/{account_id}/rank",
            "/{account_id}/rank/image",
            "/rank",
            "/rank/image",
            "/rank/distribution",
        ] {
            assert!(api.paths.paths.contains_key(path), "missing path {path}");
        }
        for path in [
            "/{account_id}/rank-predict",
            "/{account_id}/rank-predict/image",
            "/rank-predict/image",
        ] {
            let op = api
                .paths
                .paths
                .get(path)
                .and_then(|item| item.get.as_ref())
                .expect("missing GET operation");
            assert!(
                matches!(op.deprecated, Some(Deprecated::True)),
                "{path} not deprecated"
            );
        }
    }
}
