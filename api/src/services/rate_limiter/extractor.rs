use crate::error::APIError;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use derive_more::Constructor;
use uuid::Uuid;

#[derive(Constructor, Debug, Clone)]
pub struct RateLimitKey {
    pub(super) api_key: Option<Uuid>,
    pub(super) ip: String,
}

impl<S> FromRequestParts<S> for RateLimitKey
where
    S: Send + Sync,
{
    type Rejection = APIError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let ip = parts
            .headers
            .get("CF-Connecting-IP")
            .or(parts.headers.get("X-Real-IP"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or("0.0.0.0")
            .to_string();
        let api_key = parts
            .headers
            .get("X-API-Key")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(&s)).ok());
        Ok(RateLimitKey::new(api_key, ip))
    }
}
