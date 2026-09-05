//! MCP (Model Context Protocol) server exposing read-only SQL over the public parquet dumps.
//!
//! Served statelessly (no `Mcp-Session-Id`) because the API runs several replicas behind
//! one hostname.

use std::sync::Arc;

use rmcp::transport::StreamableHttpService;
use rmcp::transport::streamable_http_server::StreamableHttpServerConfig;
use rmcp::transport::streamable_http_server::session::never::NeverSessionManager;
use utoipa_axum::router::OpenApiRouter;

pub(crate) use self::catalog::{CatalogError, SnapshotCatalog};
use self::server::McpServer;
use crate::SHUTDOWN_TOKEN;
use crate::context::AppState;

mod catalog;
mod ddl;
mod format;
mod server;

pub(super) fn router(state: &AppState) -> OpenApiRouter<AppState> {
    let catalog = Arc::clone(&state.mcp_catalog);
    let config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .with_cancellation_token(SHUTDOWN_TOKEN.child_token())
        .disable_allowed_hosts();
    let service = StreamableHttpService::new(
        move || {
            Ok(McpServer {
                catalog: Arc::clone(&catalog),
            })
        },
        Arc::new(NeverSessionManager::default()),
        config,
    );
    OpenApiRouter::new().route_service("/mcp", service)
}
