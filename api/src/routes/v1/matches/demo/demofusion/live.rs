//! Live GOTV/spectator broadcast queries that stream result rows as the match plays.
//!
//! A live broadcast has no end until the match does, so buffering it whole (as [`super::query`]
//! does) would block for the whole match. Instead the broadcast is parsed incrementally and decoded
//! rows are pushed into `DataFusion` [`StreamingTable`]s, so projection/filter queries emit rows
//! continuously. A whole-match `GROUP BY` / `ORDER BY` still only completes once the broadcast ends.

use std::collections::{HashMap, HashSet};
use std::io::{self, Read};
use std::sync::{Arc, Mutex};

use bytes::Bytes;
use datafusion::arrow::datatypes::SchemaRef;
use datafusion::arrow::record_batch::RecordBatch;
use datafusion::catalog::streaming::StreamingTable;
use datafusion::datasource::MemTable;
use datafusion::execution::{SendableRecordBatchStream, TaskContext};
use datafusion::physical_plan::stream::RecordBatchStreamAdapter;
use datafusion::physical_plan::streaming::PartitionStream;
use datafusion::prelude::SessionContext;
use haste_broadcast::BroadcastHttp;
use haste_core::demostream::{
    CmdHeader, DecodeCmdError, DemoStream, ReadCmdError, ReadCmdHeaderError,
};
use haste_core::entities::{DeltaHeader, Entity};
use haste_core::parser::{Context, Parser, Visitor};
use haste_core::valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoPacket, CDemoSendTables, EDemoCommands,
};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender, unbounded_channel};
use tokio::time::{Duration, sleep};
use tracing::warn;

use super::entity_batch_builder::EntityBatchBuilder;
use super::error::{Error, Result};
use super::event_batch_builder::EventBatchBuilder;
use super::events::{decode_event, event_schema};
use super::query::{
    Schemas, build_entity_specs, discover_entity_projections, projected_entity_schema,
    resolve_referenced,
};
use super::table_extractor::extract_table_names;
use super::visitor::{BroadcastDemoStream, discover_schemas_from_demo};

/// Number of consecutive broadcast fragment errors tolerated before ending the live stream.
const MAX_CONSECUTIVE_BROADCAST_ERRORS: usize = 3;
/// Short pause before retrying after a transient fragment fetch error.
const BROADCAST_ERROR_BACKOFF: Duration = Duration::from_millis(250);
/// Flush a table's builder once this many rows have accumulated: bounds batch size and staleness.
const FLUSH_ROWS: usize = 1024;

/// Run `query` over a live GOTV/spectator broadcast, streaming result rows as the match plays.
///
/// `base_url` is the stream base (e.g. `http://dist1-ord1.steamcontent.com/tv/<id>_<token>`, from
/// <https://api.deadlock-api.com/v1/matches/live/urls>). Unlike [`query`](super::query), this does
/// not wait for the match to finish: the broadcast is parsed incrementally and rows flow out as they
/// are decoded, so projection/filter queries update live. A whole-match `GROUP BY` / `ORDER BY`
/// still can't emit until the broadcast ends. The stream ends when the broadcast stops (match ends
/// or relay stops serving); dropping it tears the background fetch/parse down.
///
/// # Errors
///
/// Returns an error if the broadcast cannot be started or its schema decoded, or for the same
/// reasons as [`query`](super::query).
pub(crate) async fn query_live(base_url: &str, query: &str) -> Result<SendableRecordBatchStream> {
    let referenced: HashSet<String> = extract_table_names(query)?.into_iter().collect();

    let client = reqwest::Client::new();
    let mut http = BroadcastHttp::start_streaming(client, base_url.to_string())
        .await
        .map_err(|e| Error::Broadcast(e.to_string()))?;

    // The `/start` signon fragment carries the send-tables the schema is built from, and also seeds
    // the parser so serializers/class-info are in place before deltas.
    let signon = match http.next_packet().await {
        Some(Ok(bytes)) => bytes,
        Some(Err(e)) => return Err(Error::Broadcast(e.to_string())),
        None => return Err(Error::Broadcast("broadcast ended before signon".into())),
    };

    let entity_schemas: Schemas =
        discover_schemas_from_demo::<BroadcastDemoStream>(signon.clone(), &referenced)?
            .into_iter()
            .map(|s| (Arc::clone(&s.serializer_name), s))
            .collect();

    let (referenced_entities, event_types) = resolve_referenced(&referenced, &entity_schemas);
    let projections =
        discover_entity_projections(query, &referenced_entities, &event_types).await?;
    let entity_specs = build_entity_specs(&referenced_entities, &projections);

    let (bytes_tx, bytes_rx) = std::sync::mpsc::channel::<Bytes>();
    let _ = bytes_tx.send(signon);

    let ctx = SessionContext::new();
    let mut entities: HashMap<u64, Channel<EntityBatchBuilder>> = HashMap::new();
    for (schema, projection) in &entity_specs {
        let (tx, rx) = unbounded_channel();
        register_streaming_table(
            &ctx,
            &schema.serializer_name,
            projected_entity_schema(schema, &projections)?,
            rx,
        )?;
        entities.insert(
            schema.serializer_hash,
            Channel {
                builder: EntityBatchBuilder::new_projected(schema, projection.as_deref()),
                tx,
            },
        );
    }

    // Entities referenced in SQL but optimized away by the planner get an empty table so the query
    // still resolves.
    for schema in &referenced_entities {
        if !entities.contains_key(&schema.serializer_hash) {
            let table = MemTable::try_new(schema.arrow_schema.clone(), vec![vec![]])?;
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
        register_streaming_table(&ctx, table_name, arrow_schema, rx)?;
        events.insert(
            event_type.message_id(),
            Channel {
                builder: EventBatchBuilder::new(*event_type),
                tx,
            },
        );
    }

    // Producer: forward each remaining fragment; dropping the sender on exit signals EOF to the parser.
    tokio::spawn(async move {
        let mut consecutive_errors = 0usize;
        loop {
            match http.next_packet().await {
                Some(Ok(bytes)) => {
                    consecutive_errors = 0;
                    if bytes_tx.send(bytes).is_err() {
                        break;
                    }
                }
                Some(Err(e)) => {
                    consecutive_errors += 1;
                    warn!(
                        error = %e,
                        consecutive_errors,
                        "live broadcast fragment fetch failed"
                    );
                    if consecutive_errors >= MAX_CONSECUTIVE_BROADCAST_ERRORS {
                        break;
                    }
                    sleep(BROADCAST_ERROR_BACKOFF).await;
                }
                None => break,
            }
        }
    });

    let visitor = StreamingCollector {
        entities,
        events,
        pending: 0,
    };
    tokio::task::spawn_blocking(move || {
        let stream = LiveBroadcastStream::new(bytes_rx);
        if let Ok(mut parser) = Parser::from_stream_with_visitor(stream, visitor) {
            // A parse error (truncated tail) or a closed result stream just ends the live query.
            let _ = parser.run_to_end();
            let _ = parser.into_visitor().flush(true);
        }
    });

    Ok(ctx.sql(query).await?.execute_stream().await?)
}

fn register_streaming_table(
    ctx: &SessionContext,
    name: &str,
    schema: SchemaRef,
    rx: UnboundedReceiver<RecordBatch>,
) -> Result<()> {
    let partition = Arc::new(ChannelPartition {
        schema: Arc::clone(&schema),
        rx: Mutex::new(Some(rx)),
    });
    ctx.register_table(
        name,
        Arc::new(StreamingTable::try_new(schema, vec![partition])?),
    )?;
    Ok(())
}

struct Channel<B> {
    builder: B,
    tx: UnboundedSender<RecordBatch>,
}

fn send_batch(batch: RecordBatch, tx: &UnboundedSender<RecordBatch>) -> Result<()> {
    if batch.num_rows() > 0 && tx.send(batch).is_err() {
        return Err(Error::Broadcast("live result stream closed".into()));
    }
    Ok(())
}

/// A `DataFusion` partition yielding the `RecordBatch`es sent on its channel until it closes.
struct ChannelPartition {
    schema: SchemaRef,
    rx: Mutex<Option<UnboundedReceiver<RecordBatch>>>,
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
        let stream = futures::stream::unfold(rx, |rx| async move {
            let mut rx = rx?;
            rx.recv().await.map(|batch| (Ok(batch), Some(rx)))
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
    pending: usize,
}

impl StreamingCollector {
    /// Send each table's accumulated batch. `force` flushes below the row threshold (the final tail).
    fn flush(&mut self, force: bool) -> Result<()> {
        if !force && self.pending < FLUSH_ROWS {
            return Ok(());
        }
        for ch in self.entities.values_mut() {
            send_batch(ch.builder.finish()?, &ch.tx)?;
        }
        for ch in self.events.values_mut() {
            send_batch(ch.builder.finish()?, &ch.tx)?;
        }
        self.pending = 0;
        Ok(())
    }
}

impl Visitor for StreamingCollector {
    type Error = Error;

    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        self.entities.contains_key(&serializer_name_hash)
    }

    fn on_entity(&mut self, ctx: &Context, delta: DeltaHeader, entity: &Entity) -> Result<()> {
        if let Some(ch) = self
            .entities
            .get_mut(&entity.serializer().serializer_name.hash)
        {
            ch.builder
                .append_entity(ctx.tick(), entity.index(), delta, entity);
            self.pending += 1;
        }
        Ok(())
    }

    fn on_packet(&mut self, ctx: &Context, packet_type: u32, data: &[u8]) -> Result<()> {
        if let Some(ch) = self.events.get_mut(&packet_type)
            && let Some(event) = decode_event(packet_type, data)
        {
            ch.builder.append(ctx.tick(), &event);
            self.pending += 1;
        }
        Ok(())
    }

    fn on_tick_end(&mut self, _ctx: &Context) -> Result<()> {
        self.flush(false)
    }
}

const BROADCAST_CMD_HEADER_SIZE: u8 = 10; // 1 cmd + 4 tick + 1 unused + 4 body_size

/// A blocking [`Read`] over an ordered stream of broadcast fragments; a closed channel reads as EOF.
struct ChannelReader {
    rx: std::sync::mpsc::Receiver<Bytes>,
    current: Bytes,
    pos: usize,
}

impl Read for ChannelReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        while self.pos >= self.current.len() {
            match self.rx.recv() {
                Ok(bytes) => {
                    self.current = bytes;
                    self.pos = 0;
                }
                Err(_) => return Ok(0),
            }
        }
        let n = (self.current.len() - self.pos).min(out.len());
        out[..n].copy_from_slice(&self.current[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

/// A synchronous [`DemoStream`] over the broadcast wire format, fed by a blocking byte channel.
///
/// Not seekable — it supports only a single forward [`Parser::run_to_end`] pass, which is all a live
/// broadcast allows. Command-body decoders delegate to `BroadcastFile`'s so both agree on the format.
struct LiveBroadcastStream {
    reader: ChannelReader,
    buf: Vec<u8>,
    eof: bool,
}

impl LiveBroadcastStream {
    fn new(rx: std::sync::mpsc::Receiver<Bytes>) -> Self {
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
    fn is_at_eof(&mut self) -> core::result::Result<bool, io::Error> {
        Ok(self.eof)
    }

    fn read_cmd_header(&mut self) -> core::result::Result<CmdHeader, ReadCmdHeaderError> {
        let mut header = [0u8; BROADCAST_CMD_HEADER_SIZE as usize];
        if let Err(e) = self.reader.read_exact(&mut header) {
            self.eof = e.kind() == io::ErrorKind::UnexpectedEof;
            return Err(ReadCmdHeaderError::IoError(e));
        }

        let cmd = EDemoCommands::try_from(i32::from(header[0])).map_err(|_| {
            ReadCmdHeaderError::UnknownCmd {
                raw: u32::from(header[0]),
                uncompressed: u32::from(header[0]),
            }
        })?;
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

    fn decode_cmd_send_tables(
        data: &[u8],
    ) -> core::result::Result<CDemoSendTables, DecodeCmdError> {
        <BroadcastDemoStream as DemoStream>::decode_cmd_send_tables(data)
    }

    fn decode_cmd_class_info(data: &[u8]) -> core::result::Result<CDemoClassInfo, DecodeCmdError> {
        <BroadcastDemoStream as DemoStream>::decode_cmd_class_info(data)
    }

    fn decode_cmd_packet(data: &[u8]) -> core::result::Result<CDemoPacket, DecodeCmdError> {
        <BroadcastDemoStream as DemoStream>::decode_cmd_packet(data)
    }

    fn decode_cmd_full_packet(
        data: &[u8],
    ) -> core::result::Result<CDemoFullPacket, DecodeCmdError> {
        <BroadcastDemoStream as DemoStream>::decode_cmd_full_packet(data)
    }

    fn skip_cmd(&mut self, cmd_header: &CmdHeader) -> core::result::Result<(), io::Error> {
        self.buf.resize(cmd_header.body_size as usize, 0);
        self.reader.read_exact(&mut self.buf)
    }
}
