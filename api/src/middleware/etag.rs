//! Weak `ETag`s on public responses, and `304 Not Modified` when `If-None-Match` matches.
//!
//! Cloudflare revalidates an expired cached response with `If-None-Match`. Answering 304 renews
//! its copy without sending (or compressing) the body again and counts as a cache hit there. The
//! handler still runs, so the content is exactly as fresh as with a full refetch.
//!
//! Needs a body that serializes byte-identically for identical content, on every replica: a
//! `HashMap` in a response (random iteration order) only costs that route its 304s.

use axum::body::{Body, HttpBody as _};
use axum::extract::Request;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;
use tracing::warn;
use xxhash_rust::xxh3::xxh3_64;

/// Bigger bodies are sent without an `ETag` instead of being hashed.
const MAX_BODY_BYTES: u64 = 64 * 1024 * 1024;

/// Must run outside every layer that sets `Cache-Control` and inside compression, so it sees the
/// final caching headers and the uncompressed body.
pub(crate) async fn conditional_get(req: Request, next: Next) -> Response {
    if req.method() != Method::GET {
        return next.run(req).await;
    }
    let if_none_match = req.headers().get(header::IF_NONE_MATCH).cloned();
    let response = next.run(req).await;
    if !is_eligible(&response) {
        return response;
    }

    let (mut parts, body) = response.into_parts();
    let bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(bytes) => bytes,
        Err(error) => {
            warn!("Failed to buffer a response body for its ETag: {error}");
            parts.status = StatusCode::INTERNAL_SERVER_ERROR;
            parts.headers.remove(header::CONTENT_LENGTH);
            return Response::from_parts(parts, Body::empty());
        }
    };
    let etag = format!("W/\"{:016x}\"", xxh3_64(&bytes));
    let Ok(etag_value) = HeaderValue::from_str(&etag) else {
        return Response::from_parts(parts, Body::from(bytes));
    };
    parts.headers.insert(header::ETAG, etag_value);

    if if_none_match.is_some_and(|value| matches(&value, &etag)) {
        // A 304 keeps the caching headers (Cache-Control, ETag, Vary) but none of the body's.
        parts.status = StatusCode::NOT_MODIFIED;
        parts.headers.remove(header::CONTENT_LENGTH);
        parts.headers.remove(header::CONTENT_TYPE);
        // The compression layer only adds this to bodies it compresses, so the 304 would lack
        // the `Vary` of the response it stands for.
        parts
            .headers
            .entry(header::VARY)
            .or_insert(HeaderValue::from_static("accept-encoding"));
        return Response::from_parts(parts, Body::empty());
    }
    Response::from_parts(parts, Body::from(bytes))
}

/// A buffered public 200 without its own `ETag`. Streamed bodies (no exact size) pass untouched.
fn is_eligible(response: &Response) -> bool {
    let headers = response.headers();
    response.status() == StatusCode::OK
        && !headers.contains_key(header::ETAG)
        && is_public(headers)
        && !headers
            .get(header::CONTENT_TYPE)
            .is_some_and(|ct| ct.as_bytes().starts_with(b"text/event-stream"))
        && response
            .body()
            .size_hint()
            .exact()
            .is_some_and(|len| len <= MAX_BODY_BYTES)
}

fn is_public(headers: &HeaderMap) -> bool {
    headers
        .get(header::CACHE_CONTROL)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(',')
                .any(|directive| directive.trim().eq_ignore_ascii_case("public"))
        })
}

/// `If-None-Match` uses the weak comparison: `W/` prefixes are ignored, and `*` matches anything.
fn matches(if_none_match: &HeaderValue, etag: &str) -> bool {
    let Ok(value) = if_none_match.to_str() else {
        return false;
    };
    let etag = opaque(etag);
    value
        .split(',')
        .map(str::trim)
        .any(|tag| tag == "*" || opaque(tag) == etag)
}

fn opaque(tag: &str) -> &str {
    tag.strip_prefix("W/").unwrap_or(tag)
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::middleware::from_fn;
    use axum::routing::get;
    use futures::stream;
    use tower::ServiceExt as _;

    use super::*;

    const PUBLIC: &str = "public, max-age=600";

    fn app() -> Router {
        Router::new()
            .route(
                "/public",
                get(|| async { ([(header::CACHE_CONTROL, PUBLIC)], "body") }),
            )
            .route(
                "/private",
                get(|| async { ([(header::CACHE_CONTROL, "private")], "body") }),
            )
            .route(
                "/stream",
                get(|| async {
                    let chunks = stream::iter([Ok::<_, std::io::Error>("a"), Ok("b")]);
                    ([(header::CACHE_CONTROL, PUBLIC)], Body::from_stream(chunks))
                }),
            )
            .layer(from_fn(conditional_get))
    }

    async fn get_with(uri: &str, if_none_match: Option<&str>) -> Response {
        let mut req = Request::builder().uri(uri);
        if let Some(tag) = if_none_match {
            req = req.header(header::IF_NONE_MATCH, tag);
        }
        app()
            .oneshot(req.body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    fn etag(response: &Response) -> Option<String> {
        response
            .headers()
            .get(header::ETAG)
            .map(|v| v.to_str().unwrap().to_owned())
    }

    async fn body(response: Response) -> Vec<u8> {
        axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec()
    }

    #[tokio::test]
    async fn public_response_gets_weak_etag_and_keeps_body() {
        let response = get_with("/public", None).await;
        assert_eq!(response.status(), StatusCode::OK);
        let tag = etag(&response).unwrap();
        assert!(tag.starts_with("W/\""));
        assert_eq!(tag, format!("W/\"{:016x}\"", xxh3_64(b"body")));
        assert_eq!(body(response).await, b"body");
    }

    #[tokio::test]
    async fn matching_if_none_match_is_not_modified() {
        let tag = etag(&get_with("/public", None).await).unwrap();
        // Weak comparison: Cloudflare or a browser may send it without the W/ prefix.
        for sent in [
            tag.clone(),
            tag.trim_start_matches("W/").to_owned(),
            format!("\"x\", {tag}"),
            "*".to_owned(),
        ] {
            let response = get_with("/public", Some(&sent)).await;
            assert_eq!(response.status(), StatusCode::NOT_MODIFIED, "{sent}");
            let headers = response.headers();
            assert_eq!(headers.get(header::CACHE_CONTROL).unwrap(), PUBLIC);
            assert_eq!(headers.get(header::ETAG).unwrap(), tag.as_str());
            assert_eq!(headers.get(header::VARY).unwrap(), "accept-encoding");
            assert!(headers.get(header::CONTENT_TYPE).is_none());
            assert_eq!(body(response).await, b"");
        }
    }

    #[tokio::test]
    async fn changed_content_is_sent_in_full() {
        let response = get_with("/public", Some("W/\"0000000000000000\"")).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(body(response).await, b"body");
    }

    #[tokio::test]
    async fn private_and_streamed_responses_get_no_etag() {
        for uri in ["/private", "/stream"] {
            let response = get_with(uri, Some("*")).await;
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert!(etag(&response).is_none(), "{uri}");
        }
    }

    #[tokio::test]
    async fn compression_keeps_the_etag_and_leaves_304s_empty() {
        let big = "x".repeat(4096);
        let app = Router::new()
            .route(
                "/",
                get(move || async move { ([(header::CACHE_CONTROL, PUBLIC)], big) }),
            )
            .layer(from_fn(conditional_get))
            .layer(tower_http::compression::CompressionLayer::new());
        let request = |tag: Option<&str>| {
            let mut req = Request::builder()
                .uri("/")
                .header(header::ACCEPT_ENCODING, "br");
            if let Some(tag) = tag {
                req = req.header(header::IF_NONE_MATCH, tag);
            }
            req.body(Body::empty()).unwrap()
        };

        let full = app.clone().oneshot(request(None)).await.unwrap();
        assert_eq!(full.headers().get(header::CONTENT_ENCODING).unwrap(), "br");
        let tag = etag(&full).unwrap();

        let not_modified = app.oneshot(request(Some(&tag))).await.unwrap();
        assert_eq!(not_modified.status(), StatusCode::NOT_MODIFIED);
        assert!(
            not_modified
                .headers()
                .get(header::CONTENT_ENCODING)
                .is_none()
        );
        assert_eq!(body(not_modified).await, b"");
    }
}
