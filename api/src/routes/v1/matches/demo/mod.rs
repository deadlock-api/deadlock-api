mod demofusion;
mod download;
mod format;
mod job;
mod live_query;
mod schema;
mod status;
mod submit;
mod worker;

use core::time::Duration;

use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

pub(crate) use worker::DemoQueryQueue;

use crate::context::AppState;
use crate::middleware::cache::CacheControlMiddleware;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum OutputFormat {
    /// Apache Parquet. Handles the full Arrow type set; recommended.
    #[default]
    Parquet,
    /// Newline-delimited JSON. Convenient, but cannot represent every column type.
    Ndjson,
}

impl OutputFormat {
    pub(crate) fn extension(self) -> &'static str {
        match self {
            Self::Parquet => "parquet",
            Self::Ndjson => "ndjson",
        }
    }

    /// Suffix of the uploaded object. NDJSON is zstd-compressed on upload; Parquet
    /// already compresses internally and is stored as-is.
    pub(crate) fn object_extension(self) -> &'static str {
        match self {
            Self::Parquet => "parquet",
            Self::Ndjson => "ndjson.zst",
        }
    }
}

/// Stable id for a `(match_id, query, format)` triple. Doubles as the R2 object key,
/// so identical submissions coalesce and reuse a cached result.
fn job_id(match_id: u64, query: &str, format: OutputFormat) -> String {
    let mut hasher = Md5::new();
    hasher.update(match_id.to_le_bytes());
    hasher.update([0]);
    hasher.update(query.as_bytes());
    hasher.update([0]);
    hasher.update(format.extension().as_bytes());
    hex::encode(hasher.finalize())
}

#[derive(OpenApi)]
#[openapi(tags((name = "Demo", description = "
Query and inspect match demo files: discover the queryable schema and run SQL extractions
over a demo's entity and event tables.
")))]
struct ApiDoc;

pub(super) fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi())
        .merge(
            OpenApiRouter::new()
                .routes(routes!(schema::schema))
                .layer(CacheControlMiddleware::new(Duration::from_hours(24))),
        )
        .routes(routes!(submit::submit))
        .routes(routes!(status::status))
        .routes(routes!(live_query::live_query))
}
