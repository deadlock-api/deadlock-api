//! Decompress a demo, run the SQL query, and serialize the full result.

use std::io::Read;

use bytes::Bytes;
use datafusion::arrow::record_batch::RecordBatch;
use futures::TryStreamExt;
use reqwest::StatusCode;

use super::OutputFormat;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::demo::demofusion;
use crate::utils::compression::ZSTD_MAGIC;

/// Decompress a fully-buffered single-stream demo into raw demo bytes.
///
/// A single stream is inherently sequential to decode, so this is the only
/// concurrency available here; it runs on a blocking thread to keep the runtime free.
///
/// The container is sniffed from the magic bytes: Valve kept the `.dem.bz2` name but
/// switched newer matches' actual compression to zstd.
pub(super) async fn decompress(compressed: Bytes) -> APIResult<Bytes> {
    tokio::task::spawn_blocking(move || {
        let mut out = Vec::with_capacity(compressed.len() * 5);
        if compressed.starts_with(&ZSTD_MAGIC) {
            zstd::stream::read::Decoder::new(&compressed[..])?.read_to_end(&mut out)?;
        } else {
            bzip2::read::BzDecoder::new(&compressed[..]).read_to_end(&mut out)?;
        }
        Ok::<_, std::io::Error>(Bytes::from(out))
    })
    .await
    .map_err(|e| APIError::internal(format!("Decompress task panicked: {e}")))?
    .map_err(APIError::from)
}

/// Run the query over the demo, collect every result batch, and serialize to `format`,
/// returning the upload-ready artifact (NDJSON is zstd-compressed; see [`compress_zstd`]).
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
        OutputFormat::Ndjson => to_ndjson(&batches).and_then(|raw| compress_zstd(&raw)),
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

/// Level 3 (zstd's default) — NDJSON is highly redundant, so it already sheds most of
/// the bulk, and the higher levels cost far more CPU than the upload saves.
const ZSTD_LEVEL: i32 = 3;

fn compress_zstd(raw: &[u8]) -> APIResult<Bytes> {
    zstd::stream::encode_all(raw, ZSTD_LEVEL)
        .map(Bytes::from)
        .map_err(|e| APIError::internal(format!("NDJSON compression failed: {e}")))
}

pub(super) fn map_demofusion_err(e: &demofusion::Error) -> APIError {
    match e {
        demofusion::Error::DataFusion(_) | demofusion::Error::Schema(_) => {
            APIError::status_msg(StatusCode::BAD_REQUEST, format!("Invalid query: {e}"))
        }
        // Only the live-broadcast path produces this; a relay fetch failure is an upstream 502.
        demofusion::Error::Broadcast(_) => APIError::status_msg(
            StatusCode::BAD_GATEWAY,
            format!("Live broadcast error: {e}"),
        ),
        _ => APIError::internal(format!("Failed to query demo: {e}")),
    }
}
