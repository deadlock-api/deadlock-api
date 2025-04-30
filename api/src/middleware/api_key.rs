use axum::http::HeaderValue;
use axum::{extract::Request, middleware::Next, response::Response};

pub async fn write_api_key_to_header(mut request: Request, next: Next) -> Response {
    let query_api_key = request.uri().query().and_then(|query| {
        url::form_urlencoded::parse(query.as_bytes())
            .find(|(key, _)| key == "api_key")
            .map(|(_, value)| value.to_string())
    });
    if let Some(api_key) = query_api_key {
        if let Ok(api_key) = api_key.parse::<HeaderValue>() {
            request.headers_mut().insert("x-api-key", api_key);
        }
    }

    next.run(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::response::IntoResponse;
    use axum::routing::get;
    use tower::ServiceExt;

    async fn test_handler(req: Request<Body>) -> impl IntoResponse {
        // Simple handler that returns the request headers as a response
        let has_api_key = req.headers().contains_key("x-api-key");
        let api_key_value = req
            .headers()
            .get("x-api-key")
            .map(|v| v.to_str().unwrap_or("invalid"))
            .unwrap_or("none");

        format!("has_api_key={has_api_key}, value={api_key_value}")
    }

    fn app() -> Router {
        Router::new()
            .route("/test", get(test_handler))
            .layer(axum::middleware::from_fn(write_api_key_to_header))
    }

    #[tokio::test]
    async fn test_write_api_key_to_header_with_api_key() {
        // Create a router with our middleware
        let app = app();

        // Create a request with api_key in query parameters
        let request = Request::builder()
            .uri("/test?api_key=test-key-123")
            .body(Body::empty())
            .unwrap();

        // Call the service
        let response = app.oneshot(request).await.unwrap();

        // Check the response
        assert_eq!(response.status(), StatusCode::OK);

        // Convert the response body to bytes and then to a string
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8(bytes.to_vec()).unwrap();

        // Verify the api_key was added to headers
        assert_eq!(body_str, "has_api_key=true, value=test-key-123");
    }

    #[tokio::test]
    async fn test_write_api_key_to_header_without_api_key() {
        // Create a router with our middleware
        let app = app();

        // Create a request without api_key
        let request = Request::builder().uri("/test").body(Body::empty()).unwrap();

        // Call the service
        let response = app.oneshot(request).await.unwrap();

        // Check the response
        assert_eq!(response.status(), StatusCode::OK);

        // Convert the response body to bytes and then to a string
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8(bytes.to_vec()).unwrap();

        // Verify no api_key was added to headers
        assert_eq!(body_str, "has_api_key=false, value=none");
    }

    #[tokio::test]
    async fn test_write_api_key_to_header_with_invalid_api_key() {
        // Create a router with our middleware
        let app = app();

        // Create a request with an invalid api_key (contains invalid header characters)
        let request = Request::builder()
            .uri("/test?api_key=invalid%0Akey")
            .body(Body::empty())
            .unwrap();

        // Call the service
        let response = app.oneshot(request).await.unwrap();

        // Check the response
        assert_eq!(response.status(), StatusCode::OK);

        // Convert the response body to bytes and then to a string
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8(bytes.to_vec()).unwrap();

        // Verify no api_key was added to headers due to invalid value
        assert_eq!(body_str, "has_api_key=false, value=none");
    }
}
