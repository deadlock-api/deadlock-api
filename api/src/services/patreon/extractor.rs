use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use cached::TimedCache;
use cached::proc_macro::cached;
use reqwest::StatusCode;
use sqlx::{Pool, Postgres};
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

        if let Some(token) = token {
            // Validate the JWT token
            let claims =
                validate_session_token(&token, &state.config.jwt_secret).map_err(|_| {
                    APIError::status_msg(StatusCode::UNAUTHORIZED, "Invalid or expired token")
                })?;

            return Ok(PatronSession {
                patron_id: claims.patron_id,
            });
        }

        // Fallback: check if an API key is present and linked to a patron
        let api_key = parts
            .headers
            .get("X-API-Key")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(s)).ok());

        if let Some(api_key) = api_key
            && let Some(patron_id) = get_patron_id_for_api_key(&state.pg_client, api_key).await
        {
            return Ok(PatronSession { patron_id });
        }

        Err(APIError::status_msg(
            StatusCode::UNAUTHORIZED,
            "Missing authentication token",
        ))
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

/// Looks up the `patron_id` linked to an API key.
/// Returns `None` if the API key is not found, is disabled, or has no patron linked.
/// Results are cached for 10 minutes.
#[cached(
    ty = "TimedCache<Uuid, Option<Uuid>>",
    create = "{ TimedCache::with_lifespan(std::time::Duration::from_secs(10 * 60)) }",
    convert = "{ api_key }",
    sync_writes = "by_key",
    key = "Uuid"
)]
pub(crate) async fn get_patron_id_for_api_key(
    pg_client: &Pool<Postgres>,
    api_key: Uuid,
) -> Option<Uuid> {
    sqlx::query_scalar!(
        "SELECT patron_id FROM api_keys WHERE key = $1 AND disabled IS false AND patron_id IS NOT NULL",
        api_key
    )
    .fetch_optional(pg_client)
    .await
    .ok()
    .flatten()
    .flatten()
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
