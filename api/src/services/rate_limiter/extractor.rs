use core::future::{Future, ready};
use core::net::Ipv4Addr;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use strum::Display;
use uuid::Uuid;

use crate::error::APIError;

#[derive(Debug, Clone, PartialEq, Eq, Display)]
pub(super) enum Client {
    #[strum(to_string = "{0}")]
    Ip(Ipv4Addr),
    #[strum(to_string = "worker:{0}")]
    Worker(String),
}

#[derive(Debug, Clone)]
pub(crate) struct RateLimitKey {
    pub(crate) api_key: Option<Uuid>,
    pub(super) client: Client,
}

impl<S> FromRequestParts<S> for RateLimitKey
where
    S: Send + Sync,
{
    type Rejection = APIError;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        let worker = parts
            .headers
            .get("CF-Worker")
            .and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty());
        let client = match worker {
            Some(zone) => Client::Worker(zone.to_owned()),
            None => Client::Ip(
                parts
                    .headers
                    .get("Cf-Pseudo-IPv4")
                    .or(parts.headers.get("CF-Connecting-IP"))
                    .or(parts.headers.get("X-Real-IP"))
                    .and_then(|v| v.to_str().ok().and_then(|s| s.parse().ok()))
                    .unwrap_or(Ipv4Addr::UNSPECIFIED),
            ),
        };

        let api_key = parts
            .headers
            .get("X-API-Key")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| Uuid::parse_str(s.strip_prefix("HEXE-").unwrap_or(s)).ok());
        ready(Ok(Self { api_key, client }))
    }
}

#[cfg(test)]
mod tests {
    use axum::http;
    use axum::http::HeaderMap;
    use rstest::rstest;

    use super::*;

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
        let (mut parts, ()) = request.into_parts();

        let rate_limit_key = RateLimitKey::from_request_parts(&mut parts, &())
            .await
            .unwrap();

        assert_eq!(rate_limit_key.client, Client::Ip(expected_ip));
        assert_eq!(rate_limit_key.api_key, expected_api_key);
    }

    #[rstest]
    #[case("example.com", Client::Worker("example.com".to_owned()))]
    #[case("", Client::Ip(Ipv4Addr::new(1, 2, 3, 4)))]
    #[tokio::test]
    async fn test_cf_worker_header(#[case] worker: &str, #[case] expected: Client) {
        let mut headers = HeaderMap::new();
        headers.insert("CF-Connecting-IP", "1.2.3.4".parse().unwrap());
        headers.insert("CF-Worker", worker.parse().unwrap());
        let mut request = http::Request::new(());
        *request.headers_mut() = headers;
        let (mut parts, ()) = request.into_parts();

        let rate_limit_key = RateLimitKey::from_request_parts(&mut parts, &())
            .await
            .unwrap();

        assert_eq!(rate_limit_key.client, expected);
        assert_eq!(rate_limit_key.client.to_string(), expected.to_string());
    }

    #[test]
    fn test_client_display() {
        assert_eq!(Client::Ip(Ipv4Addr::new(1, 2, 3, 4)).to_string(), "1.2.3.4");
        assert_eq!(
            Client::Worker("example.com".to_owned()).to_string(),
            "worker:example.com"
        );
    }
}
