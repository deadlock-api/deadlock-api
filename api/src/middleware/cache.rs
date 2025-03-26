use axum::http::HeaderValue;
use axum::{extract::Request, response::Response};
use std::fmt::Write;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;
use tower_service::Service;

/// A layer that adds a `Cache-Control` header to the response.
#[derive(Debug, Clone)]
pub struct CacheControlMiddleware {
    max_age: Duration,
    private: bool,
}

impl CacheControlMiddleware {
    /// Creates a new `CacheControlLayer` with the given max-age.
    pub fn new(max_age: Duration) -> Self {
        Self {
            max_age,
            private: false,
        }
    }

    /// Sets the `private` directive.
    #[allow(dead_code)]
    pub fn private(mut self) -> Self {
        self.private = true;
        self
    }

    fn header_value(&self) -> HeaderValue {
        let mut header_value = String::new();
        write!(&mut header_value, "max-age={}", self.max_age.as_secs()).ok();
        if self.private {
            write!(&mut header_value, ", private").ok();
        } else {
            write!(&mut header_value, ", public").ok();
        }
        #[allow(clippy::unwrap_used)]
        HeaderValue::from_str(&header_value).unwrap()
    }
}

#[derive(Clone, Debug)]
pub struct CacheControlLayer<S> {
    pub(crate) inner: S,
    pub(crate) layer: CacheControlMiddleware,
}

impl<S> tower_layer::Layer<S> for CacheControlMiddleware {
    type Service = CacheControlLayer<S>;

    fn layer(&self, inner: S) -> Self::Service {
        CacheControlLayer {
            inner,
            layer: self.clone(),
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

    fn call(&mut self, request: Request) -> Self::Future {
        let future = self.inner.call(request);
        let header = self.layer.header_value();
        Box::pin(async move {
            let mut response: Response = future.await?;

            response
                .headers_mut()
                .insert(axum::http::header::CACHE_CONTROL, header);

            Ok(response)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
        routing::get,
    };
    use tower::ServiceExt;
    // for oneshot

    async fn test_handler() -> &'static str {
        "Hello, world!"
    }

    #[tokio::test]
    async fn test_max_age() {
        let layer = CacheControlMiddleware::new(Duration::from_secs(60));
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .unwrap(),
            "max-age=60, public"
        );
    }

    #[tokio::test]
    async fn test_private() {
        let layer = CacheControlMiddleware::new(Duration::from_secs(60)).private();
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .unwrap(),
            "max-age=60, private"
        );
    }

    #[tokio::test]
    async fn test_all_options() {
        let layer = CacheControlMiddleware::new(Duration::from_secs(60)).private();
        let app = Router::new().route("/", get(test_handler)).layer(layer);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .unwrap(),
            "max-age=60, private"
        );
    }
}
