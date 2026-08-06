//! Decompress a demo, run the SQL query, and stream the serialized result.

use std::io::{Read, Write};

use bytes::{Bytes, BytesMut};
use datafusion::arrow::datatypes::SchemaRef;
use datafusion::arrow::record_batch::RecordBatch;
use futures::StreamExt;
use reqwest::StatusCode;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::OutputFormat;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::demo::demofusion;
use crate::utils::compression::ZSTD_MAGIC;

/// Result batches queued between the query and the serializer, and serialized chunks queued
/// between the serializer and the uploader. Both are deliberately tiny: the point of streaming
/// is to hold a few pieces at a time rather than the whole artifact.
const BATCH_QUEUE_DEPTH: usize = 4;
const CHUNK_QUEUE_DEPTH: usize = 2;

/// Hard ceiling on one extract. Serialization is streamed, so this no longer bounds memory —
/// it bounds a single pathological query (an unfiltered `SELECT *` over a long match can
/// serialize tens of GiB), which would otherwise monopolize a worker slot and R2 for hours.
/// Well above any real extract: the largest observed in production are a few hundred MiB.
const MAX_ARTIFACT_BYTES: u64 = 8 << 30;

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

/// An artifact being serialized in the background. [`ArtifactStream::chunks`] yields
/// upload-ready pieces; [`ArtifactStream::finish`] reports the pipeline's terminal result
/// and must be awaited once the chunks are drained, since a mid-stream query or
/// serialization failure can only surface there.
pub(super) struct ArtifactStream {
    pub(super) chunks: mpsc::Receiver<Bytes>,
    pipeline: JoinHandle<APIResult<()>>,
}

impl ArtifactStream {
    pub(super) async fn finish(self) -> APIResult<()> {
        self.pipeline
            .await
            .map_err(|e| APIError::internal(format!("Serialize task panicked: {e}")))?
    }
}

/// Run the query over the demo and serialize the result to `format`, emitting the artifact as
/// `chunk_size` pieces as they are produced.
///
/// Neither the full result set nor the full artifact is ever resident: batches flow from
/// `DataFusion` into the format writer and out to the uploader, with only
/// [`BATCH_QUEUE_DEPTH`]/[`CHUNK_QUEUE_DEPTH`] pieces in flight. The bounded channels also
/// apply backpressure, so a slow upload throttles the query rather than growing a buffer.
pub(super) async fn run_and_stream(
    demo: Bytes,
    sql: &str,
    format: OutputFormat,
    chunk_size: usize,
) -> APIResult<ArtifactStream> {
    let mut stream = demofusion::query(demo, sql)
        .await
        .map_err(|e| map_demofusion_err(&e))?;
    let schema = stream.schema();

    let (batch_tx, batch_rx) = mpsc::channel::<RecordBatch>(BATCH_QUEUE_DEPTH);
    let (chunk_tx, chunk_rx) = mpsc::channel::<Bytes>(CHUNK_QUEUE_DEPTH);

    let serializer = tokio::task::spawn_blocking(move || {
        serialize(format, &schema, chunk_size, batch_rx, chunk_tx)
    });

    let pipeline = tokio::spawn(async move {
        while let Some(batch) = stream.next().await {
            let batch = batch.map_err(|e| {
                APIError::status_msg(StatusCode::BAD_REQUEST, format!("Query failed: {e}"))
            })?;
            // A closed receiver means the serializer already failed; it holds the useful
            // error, so stop pumping and let the join below surface it.
            if batch_tx.send(batch).await.is_err() {
                break;
            }
        }
        drop(batch_tx);
        serializer
            .await
            .map_err(|e| APIError::internal(format!("Serialize task panicked: {e}")))?
    });

    Ok(ArtifactStream {
        chunks: chunk_rx,
        pipeline,
    })
}

/// Drive the format writer from the batch channel on a blocking thread. Runs until the query
/// side drops its sender, then closes the writer so the trailing bytes (parquet footer, zstd
/// frame epilogue) are flushed before the chunk channel closes.
fn serialize(
    format: OutputFormat,
    schema: &SchemaRef,
    chunk_size: usize,
    batches: mpsc::Receiver<RecordBatch>,
    chunks: mpsc::Sender<Bytes>,
) -> APIResult<()> {
    let sink = ChunkSink::new(chunks, chunk_size);
    match format {
        OutputFormat::Parquet => {
            use datafusion::parquet::arrow::ArrowWriter;

            let mut writer = ArrowWriter::try_new(sink, schema.clone(), None)
                .map_err(|e| APIError::internal(format!("Parquet writer init failed: {e}")))?;
            drain(batches, |batch| {
                writer
                    .write(batch)
                    .map_err(|e| APIError::internal(format!("Parquet write failed: {e}")))
            })?;
            writer
                .into_inner()
                .map_err(|e| APIError::internal(format!("Parquet close failed: {e}")))?
                .flush_tail()
        }
        OutputFormat::Ndjson => {
            use datafusion::arrow::json::LineDelimitedWriter;

            let encoder = zstd::stream::write::Encoder::new(sink, ZSTD_LEVEL)
                .map_err(|e| APIError::internal(format!("NDJSON compression failed: {e}")))?;
            let mut writer = LineDelimitedWriter::new(encoder);
            drain(batches, |batch| {
                writer.write(batch).map_err(|e| {
                    APIError::status_msg(
                        StatusCode::BAD_REQUEST,
                        format!(
                            "NDJSON serialization failed (a projected column type may be \
                             unsupported): {e}"
                        ),
                    )
                })
            })?;
            writer
                .finish()
                .map_err(|e| APIError::internal(format!("NDJSON finish failed: {e}")))?;
            writer
                .into_inner()
                .finish()
                .map_err(|e| APIError::internal(format!("NDJSON compression failed: {e}")))?
                .flush_tail()
        }
    }
}

fn drain(
    mut batches: mpsc::Receiver<RecordBatch>,
    mut write: impl FnMut(&RecordBatch) -> APIResult<()>,
) -> APIResult<()> {
    while let Some(batch) = batches.blocking_recv() {
        write(&batch)?;
    }
    Ok(())
}

/// `io::Write` sink that hands the serialized artifact to the uploader in `chunk_size` pieces.
///
/// `blocking_send` is what applies backpressure to the whole pipeline, so this must only ever
/// run on a blocking thread.
struct ChunkSink {
    tx: mpsc::Sender<Bytes>,
    buf: BytesMut,
    chunk_size: usize,
    written: u64,
}

impl ChunkSink {
    fn new(tx: mpsc::Sender<Bytes>, chunk_size: usize) -> Self {
        Self {
            tx,
            buf: BytesMut::with_capacity(chunk_size),
            chunk_size,
            written: 0,
        }
    }

    fn send(&mut self, chunk: Bytes) -> std::io::Result<()> {
        self.tx
            .blocking_send(chunk)
            .map_err(|_| std::io::Error::other("artifact upload stopped"))
    }

    /// Emit the partial chunk left over once the format writer has been closed.
    fn flush_tail(mut self) -> APIResult<()> {
        if !self.buf.is_empty() {
            let chunk = self.buf.split().freeze();
            self.send(chunk)?;
        }
        Ok(())
    }
}

impl Write for ChunkSink {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        self.written += data.len() as u64;
        if self.written > MAX_ARTIFACT_BYTES {
            return Err(std::io::Error::other(format!(
                "result exceeds the {} GiB extract limit; narrow the projection or filter it",
                MAX_ARTIFACT_BYTES >> 30
            )));
        }
        self.buf.extend_from_slice(data);
        while self.buf.len() >= self.chunk_size {
            let chunk = self.buf.split_to(self.chunk_size).freeze();
            self.send(chunk)?;
        }
        Ok(data.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Level 3 (zstd's default) — NDJSON is highly redundant, so it already sheds most of
/// the bulk, and the higher levels cost far more CPU than the upload saves.
const ZSTD_LEVEL: i32 = 3;

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

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use datafusion::arrow::array::{Int32Array, StringArray};
    use datafusion::arrow::datatypes::{DataType, Field, Schema};
    use rstest::rstest;

    use super::*;

    const ROWS_PER_BATCH: i32 = 64;
    const BATCHES: i32 = 5;

    fn sample() -> (SchemaRef, Vec<RecordBatch>) {
        let schema: SchemaRef = Arc::new(Schema::new(vec![
            Field::new("tick", DataType::Int32, false),
            Field::new("name", DataType::Utf8, false),
        ]));
        let batches = (0..BATCHES)
            .map(|b| {
                let ticks: Vec<i32> = (0..ROWS_PER_BATCH)
                    .map(|r| b * ROWS_PER_BATCH + r)
                    .collect();
                let names: Vec<String> = ticks.iter().map(|t| format!("player-{t}")).collect();
                RecordBatch::try_new(
                    schema.clone(),
                    vec![
                        Arc::new(Int32Array::from(ticks)),
                        Arc::new(StringArray::from(names)),
                    ],
                )
                .unwrap()
            })
            .collect();
        (schema, batches)
    }

    /// Drive [`serialize`] end to end and concatenate the emitted chunks, mirroring what the
    /// uploader assembles into the stored object.
    async fn serialize_to_bytes(format: OutputFormat, chunk_size: usize) -> APIResult<Bytes> {
        let (schema, batches) = sample();
        let (batch_tx, batch_rx) = mpsc::channel(BATCH_QUEUE_DEPTH);
        let (chunk_tx, mut chunk_rx) = mpsc::channel(CHUNK_QUEUE_DEPTH);

        let serializer = tokio::task::spawn_blocking(move || {
            serialize(format, &schema, chunk_size, batch_rx, chunk_tx)
        });
        let feeder = tokio::spawn(async move {
            for batch in batches {
                batch_tx.send(batch).await.unwrap();
            }
        });

        let mut out = BytesMut::new();
        while let Some(chunk) = chunk_rx.recv().await {
            out.extend_from_slice(&chunk);
        }
        feeder.await.unwrap();
        serializer.await.unwrap()?;
        Ok(out.freeze())
    }

    /// A chunk size far below the artifact size forces many boundaries; one far above forces a
    /// single tail flush. Both must produce the identical, complete artifact.
    #[rstest]
    #[case(64)]
    #[case(1 << 20)]
    #[tokio::test]
    async fn ndjson_round_trips(#[case] chunk_size: usize) {
        let artifact = serialize_to_bytes(OutputFormat::Ndjson, chunk_size)
            .await
            .unwrap();
        let raw = zstd::stream::decode_all(&artifact[..]).expect("valid zstd frame");
        let lines: Vec<&str> = core::str::from_utf8(&raw)
            .unwrap()
            .lines()
            .filter(|l| !l.is_empty())
            .collect();

        assert_eq!(
            lines.len(),
            usize::try_from(BATCHES * ROWS_PER_BATCH).unwrap()
        );
        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["tick"], 0);
        assert_eq!(first["name"], "player-0");
        let last: serde_json::Value = serde_json::from_str(lines[lines.len() - 1]).unwrap();
        assert_eq!(last["tick"], BATCHES * ROWS_PER_BATCH - 1);
    }

    #[rstest]
    #[case(64)]
    #[case(1 << 20)]
    #[tokio::test]
    async fn parquet_round_trips(#[case] chunk_size: usize) {
        use datafusion::parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;

        let artifact = serialize_to_bytes(OutputFormat::Parquet, chunk_size)
            .await
            .unwrap();
        // Reading back exercises the footer, which is only written on close — the part a
        // truncated stream would silently lose.
        let reader = ParquetRecordBatchReaderBuilder::try_new(artifact)
            .expect("valid parquet footer")
            .build()
            .unwrap();

        let mut ticks = Vec::new();
        for batch in reader {
            let batch = batch.unwrap();
            let col = batch
                .column(0)
                .as_any()
                .downcast_ref::<Int32Array>()
                .unwrap();
            ticks.extend(col.iter().map(Option::unwrap));
        }
        assert_eq!(ticks, (0..BATCHES * ROWS_PER_BATCH).collect::<Vec<_>>());
    }

    /// The uploader stops receiving when a job is aborted; the sink must surface that as an
    /// error rather than blocking the serializer thread forever. Not a `tokio::test`: the sink
    /// blocks, so like the real serializer it must run off the runtime threads.
    #[test]
    fn sink_errors_when_uploader_goes_away() {
        let (chunk_tx, chunk_rx) = mpsc::channel(1);
        drop(chunk_rx);
        let mut sink = ChunkSink::new(chunk_tx, 4);

        let err = sink.write(b"more than four bytes").unwrap_err();
        assert!(err.to_string().contains("artifact upload stopped"));
    }
}
