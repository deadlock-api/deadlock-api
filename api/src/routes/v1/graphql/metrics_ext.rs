use std::sync::Arc;
use std::time::Instant;

use async_graphql::ServerResult;
use async_graphql::extensions::{
    Extension, ExtensionContext, ExtensionFactory, NextParseQuery, NextRequest, NextValidation,
};
use async_graphql::parser::types::ExecutableDocument;
use async_graphql::{Response, ServerError, ValidationResult, Variables};
use tokio::sync::Mutex;
use tracing::Instrument as _;

/// Emits Prometheus metrics and a tracing span for every GraphQL request.
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
    validation_result: Mutex<Option<ValidationResult>>,
}

#[async_trait::async_trait]
impl Extension for MetricsExtensionInner {
    async fn request(&self, ctx: &ExtensionContext<'_>, next: NextRequest<'_>) -> Response {
        let start = Instant::now();
        let span = tracing::info_span!("graphql.request");
        let resp = next.run(ctx).instrument(span).await;
        let elapsed = start.elapsed().as_secs_f64();
        let status = if resp.is_err() { "error" } else { "ok" };

        metrics::counter!("graphql_requests_total", "status" => status).increment(1);
        metrics::histogram!("graphql_request_duration_seconds").record(elapsed);

        if let Some(vr) = self.validation_result.lock().await.take() {
            #[allow(clippy::cast_precision_loss)]
            metrics::histogram!("graphql_query_complexity").record(vr.complexity as f64);
            #[allow(clippy::cast_precision_loss)]
            metrics::histogram!("graphql_query_depth").record(vr.depth as f64);
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
        *self.validation_result.lock().await = Some(result);
        Ok(result)
    }
}
