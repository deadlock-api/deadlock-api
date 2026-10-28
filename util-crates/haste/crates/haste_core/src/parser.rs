#[cfg(feature = "async")]
use core::future::Future;
use prost::Message as _;
use std::io;
use std::io::SeekFrom;
use std::sync::Arc;
use valveprotos::common::{
    CDemoClassInfo, CDemoFullPacket, CDemoSendTables, CDemoStringTables, CsvcMsgCreateStringTable,
    CsvcMsgServerInfo, CsvcMsgUpdateStringTable, EDemoCommands, QuantizedFloatEncoderAliasT,
    SvcMessages,
};

use dungers::bitbuf::BitError;

use crate::bitreader::BitReader;
use crate::demofile::{DEMO_RECORD_BUFFER_SIZE, DemoHeaderError};
use crate::demostream::{CmdFormat, CmdHeader};
use crate::demostream::{
    DecodeCmdError, DemoStream, ReadCmdError, ReadCmdHeaderError, SeekableDemoStream,
};
use crate::entities::{
    DeltaHeader, Entity, EntityContainer, EntityParseError, deadlock_coord_from_cell_with_max_coord,
};
use crate::entityclasses::EntityClasses;
use crate::fielddecoder::FieldDecodeContext;
use crate::flattenedserializers::{FlattenedSerializerContainer, FlattenedSerializersError};
use crate::instancebaseline::{INSTANCE_BASELINE_TABLE_NAME, InstanceBaseline};
use crate::protowire::{PacketEntities, decode_full_packet_string_tables, decode_packet_entities};
use crate::stringtables::{StringTableContainer, StringTableError};

pub use crate::instancebaseline::InstanceBaselineError;

/// failures of the parser itself.
///
/// reading the demo stream, decoding commands, packets, string tables and entities, or a demo
/// that is inconsistent with itself. errors returned by a [`Visitor`] are not included, see
/// [`ParserError`].
#[derive(thiserror::Error, Debug)]
pub enum ParseError {
    #[error(transparent)]
    IoError(#[from] io::Error),
    #[error(transparent)]
    ReadCmdHeaderError(#[from] ReadCmdHeaderError),
    #[error(transparent)]
    ReadCmdError(#[from] ReadCmdError),
    #[error(transparent)]
    DecodeCmdError(#[from] DecodeCmdError),
    #[error(transparent)]
    DecodeProtobufError(#[from] prost::DecodeError),
    #[error(transparent)]
    DecompressError(#[from] snap::Error),
    #[error(transparent)]
    BitError(#[from] BitError),
    #[error(transparent)]
    StringTableError(#[from] StringTableError),
    #[error(transparent)]
    InstanceBaselineError(#[from] InstanceBaselineError),
    #[error(transparent)]
    EntityParseError(#[from] EntityParseError),
    #[error(transparent)]
    FlattenedSerializersError(#[from] FlattenedSerializersError),
    #[error("packet message of {size} bytes exceeds the {buf_len} byte buffer")]
    PacketMessageTooLarge { size: usize, buf_len: usize },
    #[error(
        "string table data decompresses to {decompress_len} bytes, more than the \
         {DEMO_RECORD_BUFFER_SIZE} byte limit"
    )]
    StringTableDataTooLarge { decompress_len: usize },
    #[error("entity classes are not available")]
    EntityClassesNotAvailable,
    #[error("serializers are not available")]
    SerializersNotAvailable,
    #[error("string table not found")]
    StringTableNotFound,
}

/// error of the parser's run methods, which call into a visitor.
///
/// either the parser failed ([`ParseError`]) or the visitor returned an error `E` (its `Error`
/// type), which is passed through as is so that it can be matched on (for example to treat a
/// sentinel error that stops parsing early as success).
#[derive(thiserror::Error, Debug)]
pub enum ParserError<E> {
    #[error(transparent)]
    Parse(#[from] ParseError),
    #[error(transparent)]
    Visitor(E),
}

// NOTE: a generic `From<T: Into<ParseError>>` would overlap with the reflexive `From` impl, so
// every source of `ParseError` gets its own impl to keep `?` working in the run methods.
macro_rules! impl_from_for_parser_error {
    ($($ty:ty),* $(,)?) => {
        $(
            impl<E> From<$ty> for ParserError<E> {
                fn from(err: $ty) -> Self {
                    Self::Parse(ParseError::from(err))
                }
            }
        )*
    };
}

impl_from_for_parser_error!(
    io::Error,
    ReadCmdHeaderError,
    ReadCmdError,
    DecodeCmdError,
    prost::DecodeError,
    snap::Error,
    BitError,
    StringTableError,
    InstanceBaselineError,
    EntityParseError,
    FlattenedSerializersError,
);

// as can be observed when dumping commands. also as specified in clarity
// (src/main/java/skadistats/clarity/model/engine/AbstractDotaEngineType.java)
// and documented in manta (string_table.go).
//
// NOTE: full packet interval is 1800 only if tick interval is 1 / 30 - this is true for dota2. full
// packets are written once per minute, so the interval scales with the tick rate (see
// `full_packet_interval`).
const DEFAULT_FULL_PACKET_INTERVAL: i32 = 1800;
// NOTE: tick interval is needed to be able to correctly decide simulation time values.
// dota2's tick interval is 1 / 30; deadlock's was 1 / 60, build 6712 replays use 1 / 64.
const DEFAULT_TICK_INTERVAL: f32 = 1.0 / 30.0;

/// number of ticks between two full packets for the given tick interval (one minute of ticks).
///
/// the ratio must not be truncated: deadlock's 1 / 64 tick interval (build 6712 replays) gives a
/// ratio of 2.133, and truncating it to 2 yields 3600 instead of the actual 3840, which makes
/// `Parser::run_to_tick` skip the last full packet before some targets and end up with no
/// entities.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    reason = "a tick count of a few thousand, rounded from an f32 ratio"
)]
fn full_packet_interval(tick_interval: f32) -> i32 {
    let ratio = DEFAULT_TICK_INTERVAL / tick_interval;
    (DEFAULT_FULL_PACKET_INTERVAL as f32 * ratio).round() as i32
}

// NOTE: primary purpose of Context is to to be able to expose state to the
// public; attempts to put parser into arguments of Visitor's method did not
// result in anything satisfyable.
//
// it also hosts the message handlers that the sync [`Parser`] and the async
// [`AsyncStreamingParser`] share; the parsers only own the loops that call into the visitor.
//
// TODO: consider turing Context into an enum with Initialized and Uninitialized variants. though
// there also must be an intermediary variant (or maybe stuff can be piled into Uninitialized
// variant) for incremental initialization. this may improve public api because string_tables,
// serializer, and other methods will not have to return Option when context is initialized.
pub struct Context {
    string_tables: StringTableContainer,
    instance_baseline: InstanceBaseline,
    serializers: Option<Arc<FlattenedSerializerContainer>>,
    entity_classes: Option<Arc<EntityClasses>>,
    entities: EntityContainer,
    tick_interval: f32,
    full_packet_interval: i32,
    tick: i32,
    prev_tick: i32,
    /// `CSVCMsg_GameSessionConfiguration.max_coord` (deadlock build 6712+).
    max_coord: Option<f32>,
    /// `CSVCMsg_GameSessionConfiguration.quantized_float_encoder_aliases` (deadlock build 6712+).
    quantized_float_encoder_aliases: Vec<QuantizedFloatEncoderAliasT>,

    // NOTE(blukai): is this the place for this? can it be moved "closer" to entities somewhere?
    field_decode_ctx: FieldDecodeContext,
    /// scratch space for decompressing string table data.
    string_table_buf: Vec<u8>,
    /// When set, `SvcPacketEntities` messages are not decoded. Used to fast-forward state without
    /// paying for entity decode in a warm-up region whose rows are discarded anyway.
    skip_entity_packets: bool,
}

/// reads one `(command, body)` message of a `CDemoPacket`'s data into `buf`.
fn read_packet_message<'b>(
    br: &mut BitReader,
    buf: &'b mut [u8],
) -> Result<(u32, &'b [u8]), ParseError> {
    let command = br.read_ubitvar()?;
    let size = br.read_uvarint32()? as usize;

    let buf_len = buf.len();
    let Some(buf) = buf.get_mut(..size) else {
        return Err(ParseError::PacketMessageTooLarge { size, buf_len });
    };
    br.read_bytes(buf)?;
    Ok((command, buf))
}

/// cursor over the entity deltas of a `CSVCMsg_PacketEntities` message.
struct EntityDeltaReader<'a> {
    br: BitReader<'a>,
    remaining: i32,
    entity_index: i32,
}

impl<'a> EntityDeltaReader<'a> {
    const fn new(msg: &PacketEntities<'a>) -> Self {
        Self {
            br: BitReader::new(msg.entity_data),
            remaining: msg.updated_entries,
            entity_index: -1,
        }
    }
}

/// result of applying a single entity delta, see [`Context::read_entity_delta`].
enum EntityDelta {
    /// nothing to report to the visitor (untracked or unknown entity).
    Silent,
    /// the entity at this index was created or updated.
    Live(i32),
    /// the entity was removed (left pvs or deleted).
    Removed(Entity),
}

impl Context {
    pub(crate) fn new() -> Self {
        Self {
            entities: EntityContainer::new(),
            string_tables: StringTableContainer::default(),
            instance_baseline: InstanceBaseline::default(),
            serializers: None,
            entity_classes: None,
            tick_interval: 0.0,
            full_packet_interval: 0,
            tick: -1,
            prev_tick: -1,
            max_coord: None,
            quantized_float_encoder_aliases: Vec::new(),
            field_decode_ctx: FieldDecodeContext::default(),
            string_table_buf: Vec::new(),
            skip_entity_packets: false,
        }
    }

    /// clears per-playback state (entities, string tables, baselines, ticks). serializers and
    /// entity classes never change within a demo, so they are kept.
    fn reset(&mut self) {
        self.entities.clear();
        self.string_tables.clear();
        self.instance_baseline.clear();
        self.tick = -1;
        self.prev_tick = -1;
    }

    /// picks up the bits of `CSVCMsg_ServerInfo` that the parser cares about.
    fn handle_server_info(&mut self, msg: &CsvcMsgServerInfo) {
        if let Some(tick_interval) = msg.tick_interval {
            self.tick_interval = tick_interval;

            self.full_packet_interval = full_packet_interval(tick_interval);

            // NOTE(blukai): field decoder context needs tick interval to be able to
            // decode simulation time floats.
            self.field_decode_ctx.tick_interval = tick_interval;
        }

        if let Some(game_session_config) = msg.game_session_config.as_ref() {
            self.max_coord = game_session_config.max_coord;
            self.quantized_float_encoder_aliases
                .clone_from(&game_session_config.quantized_float_encoder_aliases);
        }
    }

    // important initialization messages:
    // 1. DemSignonPacket (SvcCreateStringTable)
    // 2. DemSendTables (flattened serializers; never update)
    // 3. DemClassInfo (never update)

    fn handle_cmd_send_tables(&mut self, cmd: CDemoSendTables) -> Result<(), ParseError> {
        self.serializers = Some(Arc::new(
            FlattenedSerializerContainer::parse_with_quantized_float_encoder_aliases(
                cmd,
                &self.quantized_float_encoder_aliases,
            )?,
        ));
        Ok(())
    }

    fn handle_cmd_class_info(&mut self, cmd: &CDemoClassInfo) -> Result<(), ParseError> {
        let entity_classes = EntityClasses::parse(cmd);

        // NOTE: DemClassInfo message becomes available after
        // SvcCreateStringTable(which has instancebaselines). to know
        // how long vec that will contain instancebaseline values needs
        // to be (to allocate precicely how much we need) we need to
        // wait for DemClassInfos.
        if let Some(string_table) = self.string_tables.find_table(INSTANCE_BASELINE_TABLE_NAME) {
            self.instance_baseline
                .update(string_table, entity_classes.classes, |class_id| {
                    self.entities.invalidate_baseline(class_id);
                })?;
        }

        self.entity_classes = Some(Arc::new(entity_classes));
        Ok(())
    }

    fn handle_cmd_string_tables(&mut self, cmd: &CDemoStringTables) -> Result<(), ParseError> {
        self.string_tables.do_full_update(cmd);

        let Some(entity_classes) = self.entity_classes.as_ref() else {
            return Err(ParseError::EntityClassesNotAvailable);
        };
        if let Some(string_table) = self.string_tables.find_table(INSTANCE_BASELINE_TABLE_NAME) {
            self.instance_baseline
                .update(string_table, entity_classes.classes, |class_id| {
                    self.entities.invalidate_baseline(class_id);
                })?;
        }

        Ok(())
    }

    /// handles a single message of a `CDemoPacket`. `SvcPacketEntities` is handed back to the
    /// parser, because entity callbacks go through its visitor.
    fn handle_packet_message<'b>(
        &mut self,
        command: u32,
        buf: &'b [u8],
    ) -> Result<Option<PacketEntities<'b>>, ParseError> {
        match command {
            c if c == SvcMessages::SvcCreateStringTable as u32 => {
                let msg = CsvcMsgCreateStringTable::decode(buf)?;
                self.handle_svc_create_string_table(&msg)?;
            }

            c if c == SvcMessages::SvcUpdateStringTable as u32 => {
                let msg = CsvcMsgUpdateStringTable::decode(buf)?;
                self.handle_svc_update_string_table(&msg)?;
            }

            c if c == SvcMessages::SvcPacketEntities as u32 && !self.skip_entity_packets => {
                return Ok(Some(decode_packet_entities(buf)?));
            }

            c if c == SvcMessages::SvcServerInfo as u32 => {
                let msg = CsvcMsgServerInfo::decode(buf)?;
                self.handle_server_info(&msg);
            }

            _ => {
                // ignore
            }
        }
        Ok(None)
    }

    fn handle_svc_create_string_table(
        &mut self,
        msg: &CsvcMsgCreateStringTable,
    ) -> Result<(), ParseError> {
        let string_table = self.string_tables.create_string_table_mut(
            msg.name(),
            msg.user_data_fixed_size(),
            msg.user_data_size(),
            msg.user_data_size_bits(),
            msg.flags(),
            msg.using_varint_bitcounts(),
        );

        let string_data = if msg.data_compressed() {
            let sd = msg.string_data();
            let decompress_len = snap::raw::decompress_len(sd)?;
            // NOTE: the length comes from the (untrusted) snappy header; don't allocate whatever it
            // claims.
            if decompress_len > DEMO_RECORD_BUFFER_SIZE {
                return Err(ParseError::StringTableDataTooLarge { decompress_len });
            }
            self.string_table_buf.resize(decompress_len, 0);
            snap::raw::Decoder::new().decompress(sd, &mut self.string_table_buf)?;
            // `resize` made the buffer exactly `decompress_len` long.
            self.string_table_buf.as_slice()
        } else {
            msg.string_data()
        };

        let mut br = BitReader::new(string_data);
        string_table.parse_update(&mut br, msg.num_entries())?;

        if string_table.name().eq(INSTANCE_BASELINE_TABLE_NAME)
            && let Some(entity_classes) = self.entity_classes.as_ref()
        {
            self.instance_baseline
                .update(string_table, entity_classes.classes, |class_id| {
                    self.entities.invalidate_baseline(class_id);
                })?;
        }

        Ok(())
    }

    fn handle_svc_update_string_table(
        &mut self,
        msg: &CsvcMsgUpdateStringTable,
    ) -> Result<(), ParseError> {
        let Some(string_table) = usize::try_from(msg.table_id())
            .ok()
            .and_then(|table_id| self.string_tables.get_table_mut(table_id))
        else {
            return Err(ParseError::StringTableNotFound);
        };

        let mut br = BitReader::new(msg.string_data());
        string_table.parse_update(&mut br, msg.num_changed_entries())?;

        if string_table.name().eq(INSTANCE_BASELINE_TABLE_NAME)
            && let Some(entity_classes) = self.entity_classes.as_ref()
        {
            self.instance_baseline
                .update(string_table, entity_classes.classes, |class_id| {
                    self.entities.invalidate_baseline(class_id);
                })?;
        }

        Ok(())
    }

    // NOTE: read_entity_delta is partially based on
    // ReadPacketEntities in engine/client.cpp

    /// applies the next entity delta of a `SvcPacketEntities` message; returns `None` once all
    /// deltas have been read.
    fn read_entity_delta<F>(
        &mut self,
        rdr: &mut EntityDeltaReader,
        should_track: F,
    ) -> Result<Option<(DeltaHeader, EntityDelta)>, ParseError>
    where
        F: Fn(u64) -> bool,
    {
        if rdr.remaining <= 0 {
            return Ok(None);
        }
        rdr.remaining = rdr.remaining.saturating_sub(1);

        let Some(entity_classes) = self.entity_classes.as_deref() else {
            return Err(ParseError::EntityClassesNotAvailable);
        };
        let Some(serializers) = self.serializers.as_deref() else {
            return Err(ParseError::SerializersNotAvailable);
        };

        let br = &mut rdr.br;
        // NOTE: valve's (wrapping) int arithmetic: `iEntityIndex += 1 + buf.ReadUBitVar()`.
        rdr.entity_index = rdr
            .entity_index
            .wrapping_add(br.read_ubitvar()?.cast_signed())
            .wrapping_add(1);
        let entity_index = rdr.entity_index;

        let delta_header = DeltaHeader::from_bit_reader(br)?;
        let delta = match delta_header {
            DeltaHeader::CREATE => self
                .entities
                .handle_create_with_filter(
                    entity_index,
                    &mut self.field_decode_ctx,
                    br,
                    entity_classes,
                    &self.instance_baseline,
                    serializers,
                    should_track,
                )?
                .map_or(EntityDelta::Silent, EntityDelta::Live),
            DeltaHeader::DELETE => self
                .entities
                .handle_delete(entity_index)
                .map_or(EntityDelta::Silent, EntityDelta::Removed),
            DeltaHeader::LEAVE => self
                .entities
                .handle_leave(entity_index)
                .map_or(EntityDelta::Silent, EntityDelta::Removed),
            DeltaHeader::UPDATE => self
                .entities
                .handle_update(entity_index, &mut self.field_decode_ctx, br)?
                .map_or(EntityDelta::Silent, |_| EntityDelta::Live(entity_index)),
            _ => EntityDelta::Silent,
        };

        Ok(Some((delta_header, delta)))
    }

    /// the entity a delta reports on, if any.
    fn delta_entity<'e>(&'e self, delta: &'e EntityDelta) -> Option<&'e Entity> {
        match delta {
            EntityDelta::Silent => None,
            EntityDelta::Live(index) => self.entities.get(index),
            EntityDelta::Removed(entity) => Some(entity),
        }
    }

    // NOTE: following methods are public-facing api; do not use them internally

    #[must_use]
    pub const fn string_tables(&self) -> Option<&StringTableContainer> {
        if self.string_tables.is_empty() {
            None
        } else {
            Some(&self.string_tables)
        }
    }

    #[must_use]
    pub fn serializers(&self) -> Option<&FlattenedSerializerContainer> {
        self.serializers.as_deref()
    }

    #[must_use]
    pub fn entity_classes(&self) -> Option<&EntityClasses> {
        self.entity_classes.as_deref()
    }

    #[must_use]
    pub fn entities(&self) -> Option<&EntityContainer> {
        if self.entities.is_empty() {
            None
        } else {
            Some(&self.entities)
        }
    }

    #[must_use]
    pub const fn tick_interval(&self) -> f32 {
        self.tick_interval
    }

    #[must_use]
    pub const fn tick(&self) -> i32 {
        self.tick
    }

    /// world coordinate bound announced by the server (`CSVCMsg_GameSessionConfiguration.max_coord`).
    ///
    /// deadlock doubled it from 16384 to 32768 in build 6712 (this moved the world origin cell
    /// from 32 to 64). `None` for replays that predate it.
    #[must_use]
    pub const fn max_coord(&self) -> Option<f32> {
        self.max_coord
    }

    /// quantized float encoder aliases announced by the server
    /// (`CSVCMsg_GameSessionConfiguration.quantized_float_encoder_aliases`).
    #[must_use]
    pub fn quantized_float_encoder_aliases(&self) -> &[QuantizedFloatEncoderAliasT] {
        &self.quantized_float_encoder_aliases
    }

    /// given a deadlock cell and an offset in that cell, reconstruct the world coord, honoring
    /// [`Self::max_coord`] (see [`deadlock_coord_from_cell_with_max_coord`]).
    #[must_use]
    pub fn deadlock_coord_from_cell(&self, cell: u16, vec: f32) -> f32 {
        deadlock_coord_from_cell_with_max_coord(cell, vec, self.max_coord)
    }
}

/// the parts of parser state that never change within a demo.
///
/// flattened serializers from `DemSendTables` and entity classes from `DemClassInfo`, reference
/// counted so that parsers of the same demo can share them instead of parsing them again (see
/// [`Parser::shared_state`] and [`Parser::set_shared_state`]).
#[derive(Clone)]
pub struct SharedState {
    serializers: Arc<FlattenedSerializerContainer>,
    entity_classes: Arc<EntityClasses>,
}

pub trait Visitor {
    type Error: core::error::Error + Send + Sync + 'static;

    /// Decides whether the entity backed by the serializer identified by
    /// `serializer_name_hash` should be tracked. Returning `false` lets the parser
    /// skip-decode the entity's fields without materializing it, which is cheaper
    /// when a consumer only cares about a subset of entity types.
    ///
    /// The default tracks everything.
    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        true
    }

    /// Toggle whether visitor callbacks should record output.
    ///
    /// Used when fast-forwarding through the demo to build up parser state (serializers, entity
    /// classes, instance baselines) that must exist before a segment can be parsed, without
    /// emitting the rows from that warm-up region. The default is a no-op (always recording).
    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn set_collecting(&mut self, collecting: bool) {}

    // TODO: include updated fields (list of field paths?)
    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_cmd(
        &mut self,
        ctx: &Context,
        cmd_header: &CmdHeader,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Async variant of [`Visitor`], enabled by the `async` feature for use with
/// [`AsyncStreamingParser`]. The `on_*` callbacks return `Send + Sync` futures so the parser can be
/// driven from a spawned task.
#[cfg(feature = "async")]
pub trait AsyncVisitor {
    type Error: core::error::Error + Send + Sync + 'static;

    /// Decides whether the entity backed by the serializer identified by
    /// `serializer_name_hash` should be tracked. Returning `false` lets the parser
    /// skip-decode the entity's fields without materializing it, which is cheaper
    /// when a consumer only cares about a subset of entity types.
    ///
    /// The default tracks everything.
    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        true
    }

    /// Toggle whether visitor callbacks should record output.
    ///
    /// Used when fast-forwarding through the demo to build up parser state (serializers, entity
    /// classes, instance baselines) that must exist before a segment can be parsed, without
    /// emitting the rows from that warm-up region. The default is a no-op (always recording).
    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn set_collecting(&mut self, collecting: bool) {}

    // TODO: include updated fields (list of field paths?)
    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }

    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_cmd(
        &mut self,
        ctx: &Context,
        cmd_header: &CmdHeader,
        data: &[u8],
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }

    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }

    #[expect(unused_variables, reason = "the default ignores its arguments")]
    fn on_tick_end(
        &mut self,
        ctx: &Context,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }
}

/// `ControlFlow` indicates the desired behavior of the run loop.
#[derive(Clone, Copy)]
enum ControlFlow {
    /// indicates that the command should be handled by the parser.
    Handle,
    /// indicates that the command should be skipped; the stream position will be advanced by the
    /// size of the command.
    Skip,
    /// indicates that the command should not be handled nor skipped, suggesting that it has been
    /// handled in a different manner outside the regular flow.
    Ignore,
}

// TODO: maybe rename to DemoPlayer (or DemoRunner?)
pub struct Parser<D: DemoStream, V: Visitor> {
    demo_stream: D,
    buf: Vec<u8>,
    visitor: V,
    ctx: Context,
}

impl<D: DemoStream, V: Visitor> Parser<D, V> {
    pub fn from_stream_with_visitor(demo_stream: D, visitor: V) -> Result<Self, DemoHeaderError> {
        Ok(Self {
            demo_stream,
            buf: vec![0; DEMO_RECORD_BUFFER_SIZE],
            visitor,
            ctx: Context::new(),
        })
    }

    // TODO(blukai): what if parse_to_end and parse_to_tick will not be Parser's direct
    // "responsibility", but instead they will be implemented as "extensions" or something?
    //
    // why? for example dota 2 allows to record replays in real time (not anymore in matchmaking,
    // but in lobbies). those replays can be parsed in real time, but the process requires some
    // special handling (watch fs events (and in some cases poll) of demo file that is being
    // recorded).
    //
    // must be publicly exposed for this to be actually useful.
    fn dispatch(
        &mut self,
        cf: ControlFlow,
        cmd_header: &CmdHeader,
    ) -> Result<(), ParserError<V::Error>> {
        match cf {
            ControlFlow::Handle => {
                self.handle_cmd(cmd_header)?;
                if self.ctx.prev_tick != self.ctx.tick {
                    self.visitor
                        .on_tick_end(&self.ctx)
                        .map_err(ParserError::Visitor)?;
                }
            }
            ControlFlow::Skip => self.demo_stream.skip_cmd(cmd_header)?,
            ControlFlow::Ignore => {}
        }
        Ok(())
    }

    fn run<F>(&mut self, mut handler: F) -> Result<(), ParserError<V::Error>>
    where
        F: FnMut(&mut Self, &CmdHeader) -> Result<ControlFlow, ParserError<V::Error>>,
    {
        loop {
            match self.demo_stream.read_cmd_header() {
                Ok(cmd_header) => {
                    self.ctx.prev_tick = self.ctx.tick;
                    self.ctx.tick = cmd_header.tick;
                    let cf = handler(self, &cmd_header)?;
                    self.dispatch(cf, &cmd_header)?;
                }
                Err(err) => {
                    if self.demo_stream.is_at_eof().unwrap_or_default() {
                        return Ok(());
                    }
                    return Err(err.into());
                }
            }
        }
    }

    pub fn run_to_end(&mut self) -> Result<(), ParserError<V::Error>> {
        self.run(|_notnotself, _cmd_header| Ok(ControlFlow::Handle))
    }

    /// like [`run_to_end`](Self::run_to_end), but entities are cleared whenever a full packet
    /// arrives, so that the entity state is rebuilt from each snapshot (entities that the snapshot
    /// does not restate do not linger).
    pub fn run_to_end_final_state(&mut self) -> Result<(), ParserError<V::Error>> {
        self.run(|notnotself, cmd_header| {
            if cmd_header.cmd == EDemoCommands::DemFullPacket {
                notnotself.ctx.entities.clear();
            }
            Ok(ControlFlow::Handle)
        })
    }

    fn handle_cmd(&mut self, cmd_header: &CmdHeader) -> Result<(), ParserError<V::Error>> {
        // TODO: consider introducing CmdInstance thing that would allow to decode body once and
        // not read it, but skip, if unconsumed. note that to work temporary ownership of
        // demo_stream will need to be taken.
        let cmd_body = self.demo_stream.read_cmd(cmd_header)?;
        self.visitor
            .on_cmd(&self.ctx, cmd_header, cmd_body)
            .map_err(ParserError::Visitor)?;

        match cmd_header.cmd {
            EDemoCommands::DemPacket | EDemoCommands::DemSignonPacket => {
                let data = D::cmd_packet_data(cmd_body)?;
                Self::handle_cmd_packet(&mut self.ctx, &mut self.visitor, &mut self.buf, data)?;
            }

            // NOTE: these checks exist because seeking exists, there's no need to re-parse
            // flattened serializers / entity classes.
            EDemoCommands::DemSendTables if self.ctx.serializers.is_none() => {
                let cmd = D::decode_cmd_send_tables(cmd_body)?;
                self.ctx.handle_cmd_send_tables(cmd)?;
            }
            EDemoCommands::DemClassInfo if self.ctx.entity_classes.is_none() => {
                let cmd = D::decode_cmd_class_info(cmd_body)?;
                self.ctx.handle_cmd_class_info(&cmd)?;
            }

            EDemoCommands::DemFullPacket => {
                let cmd = D::decode_cmd_full_packet(cmd_body)?;
                self.handle_cmd_full_packet(cmd)?;
            }

            _ => {
                // ignore
            }
        }

        Ok(())
    }

    /// takes the parser apart into fields because `data` usually borrows from the demo stream.
    fn handle_cmd_packet(
        ctx: &mut Context,
        visitor: &mut V,
        buf: &mut [u8],
        data: &[u8],
    ) -> Result<(), ParserError<V::Error>> {
        let mut br = BitReader::new(data);
        while br.num_bits_left() > 8 {
            let (command, buf) = read_packet_message(&mut br, buf)?;
            visitor
                .on_packet(ctx, command, buf)
                .map_err(ParserError::Visitor)?;
            if let Some(msg) = ctx.handle_packet_message(command, buf)? {
                let mut rdr = EntityDeltaReader::new(&msg);
                while let Some((delta_header, delta)) =
                    ctx.read_entity_delta(&mut rdr, |hash| visitor.should_track_entity(hash))?
                {
                    if let Some(entity) = ctx.delta_entity(&delta) {
                        visitor
                            .on_entity(ctx, delta_header, entity)
                            .map_err(ParserError::Visitor)?;
                    }
                }
            }
        }
        Ok(())
    }

    fn handle_cmd_full_packet(
        &mut self,
        cmd: CDemoFullPacket,
    ) -> Result<(), ParserError<V::Error>> {
        if let Some(string_table) = cmd.string_table.as_ref() {
            self.ctx.handle_cmd_string_tables(string_table)?;
        }

        if let Some(packet) = cmd.packet {
            Self::handle_cmd_packet(
                &mut self.ctx,
                &mut self.visitor,
                &mut self.buf,
                packet.data(),
            )?;
        }

        Ok(())
    }

    // public api
    // ----

    pub const fn demo_stream(&self) -> &D {
        &self.demo_stream
    }

    pub const fn demo_stream_mut(&mut self) -> &mut D {
        &mut self.demo_stream
    }

    pub const fn context(&self) -> &Context {
        &self.ctx
    }

    /// serializers and entity classes once they have been parsed (after the demo's
    /// `DemSendTables` and `DemClassInfo`), for sharing with other parsers of the same demo.
    #[must_use]
    pub fn shared_state(&self) -> Option<SharedState> {
        Some(SharedState {
            serializers: Arc::clone(self.ctx.serializers.as_ref()?),
            entity_classes: Arc::clone(self.ctx.entity_classes.as_ref()?),
        })
    }

    /// installs serializers and entity classes taken from another parser of the *same* demo; the
    /// parser then skips its own `DemSendTables` / `DemClassInfo` handling.
    pub fn set_shared_state(&mut self, state: SharedState) {
        self.ctx.serializers = Some(state.serializers);
        self.ctx.entity_classes = Some(state.entity_classes);
    }

    pub fn into_visitor(self) -> V {
        self.visitor
    }

    pub const fn visitor_mut(&mut self) -> &mut V {
        &mut self.visitor
    }
}

impl<D: SeekableDemoStream, V: Visitor> Parser<D, V> {
    /// like [`run`](Parser::run) but the handler can return `None` to break out of the loop,
    /// unreading the current cmd header and restoring the previous tick.
    fn run_seekable<F>(&mut self, mut handler: F) -> Result<(), ParserError<V::Error>>
    where
        F: FnMut(&mut Self, &CmdHeader) -> Result<Option<ControlFlow>, ParserError<V::Error>>,
    {
        loop {
            match self.demo_stream.read_cmd_header() {
                Ok(cmd_header) => {
                    self.ctx.prev_tick = self.ctx.tick;
                    self.ctx.tick = cmd_header.tick;
                    if let Some(cf) = handler(self, &cmd_header)? {
                        self.dispatch(cf, &cmd_header)?;
                    } else {
                        self.demo_stream.unread_cmd_header(&cmd_header)?;
                        self.ctx.tick = self.ctx.prev_tick;
                        return Ok(());
                    }
                }
                Err(err) => {
                    if self.demo_stream.is_at_eof().unwrap_or_default() {
                        return Ok(());
                    }
                    return Err(err.into());
                }
            }
        }
    }

    fn reset(&mut self) -> Result<(), io::Error> {
        self.demo_stream
            .seek(SeekFrom::Start(self.demo_stream.start_position()))?;
        self.ctx.reset();
        Ok(())
    }

    pub fn run_to_tick(&mut self, target_tick: i32) -> Result<(), ParserError<V::Error>> {
        // TODO: do not allow tick to be less then -1

        // TODO: do not allow tick to be greater then total ticks

        // TODO: do not clear if seeking forward and there's no full packet on
        // the way to the wanted tick / if target tick is closer then full
        // packet interval
        self.reset()?;

        // NOTE: EDemoCommands::DemSyncTick is the last command with 4294967295
        // tick (normlized to -1). last "initialization" command.
        let mut did_handle_first_sync_tick = false;

        // NOTE: EDemoCommands::DemFullPacket contains snapshot of everything...
        // everything? it does not seem like it: string tables must be handled.
        let mut did_handle_last_full_packet = false;

        self.run_seekable(|notnotself: &mut Self, cmd_header: &CmdHeader| {
            if cmd_header.tick > target_tick {
                return Ok(None);
            }

            // init string tables, flattened serializers and entity classes
            if !did_handle_first_sync_tick {
                did_handle_first_sync_tick = cmd_header.cmd == EDemoCommands::DemSyncTick;
                return Ok(Some(ControlFlow::Handle));
            }

            let is_full_packet = cmd_header.cmd == EDemoCommands::DemFullPacket;
            let distance_to_target_tick = target_tick.saturating_sub(notnotself.ctx.tick);
            // TODO: what if there's no full packet ahead? maybe dem file is
            // corrupted or something... scan for full packets before enterint
            // the "run"?
            let has_full_packet_ahead =
                distance_to_target_tick > notnotself.ctx.full_packet_interval.saturating_add(100);
            if is_full_packet {
                let cmd_body = notnotself.demo_stream.read_cmd(cmd_header)?;
                notnotself
                    .visitor
                    .on_cmd(&notnotself.ctx, cmd_header, cmd_body)
                    .map_err(ParserError::Visitor)?;

                let mut cmd = D::decode_cmd_full_packet(cmd_body)?;
                if has_full_packet_ahead {
                    // NOTE: clarity seem to ignore "intermediary" full packet's
                    // packet
                    //
                    // TODO: verify that is okay to ignore "intermediary" full
                    // packet's packet
                    cmd.packet = None;
                }
                notnotself.handle_cmd_full_packet(cmd)?;
                // NOTE: there's absolutely no reason to check if tick changed because it changed.
                notnotself
                    .visitor
                    .on_tick_end(&notnotself.ctx)
                    .map_err(ParserError::Visitor)?;

                did_handle_last_full_packet = !has_full_packet_ahead;

                return Ok(Some(ControlFlow::Ignore));
            }

            if did_handle_last_full_packet {
                Ok(Some(ControlFlow::Handle))
            } else {
                Ok(Some(ControlFlow::Skip))
            }
        })
    }

    /// Header-only scan of the whole demo, returning the tick of every
    /// [`EDemoCommands::DemFullPacket`] in file order.
    ///
    /// Bodies are skipped (no decompression / decoding), so this is cheap. The stream is left
    /// rewound to its start position. Full packets are complete state snapshots, so their offsets
    /// are valid points at which to begin an independent parse — this is the basis for splitting a
    /// demo into segments that can be parsed in parallel.
    pub fn scan_full_packet_ticks(&mut self) -> Result<Vec<i32>, ParseError> {
        self.reset()?;
        let mut ticks = Vec::new();
        loop {
            match self.demo_stream.read_cmd_header() {
                Ok(cmd_header) => {
                    if cmd_header.cmd == EDemoCommands::DemFullPacket {
                        ticks.push(cmd_header.tick);
                    }
                    self.demo_stream.skip_cmd(&cmd_header)?;
                }
                Err(_) if self.demo_stream.is_at_eof().unwrap_or_default() => break,
                Err(err) => return Err(err.into()),
            }
        }
        self.reset()?;
        Ok(ticks)
    }

    /// Parses just enough of the demo to know its serializers and entity classes (signon,
    /// `DemSendTables`, `DemClassInfo`; entity decode is skipped) and returns them for
    /// [`set_shared_state`](Self::set_shared_state) on other parsers of the same demo. `None` if
    /// the demo has no send tables or class info. The visitor sees the handled commands; the
    /// stream is left rewound to its start position.
    pub fn parse_shared_state(&mut self) -> Result<Option<SharedState>, ParserError<V::Error>> {
        self.reset()?;
        self.ctx.skip_entity_packets = true;
        let result = self.run_seekable(|s: &mut Self, cmd_header: &CmdHeader| {
            if s.ctx.serializers.is_some() && s.ctx.entity_classes.is_some() {
                return Ok(None);
            }
            Ok(Some(match cmd_header.cmd {
                EDemoCommands::DemSendTables
                | EDemoCommands::DemClassInfo
                | EDemoCommands::DemSignonPacket => ControlFlow::Handle,
                _ => ControlFlow::Skip,
            }))
        });
        self.ctx.skip_entity_packets = false;
        result?;
        let state = self.shared_state();
        self.reset()?;
        Ok(state)
    }

    /// Parse the segment owned by a single full packet: the commands from full packet `ordinal`
    /// (a complete state snapshot) up to — but not including — the next full packet, or EOF for the
    /// last one. `ordinal` indexes the list returned by
    /// [`scan_full_packet_ticks`](Self::scan_full_packet_ticks).
    ///
    /// Full packet 0 additionally covers the pre-first-full-packet signon region. For later
    /// ordinals the parser fast-forwards through the file handling only the init/signon commands —
    /// skipping entity decode — to populate serializers, entity classes and instance baselines,
    /// and applies the string tables (only) of every earlier full packet: a full packet restates
    /// just the tables that changed since the previous one, so the string table state at our full
    /// packet is the sum of all earlier snapshots. Then it applies our full packet (which
    /// re-creates all live entities and brings its own table changes) before collecting forward. Because every command belongs to exactly one
    /// full packet's segment and boundaries fall on the full-packet command itself, concatenating
    /// the per-ordinal outputs in order reproduces a single end-to-end parse exactly.
    pub fn run_full_packet(&mut self, ordinal: usize) -> Result<(), ParserError<V::Error>> {
        self.reset()?;

        let mut fp_seen: usize = 0;
        let mut collecting = ordinal == 0;

        // For a later segment, build parser state but suppress output until our full packet. The
        // signon commands are handled (not skipped) so serializers, entity classes and instance
        // baselines are populated; entity decode is skipped (the rows are discarded anyway and the
        // full packet restates all entity state from scratch). Earlier full packets contribute
        // their string tables, which together with ours give the baselines its creates need.
        if !collecting {
            self.visitor.set_collecting(false);
            self.ctx.skip_entity_packets = true;
        }

        let result = self.run_seekable(|s: &mut Self, cmd_header: &CmdHeader| {
            if cmd_header.cmd == EDemoCommands::DemFullPacket {
                let this_ordinal = fp_seen;
                fp_seen = fp_seen.saturating_add(1);
                if this_ordinal < ordinal {
                    // A full packet before ours. Its entity packet is superseded by ours, but its
                    // string tables are not: a full packet only restates the tables that changed
                    // since the previous one (e.g. instancebaseline is often absent), so the
                    // string table state at our full packet is the sum of all earlier snapshots.
                    // Only the string_table field is decoded; the entity packet (the bulk of the
                    // body) is skipped, keeping later segments from paying for every earlier one.
                    if D::CMD_FORMAT == CmdFormat::Broadcast {
                        // broadcast full packets carry no string tables.
                        return Ok(Some(ControlFlow::Skip));
                    }
                    let cmd_body = s.demo_stream.read_cmd(cmd_header)?;
                    if let Some(string_table) = decode_full_packet_string_tables(cmd_body)? {
                        s.ctx.handle_cmd_string_tables(&string_table)?;
                    }
                    return Ok(Some(ControlFlow::Ignore));
                }
                if this_ordinal == ordinal {
                    // Our full packet: start collecting and apply it.
                    collecting = true;
                    s.visitor.set_collecting(true);
                    s.ctx.skip_entity_packets = false;
                    return Ok(Some(ControlFlow::Handle));
                }
                // The next full packet begins the following segment — stop here.
                return Ok(None);
            }

            if collecting {
                return Ok(Some(ControlFlow::Handle));
            }

            // Warm-up (entity decode suppressed): handle init/signon so state is established;
            // skip the per-tick delta packets, whose state our full packet will restate.
            // Serializers and entity classes never change, so when they are already known (shared
            // from another parser) their commands are skipped without being read.
            match cmd_header.cmd {
                EDemoCommands::DemSendTables if s.ctx.serializers.is_some() => {
                    Ok(Some(ControlFlow::Skip))
                }
                EDemoCommands::DemClassInfo if s.ctx.entity_classes.is_some() => {
                    Ok(Some(ControlFlow::Skip))
                }
                EDemoCommands::DemSendTables
                | EDemoCommands::DemClassInfo
                | EDemoCommands::DemSignonPacket => Ok(Some(ControlFlow::Handle)),
                _ => Ok(Some(ControlFlow::Skip)),
            }
        });

        self.ctx.skip_entity_packets = false;
        result
    }
}

#[cfg(feature = "async")]
use crate::async_demostream::AsyncDemoStream;

#[cfg(feature = "async")]
pub struct AsyncStreamingParser<D: AsyncDemoStream, V: AsyncVisitor> {
    demo_stream: D,
    buf: Vec<u8>,
    visitor: V,
    ctx: Context,
}

#[cfg(feature = "async")]
impl<D: AsyncDemoStream, V: AsyncVisitor> AsyncStreamingParser<D, V> {
    pub fn from_stream_with_visitor(demo_stream: D, visitor: V) -> Result<Self, DemoHeaderError> {
        Ok(Self {
            demo_stream,
            buf: vec![0; DEMO_RECORD_BUFFER_SIZE],
            visitor,
            ctx: Context::new(),
        })
    }

    pub fn into_visitor(self) -> V {
        self.visitor
    }

    pub const fn visitor_mut(&mut self) -> &mut V {
        &mut self.visitor
    }

    pub async fn run_to_end(&mut self) -> Result<(), ParserError<V::Error>> {
        self.run_internal(false).await
    }

    /// like [`run_to_end`](Self::run_to_end), but entities are cleared whenever a full packet
    /// arrives, so that the entity state is rebuilt from each snapshot.
    pub async fn run_to_end_final_state(&mut self) -> Result<(), ParserError<V::Error>> {
        self.run_internal(true).await
    }

    async fn run_internal(
        &mut self,
        reset_on_full_packet: bool,
    ) -> Result<(), ParserError<V::Error>> {
        loop {
            match self.demo_stream.read_cmd_header().await {
                Ok(cmd_header) => {
                    self.ctx.prev_tick = self.ctx.tick;
                    self.ctx.tick = cmd_header.tick;

                    if reset_on_full_packet && cmd_header.cmd == EDemoCommands::DemFullPacket {
                        self.ctx.entities.clear();
                    }

                    self.handle_cmd(&cmd_header).await?;
                    if self.ctx.prev_tick != self.ctx.tick {
                        self.visitor
                            .on_tick_end(&self.ctx)
                            .await
                            .map_err(ParserError::Visitor)?;
                    }
                }
                Err(err) => {
                    // NOTE: the async demo file reads the cmd header's leading varint byte by
                    // byte, so a clean end of file surfaces as a varint io error.
                    if matches!(
                        err,
                        crate::demostream::ReadCmdHeaderError::IoError(ref e)
                            | crate::demostream::ReadCmdHeaderError::ReadVarintError(
                                dungers::varint::VarintError::IoError(ref e)
                            )
                            if e.kind() == io::ErrorKind::UnexpectedEof
                    ) {
                        return Ok(());
                    }
                    return Err(err.into());
                }
            }
        }
    }

    async fn handle_cmd(&mut self, cmd_header: &CmdHeader) -> Result<(), ParserError<V::Error>> {
        let cmd_body = self.demo_stream.read_cmd(cmd_header).await?;
        self.visitor
            .on_cmd(&self.ctx, cmd_header, cmd_body)
            .await
            .map_err(ParserError::Visitor)?;

        match cmd_header.cmd {
            EDemoCommands::DemPacket | EDemoCommands::DemSignonPacket => {
                let data = D::cmd_packet_data(cmd_body)?;
                Self::handle_cmd_packet(&mut self.ctx, &mut self.visitor, &mut self.buf, data)
                    .await?;
            }

            EDemoCommands::DemSendTables if self.ctx.serializers.is_none() => {
                let cmd = D::decode_cmd_send_tables(cmd_body)?;
                self.ctx.handle_cmd_send_tables(cmd)?;
            }
            EDemoCommands::DemClassInfo if self.ctx.entity_classes.is_none() => {
                let cmd = D::decode_cmd_class_info(cmd_body)?;
                self.ctx.handle_cmd_class_info(&cmd)?;
            }

            EDemoCommands::DemFullPacket => {
                let cmd = D::decode_cmd_full_packet(cmd_body)?;
                if let Some(string_table) = cmd.string_table.as_ref() {
                    self.ctx.handle_cmd_string_tables(string_table)?;
                }
                if let Some(packet) = cmd.packet {
                    Self::handle_cmd_packet(
                        &mut self.ctx,
                        &mut self.visitor,
                        &mut self.buf,
                        packet.data(),
                    )
                    .await?;
                }
            }

            _ => {}
        }

        Ok(())
    }

    /// takes the parser apart into fields because `data` usually borrows from the demo stream.
    async fn handle_cmd_packet(
        ctx: &mut Context,
        visitor: &mut V,
        buf: &mut [u8],
        data: &[u8],
    ) -> Result<(), ParserError<V::Error>> {
        let mut br = BitReader::new(data);
        while br.num_bits_left() > 8 {
            let (command, buf) = read_packet_message(&mut br, buf)?;
            visitor
                .on_packet(ctx, command, buf)
                .await
                .map_err(ParserError::Visitor)?;
            if let Some(msg) = ctx.handle_packet_message(command, buf)? {
                let mut rdr = EntityDeltaReader::new(&msg);
                while let Some((delta_header, delta)) =
                    ctx.read_entity_delta(&mut rdr, |hash| visitor.should_track_entity(hash))?
                {
                    if let Some(entity) = ctx.delta_entity(&delta) {
                        visitor
                            .on_entity(ctx, delta_header, entity)
                            .await
                            .map_err(ParserError::Visitor)?;
                    }
                }
            }
        }
        Ok(())
    }

    pub const fn demo_stream(&self) -> &D {
        &self.demo_stream
    }

    pub const fn demo_stream_mut(&mut self) -> &mut D {
        &mut self.demo_stream
    }

    pub const fn context(&self) -> &Context {
        &self.ctx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_full_packet_interval() {
        // dota2
        assert_eq!(full_packet_interval(1.0 / 30.0), 1800);
        // deadlock before build 6712
        assert_eq!(full_packet_interval(1.0 / 60.0), 3600);
        // deadlock build 6712 replays: full packets at ticks 1, 3841, 7681, ...
        assert_eq!(full_packet_interval(1.0 / 64.0), 3840);
    }
}
