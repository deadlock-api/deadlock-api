use axum::extract::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use reqwest::StatusCode;

use crate::error::APIError;

/// Query parameter names that indicate a cache-busting attempt (random/timestamp
/// suffix added by clients to bypass HTTP caches). When present, the request is
/// rejected with 400 so the client cache and our upstream caches are respected.
const CACHE_BUST_PARAMS: &[&str] = &[
    "_",
    "_t",
    "cb",
    "cachebust",
    "cache_bust",
    "cachebuster",
    "cache_buster",
    "nocache",
    "no_cache",
];

fn matches_cache_bust(key: &str) -> bool {
    CACHE_BUST_PARAMS
        .iter()
        .any(|p| key.eq_ignore_ascii_case(p))
}

fn detect_cache_bust(query: &str) -> Option<&str> {
    for pair in query.split('&') {
        let key = pair.split('=').next().unwrap_or("");
        if matches_cache_bust(key) {
            return Some(key);
        }
    }
    None
}

pub(crate) async fn reject_cache_busts(req: Request, next: Next) -> Response {
    if let Some(query) = req.uri().query()
        && let Some(key) = detect_cache_bust(query)
    {
        return APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!(
                "Cache-busting query parameter '{key}' is not allowed. \
                 Remove it from your request and rely on HTTP cache headers instead."
            ),
        )
        .into_response();
    }
    next.run(req).await
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use rstest::rstest;
    use tower::ServiceExt;

    use super::*;

    fn app() -> Router {
        Router::new()
            .route("/", get(|| async { "ok" }))
            .layer(axum::middleware::from_fn(reject_cache_busts))
    }

    async fn status_for(uri: &str) -> StatusCode {
        app()
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[rstest]
    #[case("/")]
    #[case("/?account_id=12345")]
    #[case("/?account_id=12345&hero_id=6")]
    #[case("/?underscore_field=ok")] // not equal to "_"
    #[case("/?caches=ok")] // not equal to "cachebust"
    #[tokio::test]
    async fn allows_legit_requests(#[case] uri: &str) {
        assert_eq!(status_for(uri).await, StatusCode::OK);
    }

    #[rstest]
    #[case("/?_=1777367416448")] // jQuery default
    #[case("/?_t=1777367416448")]
    #[case("/?cb=abc")]
    #[case("/?cachebust=1")]
    #[case("/?cache_bust=1")]
    #[case("/?cacheBuster=1")] // case-insensitive
    #[case("/?cache_buster=1")]
    #[case("/?nocache=1")]
    #[case("/?no_cache=1")]
    #[case("/?noCache=1")] // case-insensitive
    #[case("/?account_id=1&_=12345")] // mixed with legit params
    #[case("/?_=12345&account_id=1")] // first position
    #[case("/?_")] // bare key, no value
    #[tokio::test]
    async fn rejects_cache_busting_requests(#[case] uri: &str) {
        assert_eq!(status_for(uri).await, StatusCode::BAD_REQUEST);
    }
}
