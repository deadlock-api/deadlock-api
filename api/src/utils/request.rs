//! Request header helpers shared by middleware, extractors and the request span.

use axum::http::HeaderMap;
use axum::http::header::AsHeaderName;
use uuid::Uuid;

/// A header's value, if present and valid visible ASCII.
pub(crate) fn header_str(headers: &HeaderMap, name: impl AsHeaderName) -> Option<&str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

/// Parses an API key, with or without the `HEXE-` prefix, into its UUID.
pub(crate) fn parse_api_key_str(key: &str) -> Option<Uuid> {
    Uuid::parse_str(key.strip_prefix("HEXE-").unwrap_or(key)).ok()
}

/// The request's API key from the `X-API-Key` header.
///
/// `write_api_key_to_header` (the outermost middleware) copies a `?api_key=` query parameter or a
/// `Bearer` token into that header first, so this covers every way of passing a key.
pub(crate) fn parse_api_key(headers: &HeaderMap) -> Option<Uuid> {
    header_str(headers, "x-api-key").and_then(parse_api_key_str)
}

/// The client's IP address from proxy-set headers only: `CF-Connecting-IP` (set by Cloudflare),
/// then `X-Real-IP` (set by the reverse proxy). Use this where the client must not pick its own
/// identity, e.g. rate limiting.
pub(crate) fn trusted_client_ip(headers: &HeaderMap) -> Option<&str> {
    header_str(headers, "cf-connecting-ip")
        .or_else(|| header_str(headers, "x-real-ip"))
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// The client's IP address for logs and spans: [`trusted_client_ip`], falling back to the first
/// `X-Forwarded-For` entry (client supplied, so least trustworthy).
pub(crate) fn client_ip(headers: &HeaderMap) -> Option<&str> {
    trusted_client_ip(headers).or_else(|| {
        header_str(headers, "x-forwarded-for")
            .and_then(|s| s.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    })
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;

    #[rstest]
    #[case("HEXE-d887508b-036e-42b5-89f3-0754617036bb", true)]
    #[case("d887508b-036e-42b5-89f3-0754617036bb", true)]
    #[case("HEXE-invalid", false)]
    #[case("invalid", false)]
    fn test_parse_api_key_str(#[case] key: &str, #[case] valid: bool) {
        assert_eq!(
            parse_api_key_str(key),
            valid.then(|| Uuid::parse_str("d887508b-036e-42b5-89f3-0754617036bb").unwrap())
        );
    }

    #[rstest]
    #[case(&[("cf-connecting-ip", "1.1.1.1"), ("x-real-ip", "2.2.2.2"), ("x-forwarded-for", "3.3.3.3")], Some("1.1.1.1"))]
    #[case(&[("x-real-ip", "2.2.2.2"), ("x-forwarded-for", "3.3.3.3")], Some("2.2.2.2"))]
    #[case(&[("x-forwarded-for", " 3.3.3.3 , 4.4.4.4")], Some("3.3.3.3"))]
    #[case(&[("x-forwarded-for", "")], None)]
    #[case(&[], None)]
    fn test_client_ip(
        #[case] headers: &[(&'static str, &'static str)],
        #[case] expected: Option<&str>,
    ) {
        let mut map = HeaderMap::new();
        for (name, value) in headers {
            map.insert(*name, value.parse().unwrap());
        }
        assert_eq!(client_ip(&map), expected);
    }

    #[test]
    fn test_trusted_client_ip_ignores_forwarded_for() {
        let mut map = HeaderMap::new();
        map.insert("x-forwarded-for", "3.3.3.3".parse().unwrap());
        assert_eq!(trusted_client_ip(&map), None);
        map.insert("x-real-ip", "2.2.2.2".parse().unwrap());
        assert_eq!(trusted_client_ip(&map), Some("2.2.2.2"));
    }
}
