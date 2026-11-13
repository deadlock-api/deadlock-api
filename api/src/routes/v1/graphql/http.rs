//! HTTP status and response shape depend on whether GraphQL execution began,
//! not on whether execution returned data (non-null errors can null the root).

use core::sync::atomic::{AtomicBool, Ordering};
use std::collections::BTreeMap;
use std::sync::Arc;

use async_graphql::extensions::{
    Extension, ExtensionContext, ExtensionFactory, NextExecute, NextParseQuery,
};
use async_graphql::parser::types::ExecutableDocument;
use async_graphql::{Response as GraphQLResult, ServerError, ServerResult, Value, Variables};
use async_graphql_axum::GraphQLResponse;
use axum::Json;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse as _, Response};
use serde::Serialize;

#[derive(Debug, Default)]
pub(super) struct RequestState {
    modern_response: bool,
    parsed: AtomicBool,
    execution_started: AtomicBool,
}

#[derive(Serialize)]
struct RequestError<'a> {
    errors: &'a [ServerError],
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    extensions: &'a BTreeMap<String, Value>,
}

impl RequestState {
    pub(super) fn new(headers: &HeaderMap) -> Self {
        // Opt in only when the client explicitly accepts the GraphQL response
        // media type. Missing Accept, wildcards, and legacy JSON keep the old
        // status and body, including `data: null` on request errors.
        let modern_response = headers.get_all(header::ACCEPT).iter().any(|value| {
            value.to_str().is_ok_and(|value| {
                value.split(',').any(|media_type| {
                    let mut parts = media_type.split(';');
                    parts.next().is_some_and(|name| {
                        name.trim()
                            .eq_ignore_ascii_case("application/graphql-response+json")
                    }) && parts.all(|parameter| {
                        let Some((name, value)) = parameter.trim().split_once('=') else {
                            return !parameter.trim().eq_ignore_ascii_case("q");
                        };
                        !name.trim().eq_ignore_ascii_case("q")
                            || value
                                .trim()
                                .parse::<f32>()
                                .is_ok_and(|q| q > 0.0 && q <= 1.0)
                    })
                })
            })
        });
        Self {
            modern_response,
            ..Self::default()
        }
    }

    pub(super) fn build_response(&self, result: GraphQLResult) -> Response {
        if !self.modern_response || self.execution_started.load(Ordering::Relaxed) {
            // Preserve the library's cache control and resolver-provided headers.
            return GraphQLResponse::from(result).into_response();
        }

        // async-graphql serializes `data: null` even for request errors. The
        // GraphQL spec requires `data` to be absent when execution never began.
        let mut response = Json(RequestError {
            errors: &result.errors,
            extensions: &result.extensions,
        })
        .into_response();
        *response.status_mut() = if self.parsed.load(Ordering::Relaxed) {
            StatusCode::UNPROCESSABLE_ENTITY
        } else {
            StatusCode::BAD_REQUEST
        };
        response.headers_mut().extend(result.http_headers);
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/graphql-response+json"),
        );
        response
    }
}

#[derive(Debug)]
pub(super) struct HttpExtension;

impl ExtensionFactory for HttpExtension {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(Self)
    }
}

#[async_trait::async_trait]
impl Extension for HttpExtension {
    async fn parse_query(
        &self,
        ctx: &ExtensionContext<'_>,
        query: &str,
        variables: &Variables,
        next: NextParseQuery<'_>,
    ) -> ServerResult<ExecutableDocument> {
        let result = next.run(ctx, query, variables).await;
        if result.is_ok()
            && let Some(state) = ctx.data_opt::<Arc<RequestState>>()
        {
            state.parsed.store(true, Ordering::Relaxed);
        }
        result
    }

    async fn execute(
        &self,
        ctx: &ExtensionContext<'_>,
        operation_name: Option<&str>,
        next: NextExecute<'_>,
    ) -> GraphQLResult {
        if let Some(state) = ctx.data_opt::<Arc<RequestState>>() {
            state.execution_started.store(true, Ordering::Relaxed);
        }
        next.run(ctx, operation_name).await
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::unused_async,
        reason = "GraphQL error resolver fixtures must be async"
    )]

    use async_graphql::{Context, EmptyMutation, EmptySubscription, Object, Request, Schema};
    use axum::body::to_bytes;
    use serde_json::{Value as JsonValue, json};

    use super::*;
    use crate::routes::v1::graphql::schema::build_schema;

    struct Query;

    #[Object]
    impl Query {
        #[graphql(cache_control(max_age = 60))]
        async fn ok(&self, ctx: &Context<'_>) -> i32 {
            ctx.insert_http_header("x-graphql-test", "preserved");
            42
        }

        async fn echo(&self, value: i32) -> i32 {
            value
        }

        async fn optional_failure(&self) -> async_graphql::Result<Option<i32>> {
            Err("lookup failed".into())
        }

        async fn fatal(&self) -> async_graphql::Result<i32> {
            Err("root failed".into())
        }
    }

    fn request_state(accept: Option<&str>) -> Arc<RequestState> {
        let mut headers = HeaderMap::new();
        if let Some(accept) = accept {
            headers.insert(header::ACCEPT, HeaderValue::from_str(accept).unwrap());
        }
        Arc::new(RequestState::new(&headers))
    }

    async fn execute_with_accept(request: impl Into<Request>, accept: Option<&str>) -> Response {
        let state = request_state(accept);
        let result = Schema::build(Query, EmptyMutation, EmptySubscription)
            .limit_depth(2)
            .extension(HttpExtension)
            .finish()
            .execute(request.into().data(Arc::clone(&state)))
            .await;
        state.build_response(result)
    }

    async fn execute(request: impl Into<Request>) -> Response {
        execute_with_accept(request, Some("application/graphql-response+json")).await
    }

    async fn response_body(response: Response) -> JsonValue {
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/graphql-response+json"
        );
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn syntax_errors_are_400_without_data() {
        let response = execute("{ ok").await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = response_body(response).await;
        assert!(body.get("data").is_none());
        assert!(body["errors"][0]["message"].is_string());
    }

    #[tokio::test]
    async fn validation_and_operation_selection_errors_are_422_without_data() {
        for request in [
            Request::new("{ nonexistent }"),
            Request::new("{ __schema { queryType { name } } }"),
            Request::new("query A { ok } query B { ok }"),
            Request::new("query A { ok }").operation_name("B"),
            Request::new("query($value: Int!) { echo(value: $value) }").variables(
                async_graphql::Variables::from_json(json!({"value": "invalid"})),
            ),
        ] {
            let response = execute(request).await;
            assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
            let body = response_body(response).await;
            assert!(body.get("data").is_none());
            assert!(body["errors"][0]["message"].is_string());
        }
    }

    #[tokio::test]
    async fn complexity_rejection_is_422_and_keeps_analyzer() {
        let state = request_state(Some("application/graphql-response+json"));
        let result = build_schema()
            .execute(
                Request::new("{ match_history(limit: 100) { match_id player_kills } }")
                    .data(Arc::clone(&state)),
            )
            .await;
        let response = state.build_response(result);
        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let body = response_body(response).await;
        assert!(body.get("data").is_none());
        assert!(
            body["errors"][0]["message"]
                .as_str()
                .unwrap()
                .starts_with("Query complexity")
        );
        assert!(body["extensions"]["analyzer"]["complexity"].is_number());
    }

    #[tokio::test]
    async fn execution_errors_remain_200_even_when_root_is_null() {
        let response = execute("{ ok optionalFailure }").await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response_body(response).await;
        assert_eq!(body["data"]["ok"], 42);
        assert_eq!(body["errors"][0]["path"], json!(["optionalFailure"]));

        let response = execute("{ fatal }").await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response_body(response).await;
        assert_eq!(body.get("data"), Some(&JsonValue::Null));
        assert_eq!(body["errors"][0]["message"], "root failed");
    }

    #[tokio::test]
    async fn successful_queries_keep_cache_control_and_resolver_headers() {
        let response = execute("{ ok }").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CACHE_CONTROL], "max-age=60");
        assert_eq!(response.headers()["x-graphql-test"], "preserved");
        assert_eq!(response_body(response).await, json!({"data": {"ok": 42}}));
    }

    #[tokio::test]
    async fn legacy_clients_keep_200_and_data_null_for_request_errors() {
        for accept in [
            None,
            Some("*/*"),
            Some("application/*"),
            Some("application/json"),
            Some("application/graphql-response+json;q=0, application/json"),
            Some("application/graphql-response+json;q=invalid"),
        ] {
            for query in ["{ ok", "{ nonexistent }"] {
                let response = execute_with_accept(query, accept).await;
                assert_eq!(response.status(), StatusCode::OK, "Accept: {accept:?}");
                let body = response_body(response).await;
                assert_eq!(body.get("data"), Some(&JsonValue::Null));
                assert!(body["errors"][0]["message"].is_string());
            }
        }
    }

    #[tokio::test]
    async fn explicit_accept_with_parameters_opts_into_request_error_statuses() {
        for accept in [
            "application/graphql-response+json, application/json;q=0.9",
            "application/json, application/graphql-response+json;q=0.5",
            "Application/GraphQL-Response+JSON; charset=utf-8; Q=1",
        ] {
            let response = execute_with_accept("{ nonexistent }", Some(accept)).await;
            assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
            assert!(response_body(response).await.get("data").is_none());
        }
    }
}
