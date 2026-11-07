use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::services::ch_cost;

/// Reports what the request's `ClickHouse` queries cost as `X-CH-*` response headers (see
/// [`ch_cost`]), and as a [`ch_cost::ChCost`] response extension for `track_requests`. Responses
/// that ran no tracked query get neither.
pub(crate) async fn ch_cost_headers(req: Request, next: Next) -> Response {
    let (mut response, cost) = ch_cost::track(next.run(req)).await;
    if !cost.is_empty() {
        cost.insert_headers(response.headers_mut());
        response.extensions_mut().insert(cost);
    }
    response
}

#[cfg(test)]
mod tests {
    use axum::Router;
    use axum::body::Body;
    use axum::middleware::from_fn;
    use axum::routing::get;
    use tower::ServiceExt as _;

    use super::*;

    fn app() -> Router {
        Router::new()
            .route(
                "/query",
                get(async || {
                    ch_cost::record(None);
                    "ok"
                }),
            )
            .route("/static", get(async || "ok"))
            .layer(from_fn(ch_cost_headers))
    }

    async fn headers(path: &str) -> axum::http::HeaderMap {
        let request = Request::builder().uri(path).body(Body::empty()).unwrap();
        app().oneshot(request).await.unwrap().headers().clone()
    }

    #[tokio::test]
    async fn adds_headers_after_queries() {
        let headers = headers("/query").await;
        assert_eq!(headers.get("x-ch-queries").unwrap(), "1");
        assert_eq!(headers.get("x-ch-elapsed-ms").unwrap(), "0.000");
    }

    #[tokio::test]
    async fn no_headers_without_queries() {
        assert!(headers("/static").await.get("x-ch-queries").is_none());
    }
}
