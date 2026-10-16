mod assets;
mod builds;
mod cost;
mod filters;
mod metrics_ext;
mod patches;
mod projection;
pub(crate) mod salts;
mod schema;
mod sql;
mod types;

use core::sync::atomic::{AtomicU32, Ordering};
use core::time::Duration;
use std::sync::OnceLock;

use async_graphql::dataloader::DataLoader;
use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::State;
use axum::response::{Html, IntoResponse, Response};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use uuid::Uuid;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

use builds::HeroBuildLoader;
use schema::{GraphQLSchema, build_schema};

pub(super) const RATE_LIMIT_KEY: &str = "graphql_match_player";

/// Longest query or variables text kept in `request_logs`; the body limit alone allows 10 MB.
const MAX_LOGGED_TEXT_BYTES: usize = 64 * 1024;

/// Ties a GraphQL request's `request_logs` row (`graphql_request_id`) to the `system.query_log`
/// rows of the `ClickHouse` queries it ran (`query_id` = `{id}-{n}`), so its complexity can be
/// compared with the CPU it cost. The batched nested lookups (`steam`, `salts`) serve many
/// requests per query and aren't tagged.
pub(super) struct GraphQLRequestId {
    id: Uuid,
    next_query: AtomicU32,
}

impl GraphQLRequestId {
    pub(super) fn next_query_id(&self) -> String {
        format!(
            "{}-{}",
            self.id,
            self.next_query.fetch_add(1, Ordering::Relaxed)
        )
    }
}

/// What `track_requests` logs for a GraphQL request, handed over as a response extension.
#[derive(Clone, Debug)]
pub(crate) struct GraphQLRequestLog {
    pub(crate) request_id: Uuid,
    pub(crate) query: String,
    /// JSON object, `None` when the request had no variables.
    pub(crate) variables: Option<String>,
    /// `None` when the request failed before validation.
    pub(crate) complexity: Option<u64>,
    pub(crate) depth: Option<u64>,
}

impl GraphQLRequestLog {
    fn new(req: &async_graphql::Request) -> Self {
        let variables = (!req.variables.is_empty())
            .then(|| serde_json::to_string(&req.variables).ok())
            .flatten();
        Self {
            request_id: Uuid::new_v4(),
            query: truncated(&req.query),
            variables: variables.as_deref().map(truncated),
            complexity: None,
            depth: None,
        }
    }

    /// Fills the cost from the `analyzer` response extension.
    fn set_cost(&mut self, resp: &async_graphql::Response) {
        let Some(async_graphql::Value::Object(analyzer)) = resp.extensions.get("analyzer") else {
            return;
        };
        let field = |name: &str| match analyzer.get(name)? {
            async_graphql::Value::Number(n) => n.as_u64(),
            _ => None,
        };
        self.complexity = field("complexity");
        self.depth = field("depth");
    }
}

fn truncated(text: &str) -> String {
    text[..text.floor_char_boundary(MAX_LOGGED_TEXT_BYTES)].to_owned()
}

fn shared_schema() -> &'static GraphQLSchema {
    static SCHEMA: OnceLock<GraphQLSchema> = OnceLock::new();
    SCHEMA.get_or_init(build_schema)
}

#[utoipa::path(
    get,
    path = "/graphql",
    responses(
        (status = OK, content_type = "text/html", description = "GraphiQL playground UI")
    ),
    tags = ["GraphQL"],
    summary = "GraphQL Playground",
    description = "
Interactive GraphiQL playground for exploring the GraphQL API.

Open this endpoint in a browser to access the playground. Send GraphQL queries via `POST /v1/graphql` with a JSON body of the form `{ \"query\": \"...\", \"variables\": {...} }`.

### Rate Limits (POST):
| Type | Limit |
| ---- | ----- |
| IP | 300req/min |
| Key | 500req/10s |
| Global | 5000req/min |
    "
)]
async fn playground() -> impl IntoResponse {
    Html(GraphiQLSource::build().endpoint("/v1/graphql").finish())
}

async fn graphql_handler(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    req: GraphQLRequest,
) -> Result<Response, APIError> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            RATE_LIMIT_KEY,
            &[
                Quota::ip_limit(300, Duration::from_mins(1)),
                Quota::key_limit(500, Duration::from_secs(10)),
                Quota::global_limit(5000, Duration::from_mins(1)),
            ],
        )
        .await?;

    let hero_build_loader =
        DataLoader::new(HeroBuildLoader::new(state.pg_client.clone()), tokio::spawn);
    let request = req.into_inner();
    let mut log = GraphQLRequestLog::new(&request);
    let request = request
        .data(state)
        .data(rate_limit_key)
        .data(hero_build_loader)
        .data(GraphQLRequestId {
            id: log.request_id,
            next_query: AtomicU32::new(0),
        });
    let resp = shared_schema().execute(request).await;
    log.set_cost(&resp);
    let mut response = GraphQLResponse::from(resp).into_response();
    response.extensions_mut().insert(log);
    Ok(response)
}

#[derive(OpenApi)]
#[openapi(tags((name = "GraphQL", description = "
GraphQL API for flexible match and player queries.

Visit [/v1/graphql](/v1/graphql) in a browser for the interactive GraphiQL playground.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    let _ = shared_schema();
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(playground))
        .route("/graphql", axum::routing::post(graphql_handler))
}
