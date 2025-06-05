use crate::error::APIError;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use derive_more::Constructor;
use std::net::Ipv4Addr;
use uuid::Uuid;

#[derive(Constructor, Debug, Clone)]
pub(crate) struct RateLimitKey {
    pub(super) api_key: Option<Uuid>,
    pub(super) ip: Ipv4Addr,
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
            .and_then(|v| v.to_str().ok().and_then(|s| s.parse().ok()))
            .unwrap_or(Ipv4Addr::UNSPECIFIED);
        let api_key = parts
            .headers
            .get("X-API-Key")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(&s)).ok());
        Ok(RateLimitKey::new(api_key, ip))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http;
    use axum::http::HeaderMap;
    use rstest::rstest;

    #[rstest]
    #[case(Some("1.2.3.4"), Some("HEXE-d887508b-036e-42b5-89f3-0754617036bb"), Ipv4Addr::new(1, 2, 3, 4), Some(Uuid::parse_str("d887508b-036e-42b5-89f3-0754617036bb").unwrap()))]
    #[case(Some("1.2.3.4"), Some("d887508b-036e-42b5-89f3-0754617036bb"), Ipv4Addr::new(1, 2, 3, 4), Some(Uuid::parse_str("d887508b-036e-42b5-89f3-0754617036bb").unwrap()))]
    #[case(Some("1.2.3.4"), None, Ipv4Addr::new(1, 2, 3, 4), None)]
    #[case(None, Some("HEXE-d887508b-036e-42b5-89f3-0754617036bb"), Ipv4Addr::UNSPECIFIED, Some(Uuid::parse_str("d887508b-036e-42b5-89f3-0754617036bb").unwrap()))]
    #[case(None, Some("d887508b-036e-42b5-89f3-0754617036bb"), Ipv4Addr::UNSPECIFIED, Some(Uuid::parse_str("d887508b-036e-42b5-89f3-0754617036bb").unwrap()))]
    #[case(None, None, Ipv4Addr::UNSPECIFIED, None)]
    #[case(Some("1.2.3.4"), Some("HEXE-invalid"), Ipv4Addr::new(1, 2, 3, 4), None)]
    #[case(Some("1.2.3.4"), Some("invalid"), Ipv4Addr::new(1, 2, 3, 4), None)]
    #[case(
        Some("invalid"),
        Some("HEXE-d887508b-036e-42b5-89f3-0754617036bb"),
        Ipv4Addr::UNSPECIFIED,
        Some(Uuid::parse_str("d887508b-036e-42b5-89f3-0754617036bb").unwrap())
    )]
    #[tokio::test]
    async fn test_from_request_parts(
        #[case] ip: Option<&str>,
        #[case] api_key: Option<&str>,
        #[case] expected_ip: Ipv4Addr,
        #[case] expected_api_key: Option<Uuid>,
    ) {
        let mut headers = HeaderMap::new();
        if let Some(ip) = ip {
            headers.insert("CF-Connecting-IP", ip.parse().unwrap());
        }
        if let Some(api_key) = api_key {
            headers.insert("X-API-Key", api_key.parse().unwrap());
        }
        let mut request = http::Request::new(());
        *request.headers_mut() = headers;
        let (mut parts, _) = request.into_parts();

        let rate_limit_key = RateLimitKey::from_request_parts(&mut parts, &())
            .await
            .unwrap();

        assert_eq!(rate_limit_key.ip, expected_ip);
        assert_eq!(rate_limit_key.api_key, expected_api_key);
    }
}
