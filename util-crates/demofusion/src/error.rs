use thiserror::Error;

/// Anything that can go wrong while answering a [`super::query`].
#[derive(Error, Debug)]
pub enum DemoError {
    #[error("Arrow error: {0}")]
    Arrow(#[from] datafusion::arrow::error::ArrowError),

    #[error("DataFusion error: {0}")]
    DataFusion(#[from] datafusion::error::DataFusionError),

    #[error("Demo parse error: {0}")]
    Demo(#[from] haste_core::demofile::DemoHeaderError),

    #[error("Schema discovery error: {0}")]
    Schema(String),

    /// The bytes provided ended before the demo's send-tables, so no schema could
    /// be built yet. Supply more of the demo's prefix and retry — this is the
    /// "need more bytes" signal for streaming/partial-download callers.
    #[error("incomplete demo: more bytes are needed before the schema is available")]
    IncompleteDemo,

    /// A live broadcast could not be fetched from its relay (see [`super::query_live`]).
    #[error("live broadcast error: {0}")]
    Broadcast(String),

    /// The blocking demo parse task panicked or was cancelled.
    #[error("demo parse task failed: {0}")]
    ParseTask(String),
}

pub type Result<T> = core::result::Result<T, DemoError>;
