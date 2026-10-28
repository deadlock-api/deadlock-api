//! Live GOTV/spectator broadcast queries that stream result rows as the match plays.
//!
//! A live broadcast has no end until the match does, so buffering it whole (as [`super::query`]
//! does) would block for the whole match. Instead the broadcast is parsed incrementally and decoded
//! rows are pushed into `DataFusion` [`StreamingTable`]s, so projection/filter queries emit rows
//! continuously. A whole-match `GROUP BY` / `ORDER BY` still only completes once the broadcast ends.

use core::sync::atomic::{AtomicUsize, Ordering};
use core::time::Duration;
use std::collections::{HashMap, HashSet};
use std::io::{self, Read};
use std::sync::{Arc, Mutex};

use bytes::Bytes;
use datafusion::arrow::datatypes::SchemaRef;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::catalog::streaming::StreamingTable;
use datafusion::datasource::MemTable;
use datafusion::error::DataFusionError;
use datafusion::execution::{SendableRecordBatchStream, TaskContext};
use datafusion::physical_plan::stream::RecordBatchStreamAdapter;
use datafusion::physical_plan::streaming::PartitionStream;
use datafusion::prelude::{SessionConfig, SessionContext};
use haste_broadcast::{BroadcastHttp, BroadcastHttpClientError};
use haste_core::demostream::{CmdFormat, CmdHeader, DemoStream, ReadCmdError, ReadCmdHeaderError};
use haste_core::entities::{DeltaHeader, Entity};
use haste_core::parser::{Context, Parser, Visitor};
use haste_core::valveprotos::common::EDemoCommands;
use serde::Deserialize;
use tokio::sync::mpsc::{Receiver, Sender, UnboundedReceiver, UnboundedSender, unbounded_channel};
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use super::entity_batch_builder::EntityBatchBuilder;
use super::error::{DemoError, Result};
use super::event_batch_builder::EventBatchBuilder;
use super::events::{decode_event, event_schema};
use super::query::{
    Schemas, build_entity_specs, discover_entity_projections, projected_entity_schema,
    read_only_sql, resolve_referenced,
};
use super::session::session_context;
use super::table_extractor::extract_table_names;
use super::visitor::{BroadcastDemoStream, discover_schemas_from_demo};

/// A freshly-spectated match's relay can 404/405 for a while before it actually starts serving the
/// broadcast, so the initial connect retries for at least this long before giving up.
const CONNECT_RETRY_BUDGET: Duration = Duration::from_mins(1);
const CONNECT_RETRY_INTERVAL: Duration = Duration::from_secs(2);
/// Fetched broadcast fragments queued ahead of the parser; beyond it the fetch waits for the parse.
const MAX_QUEUED_FRAGMENTS: usize = 64;

/// Run `query` over a live GOTV/spectator broadcast, streaming result rows as the match plays.
///
/// `base_url` is the stream base (e.g. `http://dist1-ord1.steamcontent.com/tv/<id>_<token>`, from
/// <https://api.deadlock-api.com/v1/matches/live/urls>). Unlike [`query`](super::query), this does
/// not wait for the match to finish: the broadcast is parsed incrementally and rows flow out as they
/// are decoded, so projection/filter queries update live. A whole-match `GROUP BY` / `ORDER BY`
/// still can't emit until the broadcast ends. The stream ends when the broadcast stops (match ends
/// or relay stops serving); dropping it tears the background fetch/parse down.
///
/// `client` fetches the broadcast fragments. It should time out stalled reads (haste retries a
/// timed-out fetch and then ends the stream; a stalled relay would otherwise hold the producer and
/// the parser thread forever) and only follow redirects to trusted relay hosts.
///
/// `status_tx` receives human-readable progress messages while the initial connection is retried, so
/// a caller streaming this over SSE can surface them to a waiting client instead of going quiet.
///
/// Decoded rows queue up for the consumer when the client stops reading the stream, or for
/// joins/aggregations that only emit at the end; past `queue_limit_bytes` the query is stopped.
///
/// Cancelling `cancel` stops the broadcast fetch, which ends the parse even if nobody polls the
/// returned stream any more (a disconnect the server never saw).
///
/// # Errors
///
/// Returns an error if the broadcast cannot be started or its schema decoded, or for the same
/// reasons as [`query`](super::query).
pub async fn query_live(
    client: &reqwest::Client,
    base_url: &str,
    query: &str,
    status_tx: UnboundedSender<String>,
    cancel: CancellationToken,
    queue_limit_bytes: usize,
) -> Result<SendableRecordBatchStream> {
    let referenced: HashSet<String> = extract_table_names(query)?.into_iter().collect();

    // The `/start` signon fragment carries the send-tables the schema is built from, and also seeds
    // the parser so serializers/class-info are in place before deltas.
    let (http, signon) = connect_with_retry(client, base_url, &status_tx).await?;

    // Schema discovery is CPU-bound haste parsing; run it off the async runtime, and catch a panic
    // on malformed/stale relay bytes as a Broadcast error rather than letting it reset the connection.
    let signon_for_schema = signon.clone();
    let referenced_for_schema = referenced.clone();
    let discovered = tokio::task::spawn_blocking(move || {
        discover_schemas_from_demo::<BroadcastDemoStream>(signon_for_schema, &referenced_for_schema)
    })
    .await
    .map_err(|e| DemoError::Broadcast(format!("schema discovery task failed: {e}")))??;
    let entity_schemas: Schemas = discovered
        .into_iter()
        .map(|s| (Arc::clone(&s.serializer_name), s))
        .collect();

    let (referenced_entities, event_types) = resolve_referenced(&referenced, &entity_schemas);
    let projections =
        discover_entity_projections(query, &referenced_entities, &event_types).await?;
    let entity_specs = build_entity_specs(&referenced_entities, &projections);

    let (bytes_tx, bytes_rx) = tokio::sync::mpsc::channel::<Bytes>(MAX_QUEUED_FRAGMENTS);
    // The channel is empty and `bytes_rx` is alive right here, so this cannot fail.
    bytes_tx
        .try_send(signon)
        .map_err(|e| DemoError::Broadcast(format!("failed to queue the signon fragment: {e}")))?;
    let budget = QueueBudget::new(queue_limit_bytes);

    // Every live table is a single channel, so repartitioning buys no parallelism — and
    // `RepartitionExec` coalesces batches from bounded inputs, which would hold decoded rows
    // back until the broadcast ends instead of streaming them as they arrive.
    let ctx = session_context(SessionConfig::new().with_target_partitions(1))?;
    let mut entities: HashMap<u64, Channel<EntityBatchBuilder>> = HashMap::new();
    for (schema, projection) in &entity_specs {
        let (tx, rx) = unbounded_channel();
        register_streaming_table(
            &ctx,
            &schema.serializer_name,
            projected_entity_schema(schema, &projections)?,
            rx,
            budget.clone(),
        )?;
        entities.insert(
            schema.serializer_hash,
            Channel {
                builder: EntityBatchBuilder::new_projected(schema, projection.as_deref())?,
                tx,
            },
        );
    }

    // Entities referenced in SQL but optimized away by the planner get an empty table so the query
    // still resolves.
    for schema in &referenced_entities {
        if !entities.contains_key(&schema.serializer_hash) {
            let table = MemTable::try_new(Arc::clone(&schema.arrow_schema), vec![vec![]])?;
            ctx.register_table(&*schema.serializer_name, Arc::new(table))?;
        }
    }

    let mut events: HashMap<u32, Channel<EventBatchBuilder>> = HashMap::new();
    for event_type in &event_types {
        let table_name = event_type.table_name();
        let Some(arrow_schema) = event_schema(table_name) else {
            continue;
        };
        let (tx, rx) = unbounded_channel();
        register_streaming_table(&ctx, table_name, arrow_schema, rx, budget.clone())?;
        events.insert(
            event_type.message_id(),
            Channel {
                builder: EventBatchBuilder::try_new(*event_type)?,
                tx,
            },
        );
    }

    spawn_producer(client.clone(), http, bytes_tx, base_url.to_owned(), cancel);

    let visitor = StreamingCollector {
        entities,
        events,
        budget,
        stopped: false,
    };
    tokio::task::spawn_blocking(move || {
        let stream = LiveBroadcastStream::new(bytes_rx);
        if let Ok(mut parser) = Parser::from_stream_with_visitor(stream, visitor) {
            // A parse error (truncated tail) or a closed result stream just ends the live query.
            if let Err(e) = parser.run_to_end() {
                debug!("Live broadcast parse ended: {e}");
            }
            if let Err(e) = parser.into_visitor().flush() {
                debug!("Live broadcast final flush failed: {e}");
            }
        }
    });

    Ok(ctx
        .sql_with_options(query, read_only_sql())
        .await?
        .execute_stream()
        .await?)
}

/// Forward each remaining fragment to the parser until the broadcast ends or `cancel` fires;
/// dropping the sender on exit signals EOF to it.
/// Why the broadcast stopped is logged with the relay's `/sync` answer at that moment, telling a
/// finished match apart from a relay that was still serving when haste gave up on it.
fn spawn_producer(
    client: reqwest::Client,
    mut http: BroadcastHttp<'static, reqwest::Client>,
    bytes_tx: Sender<Bytes>,
    broadcast_url: String,
    cancel: CancellationToken,
) {
    tokio::spawn(async move {
        let mut fragments = 0u64;
        let error = loop {
            let packet = tokio::select! {
                () = cancel.cancelled() => {
                    debug!(broadcast_url, fragments, "Live broadcast fetch cancelled");
                    return;
                }
                packet = http.next_packet() => packet,
            };
            match packet {
                Some(Ok(bytes)) => {
                    if bytes_tx.send(bytes).await.is_err() {
                        // The query finished or the client went away.
                        return;
                    }
                    fragments = fragments.saturating_add(1);
                }
                Some(Err(e)) => break Some(e),
                None => break None,
            }
        };
        drop(bytes_tx);
        let relay_sync = relay_sync_status(&client, &broadcast_url).await;
        match error {
            None => info!(broadcast_url, fragments, relay_sync, "Live broadcast ended"),
            Some(e) => warn!(
                broadcast_url,
                fragments,
                relay_sync,
                error = %e,
                "Live broadcast stopped on a relay error"
            ),
        }
    });
}

/// Connect to the broadcast relay and fetch the signon fragment, retrying on failure for
/// [`CONNECT_RETRY_BUDGET`]. A newly-spectated match's relay routinely answers 404 (nothing synced
/// yet) or 405 (relay still connecting to the game server) for several seconds before it starts
/// serving fragments, so a single failed attempt does not mean the broadcast is unavailable.
async fn connect_with_retry(
    client: &reqwest::Client,
    base_url: &str,
    status_tx: &UnboundedSender<String>,
) -> Result<(BroadcastHttp<'static, reqwest::Client>, Bytes)> {
    let now = tokio::time::Instant::now();
    // Adding a constant budget of a minute to the current instant cannot overflow.
    let deadline = now.checked_add(CONNECT_RETRY_BUDGET).unwrap_or(now);
    let mut attempt = 0u32;
    loop {
        attempt = attempt.saturating_add(1);
        let error = match try_connect(client, base_url).await {
            Ok(connected) => return Ok(connected),
            Err(e) => e,
        };
        // haste only reports the status code; the relay's message tells a broadcast that is still
        // spinning up apart from one Valve never started (`Broadcast has not started yet` for the
        // whole match, even though spectating succeeded).
        let refusal = match error {
            BroadcastHttpClientError::StatusCode(_) => relay_refusal(client, base_url).await,
            _ => None,
        };
        let reason = refusal
            .as_deref()
            .map_or_else(|| error.to_string(), |m| format!("Valve relay: {m}"));
        if tokio::time::Instant::now() >= deadline {
            return Err(DemoError::Broadcast(match refusal.as_deref() {
                Some(BROADCAST_NOT_STARTED) => format!(
                    "Valve's relay never started this match's broadcast (still \"{BROADCAST_NOT_STARTED}\" \
                     after {}s). This happens for some matches on Valve's side, and spectating \
                     again returns the same broadcast.",
                    CONNECT_RETRY_BUDGET.as_secs()
                ),
                _ => reason,
            }));
        }
        // Progress messages are best effort; without a listener the retries simply go unreported.
        if status_tx
            .send(format!(
                "Broadcast relay not ready yet (attempt {attempt}: {reason}), retrying..."
            ))
            .is_err()
        {
            debug!("Live query status listener is gone");
        }
        tokio::time::sleep(CONNECT_RETRY_INTERVAL).await;
    }
}

/// The relay's answer to `/sync` for a broadcast Valve assigned but never started streaming.
const BROADCAST_NOT_STARTED: &str = "Broadcast has not started yet";

/// Bounds the diagnostic `/sync` probes, which only add context to an error or log line.
const RELAY_PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// The relay's error body, e.g. `{"statusCode":404,"message":"Broadcast has not started yet"}`.
#[derive(Deserialize)]
struct RelayError {
    message: String,
}

/// Fetches the relay's `/sync` status, plus its message if it refuses.
async fn probe_sync(
    client: &reqwest::Client,
    base_url: &str,
) -> reqwest::Result<(reqwest::StatusCode, Option<String>)> {
    let response = client
        .get(sync_url(base_url))
        .timeout(RELAY_PROBE_TIMEOUT)
        .send()
        .await?;
    let status = response.status();
    if status.is_success() {
        return Ok((status, None));
    }
    Ok((
        status,
        response.json::<RelayError>().await.ok().map(|e| e.message),
    ))
}

/// The message the relay gives for refusing `/sync`, or `None` if it serves it or gives no reason.
async fn relay_refusal(client: &reqwest::Client, base_url: &str) -> Option<String> {
    probe_sync(client, base_url).await.ok()?.1
}

/// The relay's `/sync` status (and message, if it refuses) for logging.
async fn relay_sync_status(client: &reqwest::Client, base_url: &str) -> String {
    match probe_sync(client, base_url).await {
        Ok((status, Some(message))) => format!("{status}: {message}"),
        Ok((status, None)) => status.to_string(),
        Err(e) => format!("unreachable: {e}"),
    }
}

fn sync_url(base_url: &str) -> String {
    format!("{}/sync", base_url.trim_end_matches('/'))
}

async fn try_connect(
    client: &reqwest::Client,
    base_url: &str,
) -> core::result::Result<
    (BroadcastHttp<'static, reqwest::Client>, Bytes),
    BroadcastHttpClientError<reqwest::Error>,
> {
    let mut http = BroadcastHttp::start_streaming(client.clone(), base_url.to_owned()).await?;
    match http.next_packet().await {
        Some(Ok(bytes)) => Ok((http, bytes)),
        Some(Err(e)) => Err(e),
        None => Err(BroadcastHttpClientError::StatusCode(
            reqwest::StatusCode::NOT_FOUND,
        )),
    }
}

fn register_streaming_table(
    ctx: &SessionContext,
    name: &str,
    schema: SchemaRef,
    rx: UnboundedReceiver<QueuedBatch>,
    budget: QueueBudget,
) -> Result<()> {
    let partition = Arc::new(ChannelPartition {
        schema: Arc::clone(&schema),
        rx: Mutex::new(Some(rx)),
        budget,
    });
    ctx.register_table(
        name,
        Arc::new(StreamingTable::try_new(schema, vec![partition])?),
    )?;
    Ok(())
}

/// A decoded batch for a live table, or the error that stops the query.
type QueuedBatch = core::result::Result<RecordBatch, DataFusionError>;

struct Channel<B> {
    builder: B,
    tx: UnboundedSender<QueuedBatch>,
}

/// Bytes of decoded batches one live query has queued but its tables have not yet handed out.
#[derive(Clone)]
struct QueueBudget {
    queued: Arc<AtomicUsize>,
    limit: usize,
}

impl QueueBudget {
    fn new(limit: usize) -> Self {
        Self {
            queued: Arc::default(),
            limit,
        }
    }

    /// Counts `bytes` as queued; `false` once the query holds more than its limit.
    fn reserve(&self, bytes: usize) -> bool {
        let queued = self.queued.fetch_add(bytes, Ordering::Relaxed);
        queued.saturating_add(bytes) <= self.limit
    }

    /// Undoes the [`reserve`](Self::reserve) of a batch its table handed out. Only ever called with
    /// the size of a batch that was reserved, so the count cannot underflow.
    fn release(&self, bytes: usize) {
        self.queued.fetch_sub(bytes, Ordering::Relaxed);
    }
}

/// Queue `batch` for its table. Past the query's queue limit the table gets an error
/// instead, which ends the query, and the parse is stopped.
fn send_batch(
    batch: RecordBatch,
    tx: &UnboundedSender<QueuedBatch>,
    budget: &QueueBudget,
) -> Result<()> {
    if batch.num_rows() == 0 {
        return Ok(());
    }
    if !budget.reserve(batch.get_array_memory_size()) {
        let message = format!(
            "Live query stopped: more than {} MiB of result rows are queued unread. Read the stream \
             as it arrives, and avoid joins or aggregations that hold rows until the broadcast ends.",
            budget.limit >> 20
        );
        if tx
            .send(Err(DataFusionError::Execution(message.clone())))
            .is_err()
        {
            debug!("Live result stream closed before the queue limit error");
        }
        return Err(DemoError::Broadcast(message));
    }
    if tx.send(Ok(batch)).is_err() {
        return Err(DemoError::Broadcast("live result stream closed".into()));
    }
    Ok(())
}

/// A `DataFusion` partition yielding the batches sent on its channel until it closes.
struct ChannelPartition {
    schema: SchemaRef,
    rx: Mutex<Option<UnboundedReceiver<QueuedBatch>>>,
    budget: QueueBudget,
}

impl core::fmt::Debug for ChannelPartition {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("ChannelPartition").finish_non_exhaustive()
    }
}

impl PartitionStream for ChannelPartition {
    fn schema(&self) -> &SchemaRef {
        &self.schema
    }

    fn execute(&self, _ctx: Arc<TaskContext>) -> SendableRecordBatchStream {
        // Executed once per scan; a second scan of the same live table finds the channel taken.
        let rx = self
            .rx
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        let budget = self.budget.clone();
        let stream = futures::stream::unfold(rx, move |rx| {
            let budget = budget.clone();
            async move {
                let mut rx = rx?;
                let batch = rx.recv().await?;
                if let Ok(batch) = &batch {
                    budget.release(batch.get_array_memory_size());
                }
                Some((batch, Some(rx)))
            }
        });
        Box::pin(RecordBatchStreamAdapter::new(
            Arc::clone(&self.schema),
            stream,
        ))
    }
}

struct StreamingCollector {
    entities: HashMap<u64, Channel<EntityBatchBuilder>>,
    events: HashMap<u32, Channel<EventBatchBuilder>>,
    budget: QueueBudget,
    /// Set once a send fails, so the final flush after a stopped parse sends nothing more.
    stopped: bool,
}

impl StreamingCollector {
    /// Send each table's accumulated batch immediately. Empty builders are skipped by `send_batch`,
    /// so rows flow out as soon as they are decoded (flushed every tick) with no buffering delay.
    fn flush(&mut self) -> Result<()> {
        if self.stopped {
            return Ok(());
        }
        let sent = self.send_all();
        self.stopped = sent.is_err();
        sent
    }

    fn send_all(&mut self) -> Result<()> {
        for ch in self.entities.values_mut() {
            send_batch(ch.builder.finish()?, &ch.tx, &self.budget)?;
        }
        for ch in self.events.values_mut() {
            send_batch(ch.builder.finish()?, &ch.tx, &self.budget)?;
        }
        Ok(())
    }
}

impl Visitor for StreamingCollector {
    type Error = DemoError;

    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        self.entities.contains_key(&serializer_name_hash)
    }

    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<()> {
        if let Some(ch) = self
            .entities
            .get_mut(&entity.serializer().serializer_name.hash)
        {
            ch.builder
                .append_entity(ctx.tick(), entity.index(), delta_header, entity);
        }
        Ok(())
    }

    fn on_packet(&mut self, ctx: &Context, packet_type: u32, data: &[u8]) -> Result<()> {
        if let Some(ch) = self.events.get_mut(&packet_type)
            && let Some(event) = decode_event(packet_type, data)
        {
            ch.builder.append(ctx.tick(), &event)?;
        }
        Ok(())
    }

    fn on_tick_end(&mut self, _ctx: &Context) -> Result<()> {
        self.flush()
    }
}

const BROADCAST_CMD_HEADER_SIZE: u8 = 10; // 1 cmd + 4 tick + 1 unused + 4 body_size

/// A blocking [`Read`] over an ordered stream of broadcast fragments; a closed channel reads as EOF.
/// Must only be read off the async runtime (the parser runs in `spawn_blocking`).
struct ChannelReader {
    rx: Receiver<Bytes>,
    current: Bytes,
    pos: usize,
}

impl Read for ChannelReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        while self.pos >= self.current.len() {
            match self.rx.blocking_recv() {
                Some(bytes) => {
                    self.current = bytes;
                    self.pos = 0;
                }
                None => return Ok(0),
            }
        }
        // The loop above leaves `pos` inside `current`.
        let Some(mut rest) = self.current.get(self.pos..) else {
            return Ok(0);
        };
        let n = rest.read(buf)?;
        self.pos = self.pos.saturating_add(n);
        Ok(n)
    }
}

/// A synchronous [`DemoStream`] over the broadcast wire format, fed by a blocking byte channel.
///
/// Not seekable — it supports only a single forward [`Parser::run_to_end`] pass, which is all a live
/// broadcast allows. Command bodies use the broadcast format (the same one `BroadcastFile` reads).
struct LiveBroadcastStream {
    reader: ChannelReader,
    buf: Vec<u8>,
    eof: bool,
}

impl LiveBroadcastStream {
    const fn new(rx: Receiver<Bytes>) -> Self {
        Self {
            reader: ChannelReader {
                rx,
                current: Bytes::new(),
                pos: 0,
            },
            buf: Vec::new(),
            eof: false,
        }
    }
}

impl DemoStream for LiveBroadcastStream {
    const CMD_FORMAT: CmdFormat = CmdFormat::Broadcast;

    fn is_at_eof(&mut self) -> core::result::Result<bool, io::Error> {
        Ok(self.eof)
    }

    fn read_cmd_header(&mut self) -> core::result::Result<CmdHeader, ReadCmdHeaderError> {
        let mut header = [0u8; BROADCAST_CMD_HEADER_SIZE as usize];
        if let Err(e) = self.reader.read_exact(&mut header) {
            self.eof = e.kind() == io::ErrorKind::UnexpectedEof;
            return Err(ReadCmdHeaderError::IoError(e));
        }

        let Ok(cmd) = EDemoCommands::try_from(i32::from(header[0])) else {
            return Err(ReadCmdHeaderError::UnknownCmd {
                raw: u32::from(header[0]),
                uncompressed: u32::from(header[0]),
            });
        };
        Ok(CmdHeader {
            cmd,
            body_compressed: false,
            tick: i32::from_le_bytes([header[1], header[2], header[3], header[4]]),
            // header[5] is unused.
            body_size: u32::from_le_bytes([header[6], header[7], header[8], header[9]]),
            size: BROADCAST_CMD_HEADER_SIZE,
        })
    }

    fn read_cmd(&mut self, cmd_header: &CmdHeader) -> core::result::Result<&[u8], ReadCmdError> {
        self.buf.resize(cmd_header.body_size as usize, 0);
        self.reader.read_exact(&mut self.buf)?;
        Ok(&self.buf)
    }

    fn skip_cmd(&mut self, cmd_header: &CmdHeader) -> core::result::Result<(), io::Error> {
        self.buf.resize(cmd_header.body_size as usize, 0);
        self.reader.read_exact(&mut self.buf)
    }
}

#[cfg(test)]
mod tests {
    use datafusion::arrow::array::{Int32Array, StringArray, UInt32Array, UInt64Array};
    use datafusion::arrow::datatypes::{DataType, Field, Schema};
    use futures::StreamExt as _;

    use super::*;

    fn schema(extra: (&str, DataType)) -> SchemaRef {
        Arc::new(Schema::new(vec![
            Field::new("tick", DataType::Int32, false),
            Field::new("entity_index", DataType::Int32, false),
            Field::new("delta_type", DataType::Utf8, false),
            Field::new(extra.0, extra.1, true),
        ]))
    }

    /// A `UNION ALL` whose branches need nullability coercion makes `DataFusion` insert a
    /// projection — and, with the default partition count, a batch-coalescing `RepartitionExec`
    /// that would hold rows back until the sources close. Rows must flow while the tables are open.
    #[tokio::test]
    async fn union_all_streams_rows_while_sources_are_open() {
        let ctx = SessionContext::new_with_config(SessionConfig::new().with_target_partitions(1));
        let ctrl = schema(("m_steamID", DataType::UInt64));
        let pawn = schema(("CBodyComponent__m_cellX", DataType::UInt32));
        let budget = QueueBudget::new(1 << 20);
        let (ctrl_tx, rx) = unbounded_channel();
        register_streaming_table(
            &ctx,
            "CCitadelPlayerController",
            Arc::clone(&ctrl),
            rx,
            budget.clone(),
        )
        .unwrap();
        let (pawn_tx, rx) = unbounded_channel();
        register_streaming_table(
            &ctx,
            "CCitadelPlayerPawn",
            Arc::clone(&pawn),
            rx,
            budget.clone(),
        )
        .unwrap();

        let query = r#"SELECT 'ctrl' AS row_kind, "tick", "entity_index", "delta_type" AS delta, "m_steamID" AS steam_id, NULL AS position_x FROM CCitadelPlayerController
            UNION ALL
            SELECT 'pawn' AS row_kind, "tick", NULL AS entity_index, NULL AS delta, NULL AS steam_id, "CBodyComponent__m_cellX" AS position_x FROM CCitadelPlayerPawn"#;
        let mut stream = ctx
            .sql(query)
            .await
            .unwrap()
            .execute_stream()
            .await
            .unwrap();

        send_batch(
            RecordBatch::try_new(
                ctrl,
                vec![
                    Arc::new(Int32Array::from(vec![1])),
                    Arc::new(Int32Array::from(vec![5])),
                    Arc::new(StringArray::from(vec!["update"])),
                    Arc::new(UInt64Array::from(vec![Some(7)])),
                ],
            )
            .unwrap(),
            &ctrl_tx,
            &budget,
        )
        .unwrap();
        send_batch(
            RecordBatch::try_new(
                pawn,
                vec![
                    Arc::new(Int32Array::from(vec![1])),
                    Arc::new(Int32Array::from(vec![6])),
                    Arc::new(StringArray::from(vec!["update"])),
                    Arc::new(UInt32Array::from(vec![Some(3)])),
                ],
            )
            .unwrap(),
            &pawn_tx,
            &budget,
        )
        .unwrap();

        let mut rows = 0;
        while rows < 2 {
            let next = tokio::time::timeout(Duration::from_secs(3), stream.next())
                .await
                .expect("rows must stream while the sources are still open");
            rows += next.expect("stream ended early").unwrap().num_rows();
        }
        drop(ctrl_tx);
        drop(pawn_tx);
        while let Some(batch) = stream.next().await {
            batch.unwrap();
        }
        assert_eq!(
            budget.queued.load(Ordering::Relaxed),
            0,
            "read batches must free the budget"
        );
    }

    fn one_row(schema: &SchemaRef) -> RecordBatch {
        RecordBatch::try_new(
            Arc::clone(schema),
            vec![
                Arc::new(Int32Array::from(vec![1])),
                Arc::new(Int32Array::from(vec![5])),
                Arc::new(StringArray::from(vec!["update"])),
                Arc::new(UInt64Array::from(vec![Some(7)])),
            ],
        )
        .unwrap()
    }

    /// A query whose rows queue up unread must stop the parse and end its stream with an error.
    #[tokio::test]
    async fn queue_limit_stops_the_query_with_an_error() {
        let ctx = SessionContext::new_with_config(SessionConfig::new().with_target_partitions(1));
        let ctrl = schema(("m_steamID", DataType::UInt64));
        let budget = QueueBudget::new(1 << 20);
        let (tx, rx) = unbounded_channel();
        register_streaming_table(
            &ctx,
            "CCitadelPlayerController",
            Arc::clone(&ctrl),
            rx,
            budget.clone(),
        )
        .unwrap();
        let mut stream = ctx
            .sql("SELECT * FROM CCitadelPlayerController")
            .await
            .unwrap()
            .execute_stream()
            .await
            .unwrap();

        send_batch(one_row(&ctrl), &tx, &budget).unwrap();
        budget.queued.fetch_add(budget.limit, Ordering::Relaxed);
        let err = send_batch(one_row(&ctrl), &tx, &budget).unwrap_err();
        assert!(err.to_string().contains("queued unread"), "{err}");

        assert_eq!(stream.next().await.unwrap().unwrap().num_rows(), 1);
        let err = stream.next().await.unwrap().unwrap_err();
        assert!(err.to_string().contains("queued unread"), "{err}");
    }
}
