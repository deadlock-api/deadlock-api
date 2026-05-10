mod cost;
mod filters;
mod projection;
mod schema;
mod sql;
mod types;

use core::time::Duration;
use std::sync::OnceLock;

use async_graphql::http::GraphiQLSource;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::State;
use axum::response::{Html, IntoResponse};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::context::AppState;
use crate::error::APIError;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

use schema::{GraphQLSchema, build_schema};

pub(super) const RATE_LIMIT_KEY: &str = "graphql_match_player";

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
| IP | 10req/min |
| Key | 10req/10s |
| Global | 100req/min |
    "
)]
async fn playground() -> impl IntoResponse {
    Html(GraphiQLSource::build().endpoint("/v1/graphql").finish())
}

async fn graphql_handler(
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
    req: GraphQLRequest,
) -> Result<GraphQLResponse, APIError> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            RATE_LIMIT_KEY,
            &[
                Quota::ip_limit(10, Duration::from_mins(1)),
                Quota::key_limit(10, Duration::from_secs(10)),
                Quota::global_limit(100, Duration::from_mins(1)),
            ],
        )
        .await?;

    let request = req.into_inner().data(state).data(rate_limit_key);
    Ok(shared_schema().execute(request).await.into())
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
