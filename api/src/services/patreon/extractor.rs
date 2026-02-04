use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use reqwest::StatusCode;
use uuid::Uuid;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::patreon::jwt::validate_session_token;

/// Authenticated patron session extracted from request
///
/// This extractor validates the patron's JWT session token from either:
/// - The `patron_session` cookie
/// - The `Authorization: Bearer <token>` header
///
/// Returns 401 Unauthorized if the token is missing, invalid, or expired.
#[derive(Debug, Clone)]
pub(crate) struct PatronSession {
    /// Patron's database UUID
    pub(crate) patron_id: Uuid,
}

impl FromRequestParts<AppState> for PatronSession {
    type Rejection = APIError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Try to extract token from cookie first, then from Authorization header
        let token = extract_token_from_cookie(&parts.headers)
            .or_else(|| extract_token_from_auth_header(&parts.headers));

        let token = token.ok_or_else(|| {
            APIError::status_msg(StatusCode::UNAUTHORIZED, "Missing authentication token")
        })?;

        // Validate the JWT token
        let claims = validate_session_token(&token, &state.config.jwt_secret).map_err(|_| {
            APIError::status_msg(StatusCode::UNAUTHORIZED, "Invalid or expired token")
        })?;

        Ok(PatronSession {
            patron_id: claims.patron_id,
        })
    }
}

/// Extracts the JWT token from the `patron_session` cookie
fn extract_token_from_cookie(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let cookie = cookie.trim();
                cookie.strip_prefix("patron_session=").map(str::to_string)
            })
        })
}

/// Extracts the JWT token from the `Authorization: Bearer <token>` header
fn extract_token_from_auth_header(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|auth| auth.strip_prefix("Bearer ").map(String::from))
}

#[cfg(test)]
mod tests {
    use axum::http::{self, HeaderMap, HeaderValue};

    use super::*;

    #[test]
    fn test_extract_token_from_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            HeaderValue::from_static("patron_session=test_token_123"),
        );

        let token = extract_token_from_cookie(&headers);
        assert_eq!(token, Some("test_token_123".to_string()));
    }

    #[test]
    fn test_extract_token_from_cookie_with_multiple_cookies() {
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            HeaderValue::from_static("other=value; patron_session=test_token_456; another=thing"),
        );

        let token = extract_token_from_cookie(&headers);
        assert_eq!(token, Some("test_token_456".to_string()));
    }

    #[test]
    fn test_extract_token_from_cookie_missing() {
        let headers = HeaderMap::new();
        let token = extract_token_from_cookie(&headers);
        assert_eq!(token, None);
    }

    #[test]
    fn test_extract_token_from_auth_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::AUTHORIZATION,
            HeaderValue::from_static("Bearer test_token_789"),
        );

        let token = extract_token_from_auth_header(&headers);
        assert_eq!(token, Some("test_token_789".to_string()));
    }

    #[test]
    fn test_extract_token_from_auth_header_missing() {
        let headers = HeaderMap::new();
        let token = extract_token_from_auth_header(&headers);
        assert_eq!(token, None);
    }

    #[test]
    fn test_extract_token_from_auth_header_wrong_scheme() {
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::AUTHORIZATION,
            HeaderValue::from_static("Basic dXNlcjpwYXNz"),
        );

        let token = extract_token_from_auth_header(&headers);
        assert_eq!(token, None);
    }
}
