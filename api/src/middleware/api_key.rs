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
