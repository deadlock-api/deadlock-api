use std::sync::{Arc, OnceLock};
use std::time::Instant;

use async_graphql::ServerResult;
use async_graphql::extensions::{
    Extension, ExtensionContext, ExtensionFactory, NextParseQuery, NextRequest, NextValidation,
};
use async_graphql::parser::types::ExecutableDocument;
use async_graphql::{Response, ServerError, ValidationResult, Variables};

use crate::routes::v1::graphql::cost::COMPLEXITY_LIMIT;
use tracing::Instrument as _;

/// Emits Prometheus metrics and a tracing span (with the validated complexity and depth) for
/// every GraphQL request, and rejects queries over [`COMPLEXITY_LIMIT`] — after validation, so
/// a rejected query still reports (and logs) its complexity.
///
/// Per-request metrics:
/// - `graphql_requests_total{status}` — ok / error
/// - `graphql_request_duration_seconds`
/// - `graphql_query_complexity`
/// - `graphql_query_depth`
pub(super) struct MetricsExtension;

impl ExtensionFactory for MetricsExtension {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(MetricsExtensionInner::default())
    }
}

#[derive(Default)]
struct MetricsExtensionInner {
    validation_result: OnceLock<ValidationResult>,
}

#[async_trait::async_trait]
impl Extension for MetricsExtensionInner {
    async fn request(&self, ctx: &ExtensionContext<'_>, next: NextRequest<'_>) -> Response {
        let start = Instant::now();
        let span = tracing::info_span!(
            "graphql.request",
            graphql.complexity = tracing::field::Empty,
            graphql.depth = tracing::field::Empty,
        );
        let resp = next.run(ctx).instrument(span.clone()).await;
        let elapsed = start.elapsed().as_secs_f64();
        let status = if resp.is_err() { "error" } else { "ok" };

        metrics::counter!("graphql_requests_total", "status" => status).increment(1);
        metrics::histogram!("graphql_request_duration_seconds").record(elapsed);

        if let Some(vr) = self.validation_result.get() {
            #[expect(
                clippy::cast_precision_loss,
                reason = "metric/ratio values are far below f64 precision limits"
            )]
            metrics::histogram!("graphql_query_complexity").record(vr.complexity as f64);
            #[expect(
                clippy::cast_precision_loss,
                reason = "metric/ratio values are far below f64 precision limits"
            )]
            metrics::histogram!("graphql_query_depth").record(vr.depth as f64);
            span.record("graphql.complexity", vr.complexity);
            span.record("graphql.depth", vr.depth);
        }

        resp
    }

    async fn parse_query(
        &self,
        ctx: &ExtensionContext<'_>,
        query: &str,
        variables: &Variables,
        next: NextParseQuery<'_>,
    ) -> ServerResult<ExecutableDocument> {
        tracing::debug!(query, "graphql query received");
        next.run(ctx, query, variables).await
    }

    async fn validation(
        &self,
        ctx: &ExtensionContext<'_>,
        next: NextValidation<'_>,
    ) -> Result<ValidationResult, Vec<ServerError>> {
        let result = next.run(ctx).await?;
        // Validation runs once per request; should it run again, the first result is kept.
        self.validation_result.get_or_init(|| result);
        if result.complexity > COMPLEXITY_LIMIT {
            return Err(vec![ServerError::new(
                format!(
                    "Query complexity {} exceeds the limit of {COMPLEXITY_LIMIT} (one point is about \
                     1 ms of database time). Lower `limit`, select fewer fields or narrow `where` \
                     (an `account_id`, `match_id` or `start_time` range).",
                    result.complexity
                ),
                None,
            )]);
        }
        Ok(result)
    }
}
