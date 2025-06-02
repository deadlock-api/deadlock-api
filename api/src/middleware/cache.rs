use axum::http::HeaderValue;
use axum::http::header::CACHE_CONTROL;
use axum::{extract::Request, response::Response};
use derive_more::Constructor;
use reqwest::header::InvalidHeaderValue;
use std::fmt::Write;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;
use tower_service::Service;

/// A layer that adds a `Cache-Control` header to the response.
#[derive(Constructor, Debug, Clone)]
pub(crate) struct CacheControlMiddleware {
    max_age: Duration,
}

impl CacheControlMiddleware {
    fn header_value(&self) -> Result<HeaderValue, InvalidHeaderValue> {
        let mut header_value = String::new();
        write!(&mut header_value, "max-age={}", self.max_age.as_secs()).ok();
        write!(&mut header_value, ", lic").ok();
        HeaderValue::from_str(&header_value)
    }
}

#[derive(Clone, Debug)]
pub(crate) struct CacheControlLayer<S> {
    inner: S,
    layer: CacheControlMiddleware,
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

            // Do not cache non-success responses
            if !response.status().is_success() {
                return Ok(response);
            }

            // Do not override existing cache control headers
            if response.headers().contains_key(CACHE_CONTROL) {
                return Ok(response);
            }

            // Add cache control header
            if let Ok(header) = header {
                response.headers_mut().insert(CACHE_CONTROL, header);
            }
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
            response.headers().get(CACHE_CONTROL).unwrap(),
            "max-age=60, lic"
        );
    }
}
