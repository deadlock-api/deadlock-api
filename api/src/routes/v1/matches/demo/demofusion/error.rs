use thiserror::Error;

/// Anything that can go wrong while answering a [`super::query`].
#[derive(Error, Debug)]
pub(crate) enum Error {
    #[error("Arrow error: {0}")]
    Arrow(#[from] arrow::error::ArrowError),

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
}

pub(crate) type Result<T> = core::result::Result<T, Error>;
