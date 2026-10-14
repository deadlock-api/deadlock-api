use axum::extract::Request;
use axum::http::{HeaderMap, HeaderName, HeaderValue, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use reqwest::StatusCode;
use tower_http::cors::{AllowCredentials, AllowHeaders, Any, CorsLayer};

use crate::error::APIError;
use crate::utils::request::header_str;

/// Wildcard-origin CORS with no `Vary` header, so public responses stay
/// CDN-cacheable. Request headers are mirrored so header-based auth keeps
/// working; cookies are not allowed.
pub(crate) fn public() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(AllowHeaders::mirror_request())
        .expose_headers(Any)
        .vary(Vec::<HeaderName>::new())
}

/// Origin-reflecting CORS that allows credentials (cookies) only for our own
/// sites. Every origin can still call these routes with an API key or bearer
/// token. Forces `Vary: origin`, so only use it on routes that send
/// `private`/`no-store`.
///
/// The `patron_session` cookie is `SameSite=None`, so browsers attach it to
/// requests from any site; withholding `Access-Control-Allow-Credentials` keeps
/// other sites from reading cookie-authenticated responses. Pair it with
/// [`reject_foreign_cookies`].
pub(crate) fn credentialed() -> CorsLayer {
    CorsLayer::very_permissive().allow_credentials(AllowCredentials::predicate(|origin, _| {
        is_allowed_origin(origin)
    }))
}

/// Rejects requests from a browser page on another site that carry the
/// `patron_session` cookie.
///
/// CORS only hides the response: "simple" requests (form posts, bodyless
/// POSTs) still reach the handler with the cookie attached, so the origin must
/// be checked server-side too. Other sites authenticating with an API key don't
/// send the cookie and pass, as do requests without an `Origin` header
/// (non-browser clients, webhooks, top-level navigations).
pub(crate) async fn reject_foreign_cookies(req: Request, next: Next) -> Response {
    if let Some(origin) = req.headers().get(header::ORIGIN)
        && !is_allowed_origin(origin)
        && has_session_cookie(req.headers())
    {
        return APIError::status_msg(
            StatusCode::FORBIDDEN,
            "Cookie authentication is only allowed from deadlock-api.com. \
             Send requests without credentials and authenticate with an API key instead.",
        )
        .into_response();
    }
    next.run(req).await
}

fn has_session_cookie(headers: &HeaderMap) -> bool {
    header_str(headers, header::COOKIE).is_some_and(|cookies| {
        cookies
            .split(';')
            .any(|cookie| cookie.trim().starts_with("patron_session="))
    })
}

/// `https://deadlock-api.com` and its subdomains.
fn is_allowed_origin(origin: &HeaderValue) -> bool {
    let Some(host) = origin
        .to_str()
        .ok()
        .and_then(|origin| origin.strip_prefix("https://"))
    else {
        return false;
    };
    host == "deadlock-api.com"
        || host
            .strip_suffix(".deadlock-api.com")
            .is_some_and(|sub| !sub.is_empty() && !sub.contains(['/', ':', '@']))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allowed(origin: &str) -> bool {
        is_allowed_origin(&HeaderValue::from_str(origin).unwrap())
    }

    #[test]
    fn test_allowed_origins() {
        assert!(allowed("https://deadlock-api.com"));
        assert!(allowed("https://www.deadlock-api.com"));
        assert!(allowed("https://ai.deadlock-api.com"));
    }

    #[test]
    fn test_rejected_origins() {
        assert!(!allowed("https://evil.com"));
        assert!(!allowed("https://deadlock-api.com.evil.com"));
        assert!(!allowed("https://evildeadlock-api.com"));
        assert!(!allowed("https://.deadlock-api.com"));
        assert!(!allowed("https://deadlock-api.com:8443"));
        assert!(!allowed("https://evil.com/.deadlock-api.com"));
        assert!(!allowed("https://evil.com@x.deadlock-api.com"));
        assert!(!allowed("http://deadlock-api.com"));
        assert!(!allowed("http://localhost:3000"));
        assert!(!allowed("http://127.0.0.1:5173"));
        assert!(!allowed("null"));
    }

    fn app() -> axum::Router {
        axum::Router::new()
            .route(
                "/",
                axum::routing::get(|| async { "ok" }).post(|| async { "ok" }),
            )
            .layer(axum::middleware::from_fn(reject_foreign_cookies))
            .layer(credentialed())
    }

    async fn send(method: &str, origin: Option<&str>, cookie: Option<&str>) -> Response {
        let mut req = Request::builder().method(method).uri("/");
        if let Some(origin) = origin {
            req = req.header(header::ORIGIN, origin);
        }
        if let Some(cookie) = cookie {
            req = req.header(header::COOKIE, cookie);
        }
        tower::ServiceExt::oneshot(app(), req.body(axum::body::Body::empty()).unwrap())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_credentials_only_for_own_origins() {
        let res = send("GET", Some("https://deadlock-api.com"), None).await;
        let headers = res.headers();
        assert_eq!(
            headers.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(),
            "https://deadlock-api.com"
        );
        assert_eq!(
            headers
                .get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
                .unwrap(),
            "true"
        );

        // Other sites may still read responses to requests without cookies.
        let res = send("GET", Some("https://example.com"), None).await;
        let headers = res.headers();
        assert_eq!(
            headers.get(header::ACCESS_CONTROL_ALLOW_ORIGIN).unwrap(),
            "https://example.com"
        );
        assert!(
            headers
                .get(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
                .is_none()
        );
    }

    #[tokio::test]
    async fn test_foreign_cookie_requests_are_rejected() {
        let session = Some("other=1; patron_session=token");
        for method in ["GET", "POST"] {
            assert_eq!(
                send(method, Some("https://evil.com"), session)
                    .await
                    .status(),
                StatusCode::FORBIDDEN
            );
            assert_eq!(
                send(method, Some("https://deadlock-api.com"), session)
                    .await
                    .status(),
                StatusCode::OK
            );
            assert_eq!(
                send(method, Some("https://evil.com"), Some("other=1"))
                    .await
                    .status(),
                StatusCode::OK
            );
            assert_eq!(
                send(method, Some("https://evil.com"), None).await.status(),
                StatusCode::OK
            );
            assert_eq!(send(method, None, session).await.status(), StatusCode::OK);
        }
    }
}
