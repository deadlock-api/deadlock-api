use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;

use crate::utils::parse;

pub(crate) async fn write_api_key_to_header(mut request: Request, next: Next) -> Response {
    // Check if API-Key is already set
    if request.headers().contains_key("x-api-key") {
        return next.run(request).await;
    }

    if let Some(api_key) = extract_api_key(&request) {
        request.headers_mut().insert("x-api-key", api_key);
        return next.run(request).await;
    }

    next.run(request).await
}

pub(super) fn extract_api_key(request: &Request) -> Option<HeaderValue> {
    // Check if API-Key is in query parameters
    let query_api_key = request.uri().query().and_then(|query| {
        parse::querify(query)
            .into_iter()
            .find(|(key, _)| *key == "api_key")
            .map(|(_, value)| value.to_owned())
    });
    if let Some(api_key) = query_api_key
        && let Ok(api_key) = api_key.parse::<HeaderValue>()
    {
        return Some(api_key);
    }

    // Check if API-Key is set as a bearer token
    if let Some(api_key) = request.headers().get("authorization")
        && let Ok(auth_str) = api_key.to_str()
        && let Some(api_key) = auth_str.strip_prefix("Bearer ")
        && let Ok(api_key) = api_key.parse::<HeaderValue>()
    {
        return Some(api_key);
    }

    None
}

#[cfg(test)]
mod tests {
    use core::str::FromStr;

    use axum::Router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use axum::response::IntoResponse;
    use axum::routing::get;
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;

    async fn test_handler(req: Request<Body>) -> impl IntoResponse {
        // Simple handler that returns the request headers as a response
        let api_key_value = req
            .headers()
            .get("x-api-key")
            .and_then(|v| v.to_str().ok().and_then(|s| Uuid::from_str(s).ok()));
        let has_api_key = api_key_value.is_some();
        if let Some(api_key_value) = api_key_value {
            format!("has_api_key={has_api_key}, value={api_key_value}",)
        } else {
            format!("has_api_key={has_api_key}, value=none")
        }
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
            .uri("/test?api_key=fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64")
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
        assert_eq!(
            body_str.to_lowercase(),
            "has_api_key=true, value=fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64"
        );
    }

    #[tokio::test]
    async fn test_write_api_key_to_header_with_api_key_in_header() {
        // Create a router with our middleware
        let app = app();

        // Create a request with api_key in header
        let request = Request::builder()
            .uri("/test")
            .header("x-api-key", "fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64")
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
        assert_eq!(
            body_str.to_lowercase(),
            "has_api_key=true, value=fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64"
        );
    }

    #[tokio::test]
    async fn test_write_api_key_to_header_with_api_key_in_bearer_token() {
        // Create a router with our middleware
        let app = app();

        // Create a request with api_key in bearer token
        let request = Request::builder()
            .uri("/test")
            .header(
                "authorization",
                "Bearer fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64",
            )
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
        assert_eq!(
            body_str.to_lowercase(),
            "has_api_key=true, value=fffd6bfd-2be9-4b7e-ab76-a9d1dca19b64"
        );
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
        assert_eq!(body_str.to_lowercase(), "has_api_key=false, value=none");
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
        assert_eq!(body_str.to_lowercase(), "has_api_key=false, value=none");
    }
}
