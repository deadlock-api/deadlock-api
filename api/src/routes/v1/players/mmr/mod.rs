pub(crate) mod batch;
mod distribution;
pub mod mmr_history;

use core::time::Duration;

use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::APIResult;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

#[derive(OpenApi)]
#[openapi(tags((name = "MMR", description = "
# DEPRECATED! READ THIS FIRST!

All MMR endpoints are deprecated and will be removed. We no longer estimate a MMR: Valve reports the
actual rank on ranked matches, and these endpoints now serve that rank instead of the old exponential
moving average over team average badges.

Migrate to:

| Deprecated | Replacement |
| ---------- | ----------- |
| `/v1/players/mmr`, `/v1/players/mmr/{hero_id}` | `/v1/players/{account_id}/rank` |
| `/v1/players/mmr/distribution`, `/v1/players/mmr/distribution/{hero_id}` | `/v1/analytics/badge-distribution` |
| `/v1/players/{account_id}/mmr-history`, `/v1/players/{account_id}/mmr-history/{hero_id}` | `ranked_display_badge` / `ranked_delta` in `/v1/players/{account_id}/match-history` |

Since ranks only exist on ranked matches, players without one are missing from the responses, and the
hero-scoped variants no longer differ per hero: they report the account-wide rank restricted to
matches played on that hero.

### Rate Limits:

The rank and rank-history endpoints share one bucket:

| Type | Limit |
| ---- | ----- |
| IP | 20req/min |
| Key | 100req/min & 2000req/h |
| Global | 200req/min |

The distribution endpoints aggregate over every ranked match and are far more expensive, so they
have their own, tighter bucket:

| Type | Limit |
| ---- | ----- |
| IP | 5req/min |
| Key | 25req/min |
| Global | 50req/min |
    "
)))]
struct ApiDoc;

pub(super) async fn apply_mmr_rate_limits(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
) -> APIResult<()> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "mmr",
            &[
                Quota::ip_limit(20, Duration::from_mins(1)),
                Quota::key_limit(100, Duration::from_mins(1)),
                Quota::key_limit(2_000, Duration::from_hours(1)),
                Quota::global_limit(200, Duration::from_mins(1)),
            ],
        )
        .await?;
    Ok(())
}

/// The distribution queries scan every ranked match instead of a primary-key range, costing roughly
/// two orders of magnitude more than the account-scoped MMR endpoints, so they get their own bucket.
pub(super) async fn apply_mmr_distribution_rate_limits(
    state: &AppState,
    rate_limit_key: &RateLimitKey,
) -> APIResult<()> {
    state
        .rate_limit_client
        .apply_limits(
            rate_limit_key,
            "mmr_distribution",
            &[
                Quota::ip_limit(5, Duration::from_mins(1)),
                Quota::key_limit(25, Duration::from_mins(1)),
                Quota::global_limit(50, Duration::from_mins(1)),
            ],
        )
        .await?;
    Ok(())
}

#[expect(deprecated)]
pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(distribution::mmr_distribution))
        .routes(routes!(distribution::hero_mmr_distribution))
        .routes(routes!(batch::mmr))
        .routes(routes!(batch::hero_mmr))
        .routes(routes!(mmr_history::mmr_history))
        .routes(routes!(mmr_history::hero_mmr_history))
}

#[cfg(test)]
mod tests {
    use utoipa::openapi::Deprecated;

    use super::*;

    /// utoipa marks an operation deprecated from the handler's Rust `#[deprecated]` attribute,
    /// not from the `utoipa::path` macro, so the MMR endpoints lose their deprecation flag
    /// silently if that attribute is dropped.
    #[test]
    fn mmr_paths_are_deprecated() {
        let api = router().get_openapi().clone();
        for path in [
            "/mmr",
            "/mmr/{hero_id}",
            "/mmr/distribution",
            "/mmr/distribution/{hero_id}",
            "/{account_id}/mmr-history",
            "/{account_id}/mmr-history/{hero_id}",
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
