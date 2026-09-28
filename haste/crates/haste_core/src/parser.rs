use anyhow::bail;
#[cfg(feature = "async")]
use core::future::Future;
use prost::Message;
use std::io;
#[cfg(not(feature = "async"))]
use std::io::SeekFrom;
use valveprotos::common::{
    CDemoFullPacket, CDemoPacket, CDemoStringTables, CsvcMsgCreateStringTable,
    CsvcMsgPacketEntities, CsvcMsgServerInfo, CsvcMsgUpdateStringTable, EDemoCommands, SvcMessages,
};

use crate::bitreader::BitReader;
use crate::demofile::{DEMO_RECORD_BUFFER_SIZE, DemoHeaderError};
use crate::demostream::CmdHeader;
#[cfg(not(feature = "async"))]
use crate::demostream::{DemoStream, SeekableDemoStream};
use crate::entities::{DeltaHeader, Entity, EntityContainer};
use crate::entityclasses::EntityClasses;
use crate::fielddecoder::FieldDecodeContext;
use crate::flattenedserializers::FlattenedSerializerContainer;
use crate::instancebaseline::{INSTANCE_BASELINE_TABLE_NAME, InstanceBaseline};
use crate::stringtables::StringTableContainer;

// as can be observed when dumping commands. also as specified in clarity
// (src/main/java/skadistats/clarity/model/engine/AbstractDotaEngineType.java)
// and documented in manta (string_table.go).
//
// NOTE: full packet interval is 1800 only if tick interval is 1 / 30 - this is true for dota2, but
// deaclock's tick interval is x 2.
const DEFAULT_FULL_PACKET_INTERVAL: i32 = 1800;
// NOTE: tick interval is needed to be able to correctly decide simulation time values.
// dota2's tick interval is 1 / 30; deadlock's 1 / 60 - they are constant.
const DEFAULT_TICK_INTERVAL: f32 = 1.0 / 30.0;

// NOTE: primary purpose of Context is to to be able to expose state to the
// public; attempts to put parser into arguments of Visitor's method did not
// result in anything satisfyable.
//
// TODO: consider turing Context into an enum with Initialized and Uninitialized variants. though
// there also must be an intermediary variant (or maybe stuff can be piled into Uninitialized
// variant) for incremental initialization. this may improve public api because string_tables,
// serializer, and other methods will not have to return Option when context is initialized.
pub struct Context {
    string_tables: StringTableContainer,
    instance_baseline: InstanceBaseline,
    serializers: Option<FlattenedSerializerContainer>,
    entity_classes: Option<EntityClasses>,
    entities: EntityContainer,
    tick_interval: f32,
    full_packet_interval: i32,
    tick: i32,
    prev_tick: i32,
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
        }
    }

    // NOTE: following methods are public-facing api; do not use them internally

    #[must_use]
    pub fn string_tables(&self) -> Option<&StringTableContainer> {
        if self.string_tables.is_empty() {
            None
        } else {
            Some(&self.string_tables)
        }
    }

    #[must_use]
    pub fn serializers(&self) -> Option<&FlattenedSerializerContainer> {
        self.serializers.as_ref()
    }

    #[must_use]
    pub fn entity_classes(&self) -> Option<&EntityClasses> {
        self.entity_classes.as_ref()
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
    pub fn tick_interval(&self) -> f32 {
        self.tick_interval
    }

    #[must_use]
    pub fn tick(&self) -> i32 {
        self.tick
    }
}

#[cfg(not(feature = "async"))]
pub trait Visitor {
    type Error: core::error::Error + Send + Sync + 'static;

    /// Decides whether the entity backed by the serializer identified by
    /// `serializer_name_hash` should be tracked. Returning `false` lets the parser
    /// skip-decode the entity's fields without materializing it, which is cheaper
    /// when a consumer only cares about a subset of entity types.
    ///
    /// The default tracks everything.
    #[allow(unused_variables)]
    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        true
    }

    /// Toggle whether visitor callbacks should record output.
    ///
    /// Used when fast-forwarding through the demo to build up parser state (serializers, entity
    /// classes, instance baselines) that must exist before a segment can be parsed, without
    /// emitting the rows from that warm-up region. The default is a no-op (always recording).
    #[allow(unused_variables)]
    fn set_collecting(&mut self, collecting: bool) {}

    // TODO: include updated fields (list of field paths?)
    #[allow(unused_variables)]
    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    #[allow(unused_variables)]
    fn on_cmd(
        &mut self,
        ctx: &Context,
        cmd_header: &CmdHeader,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    #[allow(unused_variables)]
    fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    #[allow(unused_variables)]
    fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        Ok(())
    }
}

/// Async variant of [`Visitor`], enabled by the `async` feature for use with
/// [`AsyncStreamingParser`]. The `on_*` callbacks return `Send + Sync` futures so the parser can be
/// driven from a spawned task.
#[cfg(feature = "async")]
pub trait Visitor {
    type Error: core::error::Error + Send + Sync + 'static;

    /// Decides whether the entity backed by the serializer identified by
    /// `serializer_name_hash` should be tracked. Returning `false` lets the parser
    /// skip-decode the entity's fields without materializing it, which is cheaper
    /// when a consumer only cares about a subset of entity types.
    ///
    /// The default tracks everything.
    #[allow(unused_variables)]
    fn should_track_entity(&self, serializer_name_hash: u64) -> bool {
        true
    }

    /// Toggle whether visitor callbacks should record output.
    ///
    /// Used when fast-forwarding through the demo to build up parser state (serializers, entity
    /// classes, instance baselines) that must exist before a segment can be parsed, without
    /// emitting the rows from that warm-up region. The default is a no-op (always recording).
    #[allow(unused_variables)]
    fn set_collecting(&mut self, collecting: bool) {}

    // TODO: include updated fields (list of field paths?)
    #[allow(unused_variables)]
    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }

    #[allow(unused_variables)]
    fn on_cmd(
        &mut self,
        ctx: &Context,
        cmd_header: &CmdHeader,
        data: &[u8],
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }

    #[allow(unused_variables)]
    fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }

    #[allow(unused_variables)]
    fn on_tick_end(
        &mut self,
        ctx: &Context,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        async { Ok(()) }
    }
}

/// `ControlFlow` indicates the desired behavior of the run loop.
#[cfg(not(feature = "async"))]
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
#[cfg(not(feature = "async"))]
pub struct Parser<D: DemoStream, V: Visitor> {
    demo_stream: D,
    buf: Vec<u8>,
    visitor: V,
    ctx: Context,
    // NOTE(blukai): is this the place for this? can it be moved "closer" to entities somewhere?
    field_decode_ctx: FieldDecodeContext,
    /// When set, `SvcPacketEntities` messages are not decoded. Used to fast-forward state without
    /// paying for entity decode in a warm-up region whose rows are discarded anyway.
    skip_entity_packets: bool,
}

#[cfg(not(feature = "async"))]
impl<D: DemoStream, V: Visitor> Parser<D, V> {
    pub fn from_stream_with_visitor(demo_stream: D, visitor: V) -> Result<Self, DemoHeaderError> {
        Ok(Self {
            demo_stream,
            buf: vec![0; DEMO_RECORD_BUFFER_SIZE],
            visitor,
            ctx: Context::new(),
            field_decode_ctx: FieldDecodeContext::default(),
            skip_entity_packets: false,
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
    fn dispatch(&mut self, cf: ControlFlow, cmd_header: &CmdHeader) -> anyhow::Result<()> {
        match cf {
            ControlFlow::Handle => {
                self.handle_cmd(cmd_header)?;
                if self.ctx.prev_tick != self.ctx.tick {
                    self.visitor.on_tick_end(&self.ctx)?;
                }
            }
            ControlFlow::Skip => self.demo_stream.skip_cmd(cmd_header)?,
            ControlFlow::Ignore => {}
        }
        Ok(())
    }

    fn run<F>(&mut self, mut handler: F) -> anyhow::Result<()>
    where
        F: FnMut(&mut Self, &CmdHeader) -> anyhow::Result<ControlFlow>,
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

    pub fn run_to_end(&mut self) -> anyhow::Result<()> {
        self.run(|_notnotself, _cmd_header| Ok(ControlFlow::Handle))
            
    }

    // important initialization messages:
    // 1. DemSignonPacket (SvcCreateStringTable)
    // 2. DemSendTables (flattened serializers; never update)
    // 3. DemClassInfo (never update)
    fn handle_cmd(&mut self, cmd_header: &CmdHeader) -> anyhow::Result<()> {
        // TODO: consider introducing CmdInstance thing that would allow to decode body once and
        // not read it, but skip, if unconsumed. note that to work temporary ownership of
        // demo_stream will need to be taken.
        let cmd_body = self.demo_stream.read_cmd(cmd_header)?;
        self.visitor.on_cmd(&self.ctx, cmd_header, cmd_body)?;

        match cmd_header.cmd {
            EDemoCommands::DemPacket | EDemoCommands::DemSignonPacket => {
                let cmd = D::decode_cmd_packet(cmd_body)?;
                self.handle_cmd_packet(cmd)?;
            }

            EDemoCommands::DemSendTables => {
                // NOTE: this check exists because seeking exists, there's no
                // need to re-parse flattened serializers
                if self.ctx.serializers.is_some() {
                    return Ok(());
                }

                let cmd = D::decode_cmd_send_tables(cmd_body)?;
                self.ctx.serializers = Some(FlattenedSerializerContainer::parse(cmd)?);
            }

            EDemoCommands::DemClassInfo => {
                // NOTE: this check exists because seeking exists, there's no
                // need to re-parse entity classes
                if self.ctx.entity_classes.is_some() {
                    return Ok(());
                }

                let cmd = D::decode_cmd_class_info(cmd_body)?;
                self.ctx.entity_classes = Some(EntityClasses::parse(&cmd));

                // NOTE: DemClassInfo message becomes available after
                // SvcCreateStringTable(which has instancebaselines). to know
                // how long vec that will contain instancebaseline values needs
                // to be (to allocate precicely how much we need) we need to
                // wait for DemClassInfos.
                if let Some(string_table) = self
                    .ctx
                    .string_tables
                    .find_table(INSTANCE_BASELINE_TABLE_NAME)
                {
                    // SAFETY: entity_classes value was assigned above ^.
                    let Some(entity_classes) = self.ctx.entity_classes.as_ref() else {
                        bail!("entity not found")
                    };
                    self.ctx
                        .instance_baseline
                        .update(string_table, entity_classes.classes)?;
                }
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

    fn handle_cmd_packet(&mut self, cmd: CDemoPacket) -> anyhow::Result<()> {
        let data = cmd.data.unwrap_or_default();
        let mut br = BitReader::new(&data);

        while br.num_bits_left() > 8 {
            let command = br.read_ubitvar()?;
            let size = br.read_uvarint32()? as usize;

            let buf = &mut self.buf[..size];
            br.read_bytes(buf)?;
            let buf: &_ = buf;

            self.visitor.on_packet(&self.ctx, command, buf)?;

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
                    let msg = CsvcMsgPacketEntities::decode(buf)?;
                    self.handle_svc_packet_entities(msg)?;
                }

                c if c == SvcMessages::SvcServerInfo as u32 => {
                    let msg = CsvcMsgServerInfo::decode(buf)?;
                    if let Some(tick_interval) = msg.tick_interval {
                        self.ctx.tick_interval = tick_interval;

                        let ratio = DEFAULT_TICK_INTERVAL / tick_interval;
                        self.ctx.full_packet_interval = DEFAULT_FULL_PACKET_INTERVAL * ratio as i32;

                        // NOTE(blukai): field decoder context needs tick interval to be able to
                        // decode simulation time floats.
                        self.field_decode_ctx.tick_interval = tick_interval;
                    }
                }

                _ => {
                    // ignore
                }
            }
        }

        br.is_overflowed()?;
        Ok(())
    }

    fn handle_svc_create_string_table(
        &mut self,
        msg: &CsvcMsgCreateStringTable,
    ) -> anyhow::Result<()> {
        let string_table = self.ctx.string_tables.create_string_table_mut(
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
            snap::raw::Decoder::new().decompress(sd, &mut self.buf)?;
            &self.buf[..decompress_len]
        } else {
            msg.string_data()
        };

        let mut br = BitReader::new(string_data);
        string_table.parse_update(&mut br, msg.num_entries())?;
        br.is_overflowed()?;

        if string_table.name().eq(INSTANCE_BASELINE_TABLE_NAME)
            && let Some(entity_classes) = self.ctx.entity_classes.as_ref()
        {
            self.ctx
                .instance_baseline
                .update(string_table, entity_classes.classes)?;
        }

        Ok(())
    }

    fn handle_svc_update_string_table(
        &mut self,
        msg: &CsvcMsgUpdateStringTable,
    ) -> anyhow::Result<()> {
        debug_assert!(msg.table_id.is_some(), "invalid table id");
        let table_id = msg.table_id() as usize;

        debug_assert!(
            self.ctx.string_tables.has_table(table_id),
            "trying to update non-existent table"
        );
        let Some(string_table) = self.ctx.string_tables.get_table_mut(table_id) else {
            bail!("string table not found")
        };

        let mut br = BitReader::new(msg.string_data());
        string_table.parse_update(&mut br, msg.num_changed_entries())?;
        br.is_overflowed()?;

        if string_table.name().eq(INSTANCE_BASELINE_TABLE_NAME)
            && let Some(entity_classes) = self.ctx.entity_classes.as_ref()
        {
            self.ctx
                .instance_baseline
                .update(string_table, entity_classes.classes)?;
        }

        Ok(())
    }

    // NOTE: handle_msg_packet_entities is partially based on
    // ReadPacketEntities in engine/client.cpp
    fn handle_svc_packet_entities(
        &mut self,
        msg: CsvcMsgPacketEntities,
    ) -> anyhow::Result<()> {
        let Some(entity_classes) = self.ctx.entity_classes.as_ref() else {
            bail!("entity classes are not available");
        };
        let Some(serializers) = self.ctx.serializers.as_ref() else {
            bail!("serializers are not available");
        };
        let instance_baseline = &self.ctx.instance_baseline;

        let entity_data = msg.entity_data();
        let mut br = BitReader::new(entity_data);

        let mut entity_index: i32 = -1;
        for _ in (0..msg.updated_entries()).rev() {
            entity_index += br.read_ubitvar()? as i32 + 1;

            let delta_header = DeltaHeader::from_bit_reader(&mut br)?;
            match delta_header {
                DeltaHeader::CREATE => {
                    let maybe_index = self.ctx.entities.handle_create_with_filter(
                        entity_index,
                        &mut self.field_decode_ctx,
                        &mut br,
                        entity_classes,
                        instance_baseline,
                        serializers,
                        |hash| self.visitor.should_track_entity(hash),
                    )?;
                    if let Some(index) = maybe_index {
                        let Some(entity) = self.ctx.entities.get(&index) else {
                            bail!("entity not found")
                        };
                        self.visitor
                            .on_entity(&self.ctx, delta_header, entity)
                            ?;
                    }
                }
                DeltaHeader::DELETE => {
                    let entity = self.ctx.entities.handle_delete(entity_index);
                    if let Some(entity) = entity {
                        self.visitor
                            .on_entity(&self.ctx, delta_header, &entity)
                            ?;
                    }
                }
                DeltaHeader::LEAVE => {
                    let entity = self.ctx.entities.handle_leave(entity_index);
                    if let Some(entity) = entity {
                        self.visitor
                            .on_entity(&self.ctx, delta_header, &entity)
                            ?;
                    }
                }
                DeltaHeader::UPDATE => {
                    self.ctx.entities.handle_update(
                        entity_index,
                        &mut self.field_decode_ctx,
                        &mut br,
                    )?;
                    let Some(entity) = self.ctx.entities.get(&entity_index) else {
                        continue;
                    };
                    self.visitor
                        .on_entity(&self.ctx, delta_header, entity)
                        ?;
                }
                _ => {}
            }
        }

        br.is_overflowed()?;
        Ok(())
    }

    fn handle_cmd_string_tables(&mut self, cmd: &CDemoStringTables) -> anyhow::Result<()> {
        self.ctx.string_tables.do_full_update(cmd);

        let Some(entity_classes) = self.ctx.entity_classes.as_ref() else {
            bail!("entity classes are not available")
        };
        if let Some(string_table) = self
            .ctx
            .string_tables
            .find_table(INSTANCE_BASELINE_TABLE_NAME)
        {
            self.ctx
                .instance_baseline
                .update(string_table, entity_classes.classes)?;
        }

        Ok(())
    }

    fn handle_cmd_full_packet(&mut self, cmd: CDemoFullPacket) -> anyhow::Result<()> {
        if let Some(string_table) = cmd.string_table.as_ref() {
            self.handle_cmd_string_tables(string_table)?;
        }

        if let Some(packet) = cmd.packet {
            self.handle_cmd_packet(packet)?;
        }

        Ok(())
    }

    // public api
    // ----

    pub fn demo_stream(&self) -> &D {
        &self.demo_stream
    }

    pub fn demo_stream_mut(&mut self) -> &mut D {
        &mut self.demo_stream
    }

    pub fn context(&self) -> &Context {
        &self.ctx
    }

    pub fn into_visitor(self) -> V {
        self.visitor
    }

    pub fn visitor_mut(&mut self) -> &mut V {
        &mut self.visitor
    }
}

#[cfg(not(feature = "async"))]
impl<D: SeekableDemoStream, V: Visitor> Parser<D, V> {
    /// like [`run`](Parser::run) but the handler can return `None` to break out of the loop,
    /// unreading the current cmd header and restoring the previous tick.
    fn run_seekable<F>(&mut self, mut handler: F) -> anyhow::Result<()>
    where
        F: FnMut(&mut Self, &CmdHeader) -> anyhow::Result<Option<ControlFlow>>,
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

        self.ctx.entities.clear();
        self.ctx.string_tables.clear();
        self.ctx.instance_baseline.clear();
        self.ctx.tick = -1;
        self.ctx.prev_tick = -1;

        Ok(())
    }

    pub fn run_to_tick(&mut self, target_tick: i32) -> anyhow::Result<()> {
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

        self.run_seekable(
            |notnotself: &mut Parser<D, V>, cmd_header: &CmdHeader| {
                if cmd_header.tick > target_tick {
                    return Ok(None);
                }

                // init string tables, flattened serializers and entity classes
                if !did_handle_first_sync_tick {
                    did_handle_first_sync_tick = cmd_header.cmd == EDemoCommands::DemSyncTick;
                    return Ok(Some(ControlFlow::Handle));
                }

                let is_full_packet = cmd_header.cmd == EDemoCommands::DemFullPacket;
                let distance_to_target_tick = target_tick - notnotself.ctx.tick;
                // TODO: what if there's no full packet ahead? maybe dem file is
                // corrupted or something... scan for full packets before enterint
                // the "run"?
                let has_full_packet_ahead =
                    distance_to_target_tick > notnotself.ctx.full_packet_interval + 100;
                if is_full_packet {
                    let cmd_body = notnotself.demo_stream.read_cmd(cmd_header)?;
                    notnotself
                        .visitor
                        .on_cmd(&notnotself.ctx, cmd_header, cmd_body)
                        ?;

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
                    notnotself.visitor.on_tick_end(&notnotself.ctx)?;

                    did_handle_last_full_packet = !has_full_packet_ahead;

                    return Ok(Some(ControlFlow::Ignore));
                }

                if did_handle_last_full_packet {
                    Ok(Some(ControlFlow::Handle))
                } else {
                    Ok(Some(ControlFlow::Skip))
                }
            },
        )
        
    }

    /// Header-only scan of the whole demo, returning the tick of every
    /// [`EDemoCommands::DemFullPacket`] in file order.
    ///
    /// Bodies are skipped (no decompression / decoding), so this is cheap. The stream is left
    /// rewound to its start position. Full packets are complete state snapshots, so their offsets
    /// are valid points at which to begin an independent parse — this is the basis for splitting a
    /// demo into segments that can be parsed in parallel.
    pub fn scan_full_packet_ticks(&mut self) -> anyhow::Result<Vec<i32>> {
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

    /// Parse the segment owned by a single full packet: the commands from full packet `ordinal`
    /// (a complete state snapshot) up to — but not including — the next full packet, or EOF for the
    /// last one. `ordinal` indexes the list returned by
    /// [`scan_full_packet_ticks`](Self::scan_full_packet_ticks).
    ///
    /// Full packet 0 additionally covers the pre-first-full-packet signon region. For later
    /// ordinals the parser fast-forwards through the file handling only the init/signon commands —
    /// skipping entity decode — to populate serializers, entity classes and instance baselines,
    /// then applies the full packet (which re-creates all live entities and refreshes the string
    /// tables / baselines) before collecting forward. Because every command belongs to exactly one
    /// full packet's segment and boundaries fall on the full-packet command itself, concatenating
    /// the per-ordinal outputs in order reproduces a single end-to-end parse exactly.
    pub fn run_full_packet(&mut self, ordinal: usize) -> anyhow::Result<()> {
        self.reset()?;

        let mut fp_seen: usize = 0;
        let mut collecting = ordinal == 0;

        // For a later segment, build parser state but suppress output until our full packet. The
        // signon commands are handled (not skipped) so serializers, entity classes and instance
        // baselines are populated; entity decode is skipped (the rows are discarded anyway and the
        // full packet restates all entity state from scratch, with its own string-table snapshot
        // refreshing the baselines its creates depend on).
        if !collecting {
            self.visitor.set_collecting(false);
            self.skip_entity_packets = true;
        }

        let result = self.run_seekable(
            |s: &mut Parser<D, V>, cmd_header: &CmdHeader| {
                if cmd_header.cmd == EDemoCommands::DemFullPacket {
                    let this_ordinal = fp_seen;
                    fp_seen += 1;
                    if this_ordinal < ordinal {
                        // A full packet before ours: skip its snapshot, ours supersedes it.
                        return Ok(Some(ControlFlow::Skip));
                    }
                    if this_ordinal == ordinal {
                        // Our full packet: start collecting and apply it.
                        collecting = true;
                        s.visitor.set_collecting(true);
                        s.skip_entity_packets = false;
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
                match cmd_header.cmd {
                    EDemoCommands::DemSendTables
                    | EDemoCommands::DemClassInfo
                    | EDemoCommands::DemSignonPacket => Ok(Some(ControlFlow::Handle)),
                    _ => Ok(Some(ControlFlow::Skip)),
                }
            },
        );

        self.skip_entity_packets = false;
        result
    }
}

#[cfg(feature = "async")]
use crate::async_demostream::AsyncDemoStream;

#[cfg(feature = "async")]
pub struct AsyncStreamingParser<D: AsyncDemoStream, V: Visitor> {
    demo_stream: D,
    buf: Vec<u8>,
    visitor: V,
    ctx: Context,
    field_decode_ctx: FieldDecodeContext,
}

#[cfg(feature = "async")]
impl<D: AsyncDemoStream, V: Visitor> AsyncStreamingParser<D, V> {
    pub fn from_stream_with_visitor(demo_stream: D, visitor: V) -> Result<Self, DemoHeaderError> {
        Ok(Self {
            demo_stream,
            buf: vec![0; DEMO_RECORD_BUFFER_SIZE],
            visitor,
            ctx: Context::new(),
            field_decode_ctx: FieldDecodeContext::default(),
        })
    }

    pub fn into_visitor(self) -> V {
        self.visitor
    }

    pub fn visitor_mut(&mut self) -> &mut V {
        &mut self.visitor
    }

    pub async fn run_to_end(&mut self) -> anyhow::Result<()> {
        self.run_internal(false).await
    }

    pub async fn run_to_end_final_state(&mut self) -> anyhow::Result<()> {
        self.run_internal(true).await
    }

    async fn run_internal(&mut self, reset_on_full_packet: bool) -> anyhow::Result<()> {
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
                        self.visitor.on_tick_end(&self.ctx).await?;
                        // tokio::task::yield_now(); // TEMP
                    }
                }
                Err(err) => {
                    if matches!(
                        err,
                        crate::demostream::ReadCmdHeaderError::IoError(ref e)
                            if e.kind() == io::ErrorKind::UnexpectedEof
                    ) {
                        return Ok(());
                    }
                    return Err(err.into());
                }
            }
        }
    }

    async fn handle_cmd(&mut self, cmd_header: &CmdHeader) -> anyhow::Result<()> {
        let cmd_body = self.demo_stream.read_cmd(cmd_header).await?;
        self.visitor.on_cmd(&self.ctx, cmd_header, cmd_body).await?;

        match cmd_header.cmd {
            EDemoCommands::DemPacket | EDemoCommands::DemSignonPacket => {
                let cmd = D::decode_cmd_packet(cmd_body)?;
                self.handle_cmd_packet(cmd).await?;
            }

            EDemoCommands::DemSendTables => {
                if self.ctx.serializers.is_some() {
                    return Ok(());
                }

                let cmd = D::decode_cmd_send_tables(cmd_body)?;
                self.ctx.serializers = Some(FlattenedSerializerContainer::parse(cmd)?);
            }

            EDemoCommands::DemClassInfo => {
                if self.ctx.entity_classes.is_some() {
                    return Ok(());
                }

                let cmd = D::decode_cmd_class_info(cmd_body)?;
                self.ctx.entity_classes = Some(EntityClasses::parse(&cmd));

                if let Some(string_table) = self
                    .ctx
                    .string_tables
                    .find_table(INSTANCE_BASELINE_TABLE_NAME)
                {
                    let Some(entity_classes) = self.ctx.entity_classes.as_ref() else {
                        bail!("entity not found")
                    };
                    self.ctx
                        .instance_baseline
                        .update(string_table, entity_classes.classes)?;
                }
            }

            EDemoCommands::DemFullPacket => {
                let cmd = D::decode_cmd_full_packet(cmd_body)?;
                self.handle_cmd_full_packet(cmd).await?;
            }

            _ => {}
        }

        Ok(())
    }

    async fn handle_cmd_packet(&mut self, cmd: CDemoPacket) -> anyhow::Result<()> {
        let data = cmd.data.unwrap_or_default();
        let mut br = BitReader::new(&data);

        while br.num_bits_left() > 8 {
            let command = br.read_ubitvar()?;
            let size = br.read_uvarint32()? as usize;

            let buf = &mut self.buf[..size];
            br.read_bytes(buf)?;
            let buf: &_ = buf;

            self.visitor.on_packet(&self.ctx, command, buf).await?;

            match command {
                c if c == SvcMessages::SvcCreateStringTable as u32 => {
                    let msg = CsvcMsgCreateStringTable::decode(buf)?;
                    self.handle_svc_create_string_table(&msg)?;
                }

                c if c == SvcMessages::SvcUpdateStringTable as u32 => {
                    let msg = CsvcMsgUpdateStringTable::decode(buf)?;
                    self.handle_svc_update_string_table(&msg)?;
                }

                c if c == SvcMessages::SvcPacketEntities as u32 => {
                    let msg = CsvcMsgPacketEntities::decode(buf)?;
                    self.handle_svc_packet_entities(msg).await?;
                }

                c if c == SvcMessages::SvcServerInfo as u32 => {
                    let msg = CsvcMsgServerInfo::decode(buf)?;
                    if let Some(tick_interval) = msg.tick_interval {
                        self.ctx.tick_interval = tick_interval;

                        let ratio = DEFAULT_TICK_INTERVAL / tick_interval;
                        self.ctx.full_packet_interval = DEFAULT_FULL_PACKET_INTERVAL * ratio as i32;

                        self.field_decode_ctx.tick_interval = tick_interval;
                    }
                }

                _ => {}
            }
        }

        br.is_overflowed()?;
        Ok(())
    }

    fn handle_svc_create_string_table(
        &mut self,
        msg: &CsvcMsgCreateStringTable,
    ) -> anyhow::Result<()> {
        let string_table = self.ctx.string_tables.create_string_table_mut(
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
            snap::raw::Decoder::new().decompress(sd, &mut self.buf)?;
            &self.buf[..decompress_len]
        } else {
            msg.string_data()
        };

        let mut br = BitReader::new(string_data);
        string_table.parse_update(&mut br, msg.num_entries())?;
        br.is_overflowed()?;

        if string_table.name().eq(INSTANCE_BASELINE_TABLE_NAME)
            && let Some(entity_classes) = self.ctx.entity_classes.as_ref()
        {
            self.ctx
                .instance_baseline
                .update(string_table, entity_classes.classes)?;
        }

        Ok(())
    }

    fn handle_svc_update_string_table(
        &mut self,
        msg: &CsvcMsgUpdateStringTable,
    ) -> anyhow::Result<()> {
        debug_assert!(msg.table_id.is_some(), "invalid table id");
        let table_id = msg.table_id() as usize;

        debug_assert!(
            self.ctx.string_tables.has_table(table_id),
            "trying to update non-existent table"
        );
        let Some(string_table) = self.ctx.string_tables.get_table_mut(table_id) else {
            bail!("string table not found")
        };

        let mut br = BitReader::new(msg.string_data());
        string_table.parse_update(&mut br, msg.num_changed_entries())?;
        br.is_overflowed()?;

        if string_table.name().eq(INSTANCE_BASELINE_TABLE_NAME)
            && let Some(entity_classes) = self.ctx.entity_classes.as_ref()
        {
            self.ctx
                .instance_baseline
                .update(string_table, entity_classes.classes)?;
        }

        Ok(())
    }

    async fn handle_svc_packet_entities(
        &mut self,
        msg: CsvcMsgPacketEntities,
    ) -> anyhow::Result<()> {
        let Some(entity_classes) = self.ctx.entity_classes.as_ref() else {
            bail!("entity classes are not available");
        };
        let Some(serializers) = self.ctx.serializers.as_ref() else {
            bail!("serializers are not available");
        };
        let instance_baseline = &self.ctx.instance_baseline;

        let entity_data = msg.entity_data();
        let mut br = BitReader::new(entity_data);

        let mut entity_index: i32 = -1;
        for _ in (0..msg.updated_entries()).rev() {
            entity_index += br.read_ubitvar()? as i32 + 1;

            let delta_header = DeltaHeader::from_bit_reader(&mut br)?;
            match delta_header {
                DeltaHeader::CREATE => {
                    let maybe_index = self.ctx.entities.handle_create_with_filter(
                        entity_index,
                        &mut self.field_decode_ctx,
                        &mut br,
                        entity_classes,
                        instance_baseline,
                        serializers,
                        |hash| self.visitor.should_track_entity(hash),
                    )?;
                    if let Some(index) = maybe_index {
                        let Some(entity) = self.ctx.entities.get(&index) else {
                            bail!("entity not found")
                        };
                        self.visitor
                            .on_entity(&self.ctx, delta_header, entity)
                            .await?;
                    }
                }
                DeltaHeader::DELETE => {
                    let entity = self.ctx.entities.handle_delete(entity_index);
                    if let Some(entity) = entity {
                        self.visitor
                            .on_entity(&self.ctx, delta_header, &entity)
                            .await?;
                    }
                }
                DeltaHeader::LEAVE => {
                    let entity = self.ctx.entities.handle_leave(entity_index);
                    if let Some(entity) = entity {
                        self.visitor
                            .on_entity(&self.ctx, delta_header, &entity)
                            .await?;
                    }
                }
                DeltaHeader::UPDATE => {
                    self.ctx.entities.handle_update(
                        entity_index,
                        &mut self.field_decode_ctx,
                        &mut br,
                    )?;
                    let Some(entity) = self.ctx.entities.get(&entity_index) else {
                        continue;
                    };
                    self.visitor
                        .on_entity(&self.ctx, delta_header, entity)
                        .await?;
                }
                _ => {}
            }
        }

        br.is_overflowed()?;
        Ok(())
    }

    fn handle_cmd_string_tables(&mut self, cmd: &CDemoStringTables) -> anyhow::Result<()> {
        self.ctx.string_tables.do_full_update(cmd);

        let Some(entity_classes) = self.ctx.entity_classes.as_ref() else {
            bail!("entity classes are not available")
        };
        if let Some(string_table) = self
            .ctx
            .string_tables
            .find_table(INSTANCE_BASELINE_TABLE_NAME)
        {
            self.ctx
                .instance_baseline
                .update(string_table, entity_classes.classes)?;
        }

        Ok(())
    }

    async fn handle_cmd_full_packet(&mut self, cmd: CDemoFullPacket) -> anyhow::Result<()> {
        if let Some(string_table) = cmd.string_table.as_ref() {
            self.handle_cmd_string_tables(string_table)?;
        }

        if let Some(packet) = cmd.packet {
            self.handle_cmd_packet(packet).await?;
        }

        Ok(())
    }

    pub fn demo_stream(&self) -> &D {
        &self.demo_stream
    }

    pub fn demo_stream_mut(&mut self) -> &mut D {
        &mut self.demo_stream
    }

    pub fn context(&self) -> &Context {
        &self.ctx
    }
}
