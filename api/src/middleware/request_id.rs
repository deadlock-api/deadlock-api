use axum::extract::Request;
use axum::http::HeaderValue;
use axum::middleware::Next;
use axum::response::Response;
use uuid::Uuid;

use crate::utils::request::header_str;

/// Response header that carries the [`RequestId`].
const REQUEST_ID_HEADER: &str = "x-request-id";

/// Longest `cf-ray` value taken as the request id. Ray ids are 20 bytes (`<16 hex>-<colo>`); this
/// only bounds what a request that bypasses Cloudflare can put into the logs.
const MAX_RAY_LEN: usize = 64;

/// Correlation id of a request: Cloudflare's Ray id, or a fresh `UUIDv7` for requests that didn't
/// come through Cloudflare. It is on the request span (`http.request.id`), in `request_logs`
/// and in the `X-Request-Id` response header.
#[derive(Clone, Debug)]
pub(crate) struct RequestId(pub(crate) String);

impl RequestId {
    fn from_request(req: &Request) -> Self {
        let id = header_str(req.headers(), "cf-ray")
            .filter(|ray| !ray.is_empty() && ray.len() <= MAX_RAY_LEN)
            .map_or_else(|| Uuid::now_v7().to_string(), ToOwned::to_owned);
        Self(id)
    }
}

/// Attaches a [`RequestId`] to the request and echoes it in the `X-Request-Id` response header.
pub(crate) async fn request_id(mut req: Request, next: Next) -> Response {
    let id = RequestId::from_request(&req);
    let header = HeaderValue::from_str(&id.0).ok();
    req.extensions_mut().insert(id);
    let mut response = next.run(req).await;
    if let Some(header) = header {
        response.headers_mut().insert(REQUEST_ID_HEADER, header);
    }
    response
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::extract::Extension;
    use axum::http::Request;
    use axum::routing::get;
    use rstest::rstest;
    use tower::ServiceExt as _;

    use super::*;

    async fn send(cf_ray: Option<&str>) -> (String, String) {
        let app = Router::new()
            .route(
                "/",
                get(|Extension(id): Extension<RequestId>| async move { id.0 }),
            )
            .layer(axum::middleware::from_fn(request_id));
        let mut request = Request::builder().uri("/");
        if let Some(ray) = cf_ray {
            request = request.header("cf-ray", ray);
        }
        let response = app
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let header = header_str(response.headers(), REQUEST_ID_HEADER)
            .unwrap()
            .to_owned();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        (String::from_utf8(bytes.to_vec()).unwrap(), header)
    }

    #[tokio::test]
    async fn test_uses_cf_ray() {
        let (id, header) = send(Some("8f1a2b3c4d5e6f70-FRA")).await;
        assert_eq!(id, "8f1a2b3c4d5e6f70-FRA");
        assert_eq!(header, id);
    }

    #[rstest]
    #[case::missing(None)]
    #[case::empty(Some(String::new()))]
    #[case::too_long(Some("a".repeat(MAX_RAY_LEN + 1)))]
    #[tokio::test]
    async fn test_falls_back_to_uuid_v7(#[case] cf_ray: Option<String>) {
        let (id, header) = send(cf_ray.as_deref()).await;
        assert_eq!(Uuid::parse_str(&id).unwrap().get_version_num(), 7);
        assert_eq!(header, id);
    }
}
