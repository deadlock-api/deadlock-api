//! Decompress a demo, run the SQL query, and serialize the full result.

use std::io::Read;

use bytes::Bytes;
use datafusion::arrow::record_batch::RecordBatch;
use futures::TryStreamExt;
use reqwest::StatusCode;

use super::OutputFormat;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::demo::demofusion;

/// Decompress a fully-buffered single-stream `.bz2` into raw demo bytes.
///
/// A single bzip2 stream is inherently sequential to decode, so this is the only
/// concurrency available here; it runs on a blocking thread to keep the runtime free.
pub(super) async fn decompress(compressed: Bytes) -> APIResult<Bytes> {
    tokio::task::spawn_blocking(move || {
        let mut decoder = bzip2::read::BzDecoder::new(&compressed[..]);
        let mut out = Vec::with_capacity(compressed.len() * 5);
        decoder.read_to_end(&mut out)?;
        Ok::<_, std::io::Error>(Bytes::from(out))
    })
    .await
    .map_err(|e| APIError::internal(format!("Decompress task panicked: {e}")))?
    .map_err(APIError::from)
}

/// Run the query over the demo, collect every result batch, and serialize to `format`.
pub(super) async fn run_and_serialize(
    demo: Bytes,
    sql: &str,
    format: OutputFormat,
) -> APIResult<Bytes> {
    let stream = demofusion::query(demo, sql)
        .await
        .map_err(|e| map_demofusion_err(&e))?;
    let schema = stream.schema();
    let batches: Vec<RecordBatch> = stream
        .try_collect()
        .await
        .map_err(|e| APIError::status_msg(StatusCode::BAD_REQUEST, format!("Query failed: {e}")))?;

    let bytes = tokio::task::spawn_blocking(move || match format {
        OutputFormat::Parquet => to_parquet(&schema, &batches),
        OutputFormat::Ndjson => to_ndjson(&batches),
    })
    .await
    .map_err(|e| APIError::internal(format!("Serialize task panicked: {e}")))??;

    Ok(bytes)
}

fn to_parquet(
    schema: &datafusion::arrow::datatypes::SchemaRef,
    batches: &[RecordBatch],
) -> APIResult<Bytes> {
    use datafusion::parquet::arrow::ArrowWriter;

    let mut buf = Vec::new();
    let mut writer = ArrowWriter::try_new(&mut buf, schema.clone(), None)
        .map_err(|e| APIError::internal(format!("Parquet writer init failed: {e}")))?;
    for batch in batches {
        writer
            .write(batch)
            .map_err(|e| APIError::internal(format!("Parquet write failed: {e}")))?;
    }
    writer
        .close()
        .map_err(|e| APIError::internal(format!("Parquet close failed: {e}")))?;
    Ok(Bytes::from(buf))
}

fn to_ndjson(batches: &[RecordBatch]) -> APIResult<Bytes> {
    use datafusion::arrow::json::LineDelimitedWriter;

    let mut buf = Vec::new();
    let mut writer = LineDelimitedWriter::new(&mut buf);
    for batch in batches {
        writer.write(batch).map_err(|e| {
            APIError::status_msg(
                StatusCode::BAD_REQUEST,
                format!(
                    "NDJSON serialization failed (a projected column type may be unsupported): {e}"
                ),
            )
        })?;
    }
    writer
        .finish()
        .map_err(|e| APIError::internal(format!("NDJSON finish failed: {e}")))?;
    Ok(Bytes::from(buf))
}

fn map_demofusion_err(e: &demofusion::Error) -> APIError {
    match e {
        demofusion::Error::DataFusion(_) | demofusion::Error::Schema(_) => {
            APIError::status_msg(StatusCode::BAD_REQUEST, format!("Invalid query: {e}"))
        }
        _ => APIError::internal(format!("Failed to query demo: {e}")),
    }
}
