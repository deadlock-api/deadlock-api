use core::future::Future;
use core::pin::Pin;
use core::task::{Context, Poll};
use core::time::Duration;
use std::time::SystemTime;

use axum::extract::Request;
use axum::http::HeaderValue;
use axum::http::header::CACHE_CONTROL;
use axum::response::Response;
use clickhouse_utils::cache::expiry::track_expiry;
use reqwest::header::InvalidHeaderValue;
use tower::Service;

/// A layer that adds a `Cache-Control` header to successful responses that don't set one.
///
/// Non-2xx responses are marked `no-store` by the global `no_store_on_error` middleware (the
/// outermost layer in `lib.rs`), which overrides whatever this layer set.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CacheControlMiddleware {
    max_age: Duration,
    stale_while_revalidate: Option<Duration>,
    stale_if_error: Option<Duration>,
    is_private: bool,
    until_cached_results_expire: bool,
}

impl CacheControlMiddleware {
    pub(crate) const fn new(max_age: Duration) -> Self {
        Self {
            max_age,
            stale_while_revalidate: None,
            stale_if_error: None,
            is_private: false,
            until_cached_results_expire: false,
        }
    }

    pub(crate) const fn private(mut self) -> Self {
        self.is_private = true;
        self
    }

    pub(crate) const fn with_stale_while_revalidate(
        mut self,
        stale_while_revalidate: Duration,
    ) -> Self {
        self.stale_while_revalidate = Some(stale_while_revalidate);
        self
    }

    pub(crate) const fn with_stale_if_error(mut self, stale_if_error: Duration) -> Self {
        self.stale_if_error = Some(stale_if_error);
        self
    }

    /// Raises `max-age` to the time left until the query cache entries behind the response
    /// expire (see [`clickhouse_utils::cache::expiry`]). Until then the process answers the same
    /// request from those entries, so an edge cache refetching it sooner only gets the same
    /// bytes back. Only for routes whose data all comes from the query cache, or that record
    /// their other inputs' deadlines with `expires_by`.
    pub(crate) const fn until_cached_results_expire(mut self) -> Self {
        self.until_cached_results_expire = true;
        self
    }

    /// `max-age` for a response whose cached results expire at `expires_at`.
    fn max_age_until(&self, expires_at: SystemTime) -> Duration {
        expires_at
            .duration_since(SystemTime::now())
            .map_or(self.max_age, |left| left.max(self.max_age))
    }

    fn header_value(&self, max_age: Duration) -> Result<HeaderValue, InvalidHeaderValue> {
        if max_age.as_secs() == 0 {
            return Ok(HeaderValue::from_static("no-cache"));
        }
        let visibility = if self.is_private { "private" } else { "public" };
        let stale_while_revalidate = self
            .stale_while_revalidate
            .map(|d| format!(", stale-while-revalidate={}", d.as_secs()))
            .unwrap_or_default();
        let stale_if_error = self
            .stale_if_error
            .map(|d| format!(", stale-if-error={}", d.as_secs()))
            .unwrap_or_default();
        HeaderValue::from_str(&format!(
            "{visibility}, max-age={}{stale_while_revalidate}{stale_if_error}",
            max_age.as_secs()
        ))
    }
}

#[derive(Clone, Debug)]
pub(crate) struct CacheControlLayer<S> {
    inner: S,
    config: CacheControlMiddleware,
    /// The header for `config.max_age`, rendered once when the layer is applied instead of on
    /// every response.
    header: Option<HeaderValue>,
}

impl<S> tower::Layer<S> for CacheControlMiddleware {
    type Service = CacheControlLayer<S>;

    fn layer(&self, inner: S) -> Self::Service {
        CacheControlLayer {
            inner,
            config: *self,
            header: self.header_value(self.max_age).ok(),
        }
    }
}

impl<S> Service<Request> for CacheControlLayer<S>
where
    S: Service<Request, Response = Response> + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request) -> Self::Future {
        let future = self.inner.call(req);
        let config = self.config;
        let mut header = self.header.clone();
        Box::pin(async move {
            let mut response: Response = if config.until_cached_results_expire {
                let (response, expires_at) = track_expiry(future).await;
                if let Some(expires_at) = expires_at {
                    let max_age = config.max_age_until(expires_at);
                    if max_age > config.max_age {
                        header = config.header_value(max_age).ok();
                    }
                }
                response?
            } else {
                future.await?
            };

            // Only successful responses are cacheable, and existing headers win
            if response.status().is_success()
                && let Some(header) = header
            {
                response
                    .headers_mut()
                    .entry(CACHE_CONTROL)
                    .or_insert(header);
            }
            Ok(response)
        })
    }
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::routing::get;
    use clickhouse_utils::cache::expiry::expires_by;
    use tower::ServiceExt as _;

    use super::*;

    async fn test_handler() -> &'static str {
        "Hello, world!"
    }

    async fn cache_control(app: Router) -> String {
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        response
            .headers()
            .get(CACHE_CONTROL)
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned()
    }

    fn expiring_in(secs: u64) -> Router {
        Router::new().route(
            "/",
            get(move || async move {
                expires_by(SystemTime::now() + Duration::from_secs(secs));
                "cached"
            }),
        )
    }

    #[tokio::test]
    async fn test_until_cached_results_expire() {
        let layer = CacheControlMiddleware::new(Duration::from_mins(10))
            .with_stale_while_revalidate(Duration::from_mins(20))
            .until_cached_results_expire();
        let header = cache_control(expiring_in(3_000).layer(layer)).await;
        // A second or two may pass before the middleware reads the clock.
        assert!(
            ["2998", "2999", "3000"]
                .iter()
                .any(|s| header == format!("public, max-age={s}, stale-while-revalidate=1200")),
            "{header}"
        );
    }

    #[tokio::test]
    async fn test_until_cached_results_expire_keeps_the_floor() {
        let layer =
            CacheControlMiddleware::new(Duration::from_mins(10)).until_cached_results_expire();
        assert_eq!(
            cache_control(expiring_in(30).layer(layer)).await,
            "public, max-age=600"
        );
        assert_eq!(
            cache_control(Router::new().route("/", get(test_handler)).layer(layer)).await,
            "public, max-age=600"
        );
    }

    #[tokio::test]
    async fn test_cached_results_ignored_unless_enabled() {
        let layer = CacheControlMiddleware::new(Duration::from_mins(10));
        assert_eq!(
            cache_control(expiring_in(3_000).layer(layer)).await,
            "public, max-age=600"
        );
    }

    #[tokio::test]
    async fn test_max_age() {
        let layer = CacheControlMiddleware::new(Duration::from_mins(1));
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CACHE_CONTROL).unwrap(),
            "public, max-age=60"
        );
    }

    #[tokio::test]
    async fn test_private() {
        let layer = CacheControlMiddleware::new(Duration::from_mins(1)).private();
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CACHE_CONTROL).unwrap(),
            "private, max-age=60"
        );
    }

    #[tokio::test]
    async fn test_stale_while_revalidate() {
        let layer = CacheControlMiddleware::new(Duration::from_mins(1))
            .with_stale_while_revalidate(Duration::from_mins(1));
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CACHE_CONTROL).unwrap(),
            "public, max-age=60, stale-while-revalidate=60"
        );
    }

    #[tokio::test]
    async fn test_stale_if_error() {
        let layer = CacheControlMiddleware::new(Duration::from_mins(1))
            .with_stale_if_error(Duration::from_mins(1));
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CACHE_CONTROL).unwrap(),
            "public, max-age=60, stale-if-error=60"
        );
    }
}
