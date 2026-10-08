use core::future::{Future, ready};
use core::ops::Range;
use std::collections::HashSet;

use axum::response::sse::Event;
use haste::demostream::CmdHeader;
use haste::entities::{DeltaHeader, Entity};
use haste::parser::{AsyncVisitor, Context};
use haste::stringtables::StringTableItem;
use prost::Message;
use tokio::sync::mpsc::UnboundedSender;
use tracing::debug;
use valveprotos::common::{CMsgPlayerInfo, EDemoCommands};
use valveprotos::deadlock::{
    CCitadelUserMsgBannedHeroes, CCitadelUserMsgChatMsg, CCitadelUserMsgCombatLogBulkData,
    CCitadelUserMsgHeroKilled, CCitadelUserMsgHeroReleaseVote, CCitadelUserMsgHudGameAnnouncement,
    CCitadelUserMsgMusicQueue, CCitadelUserMsgPlayerTyping, CCitadelUserMsgSoulBagPickup,
    CMsgCitadelCombatLogEntry, CitadelMusicMsgType, CitadelUserMessageIds,
};

use crate::demo_parser::broker::BrokerStock;
use crate::demo_parser::entity_events::{
    EntityType, EntityUpdateEvent, EntityUpdateEvents, GameRulesProxyEvent,
    banned_heroes_from_game_rules, corrupted_item,
};
use crate::demo_parser::error::DemoParseError;
#[allow(
    clippy::wildcard_imports,
    reason = "`expect` on a `use` item is not fulfilled"
)]
use crate::demo_parser::hashes::*;
use crate::demo_parser::types::{Delta, DemoEvent, DemoEventPayload};
use crate::demo_parser::utils::{get_entity_handle_index, handle_to_entity_index};
use crate::utils::steamid64_to_steamid3;

pub(crate) struct SendingVisitor {
    sender: UnboundedSender<Event>,
    subscribed_chat_messages: bool,
    subscribed_entities: Option<HashSet<EntityType>>,
    game_time: f32,
    tick_interval: f32,
    rules: GameRulesProxyEvent,
    /// Last emitted bans, to emit `banned_heroes` once per distinct set of bans.
    banned_heroes: Option<Vec<u32>>,
    broker: BrokerStock,
    /// Item entities already reported as corrupted.
    corrupted_items: HashSet<i32>,
}

impl SendingVisitor {
    pub(crate) fn new(
        sender: UnboundedSender<Event>,
        subscribed_chat_messages: bool,
        subscribed_entities: Option<impl IntoIterator<Item = EntityType>>,
    ) -> Self {
        Self {
            sender,
            subscribed_chat_messages,
            subscribed_entities: subscribed_entities.map(|iter| iter.into_iter().collect()),
            game_time: 0.0,
            tick_interval: 1.0 / 60.0,
            rules: GameRulesProxyEvent::default(),
            banned_heroes: None,
            broker: BrokerStock::default(),
            corrupted_items: HashSet::new(),
        }
    }
}

impl AsyncVisitor for SendingVisitor {
    type Error = DemoParseError;

    fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        ready(self.handle_entity(ctx, delta_header, entity))
    }

    fn on_cmd(
        &mut self,
        ctx: &Context,
        cmd_header: &CmdHeader,
        _data: &[u8],
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        self.handle_cmd(ctx, cmd_header);
        ready(Ok(()))
    }

    fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        ready(self.handle_packet(ctx, packet_type, data))
    }

    fn on_tick_end(
        &mut self,
        ctx: &Context,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + Sync {
        ready(self.handle_tick_end(ctx))
    }
}

impl SendingVisitor {
    fn handle_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), DemoParseError> {
        self.handle_corrupted_item(ctx, delta_header.into(), entity)?;

        let Some(entity_type) = EntityType::from_opt(entity) else {
            return Ok(());
        };

        if entity_type == EntityType::GameRulesProxy
            && let Some(rules) =
                GameRulesProxyEvent::from_entity_update(ctx, delta_header.into(), entity)
        {
            debug!("Updating game rules");
            self.rules = rules;
            self.handle_game_rules(ctx, entity)?;
        }

        if self
            .subscribed_entities
            .as_ref()
            .is_some_and(|e| !e.contains(&entity_type))
        {
            return Ok(());
        }

        let Some(entity_update) =
            EntityUpdateEvents::from_update(ctx, delta_header.into(), entity_type, entity)
        else {
            return Ok(());
        };

        let demo_event = DemoEvent {
            tick: ctx.tick(),
            game_time: self.game_time,
            event: DemoEventPayload::EntityUpdate {
                delta: delta_header.into(),
                entity_index: entity.index(),
                entity_type,
                entity_update,
            },
        };
        let sse_event = demo_event.try_into()?;
        self.sender.send(sse_event)?;
        Ok(())
    }

    /// Bans and Broker stock from the game rules (build 6711+).
    fn handle_game_rules(&mut self, ctx: &Context, entity: &Entity) -> Result<(), DemoParseError> {
        if let Some(banned_hero_ids) = banned_heroes_from_game_rules(entity)
            && !banned_hero_ids.is_empty()
        {
            self.emit_banned_heroes(ctx, banned_hero_ids)?;
        }
        if let Some(limit) = self.rules.num_corrupted_items_limit {
            let levels = self.broker.on_limit(ctx.tick(), limit);
            self.emit_broker_stock(ctx, levels)?;
        }
        Ok(())
    }

    fn emit_banned_heroes(
        &mut self,
        ctx: &Context,
        banned_hero_ids: Vec<u32>,
    ) -> Result<(), DemoParseError> {
        if self.banned_heroes.as_ref() == Some(&banned_hero_ids) {
            return Ok(());
        }
        self.banned_heroes = Some(banned_hero_ids.clone());
        self.send(ctx, DemoEventPayload::BannedHeroes { banned_hero_ids })
    }

    /// Emits `corrupted_item_shop_spawn` (level 1) / `corrupted_item_shop_restock` (above 1) for
    /// each new Broker stock level.
    fn emit_broker_stock(&self, ctx: &Context, levels: Range<i32>) -> Result<(), DemoParseError> {
        for corrupted_items_limit in levels {
            let event = if corrupted_items_limit == 1 {
                DemoEventPayload::CorruptedItemShopSpawn {
                    corrupted_items_limit,
                }
            } else {
                DemoEventPayload::CorruptedItemShopRestock {
                    corrupted_items_limit,
                }
            };
            self.send(ctx, event)?;
        }
        Ok(())
    }

    /// Emits `corrupted_item` the first time an item entity is seen with the corrupted bit set.
    fn handle_corrupted_item(
        &mut self,
        ctx: &Context,
        delta: Delta,
        entity: &Entity,
    ) -> Result<(), DemoParseError> {
        let entity_index = entity.index();
        if delta == Delta::Delete {
            self.corrupted_items.remove(&entity_index);
            return Ok(());
        }
        if self.corrupted_items.contains(&entity_index) {
            return Ok(());
        }
        let Some((item_id, upgrade_info)) = corrupted_item(entity) else {
            return Ok(());
        };
        self.corrupted_items.insert(entity_index);
        self.send(
            ctx,
            DemoEventPayload::CorruptedItem {
                entity_index,
                owner_entity: get_entity_handle_index(entity, OWNER_ENTITY_HASH),
                team: entity.get_value(&TEAM_HASH),
                item_id,
                upgrade_info,
            },
        )
    }

    fn send(&self, ctx: &Context, event: DemoEventPayload) -> Result<(), DemoParseError> {
        let demo_event = DemoEvent {
            tick: ctx.tick(),
            game_time: self.game_time,
            event,
        };
        self.sender.send(demo_event.try_into()?)?;
        Ok(())
    }

    fn handle_cmd(&mut self, ctx: &Context, cmd_header: &CmdHeader) {
        if cmd_header.cmd == EDemoCommands::DemSyncTick {
            debug!("Updating tick interval");
            self.tick_interval = ctx.tick_interval();
        }
    }

    fn handle_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), DemoParseError> {
        if self.subscribed_chat_messages
            && packet_type == CitadelUserMessageIds::KEUserMsgChatMsg as u32
            && let Ok(msg) = CCitadelUserMsgChatMsg::decode(data)
            && let Some(tables) = ctx.string_tables()
            && let Some(table) = tables.find_table("userinfo")
            && let Some(player_slot) = msg.player_slot
        {
            let user_info = table.get_item(&player_slot);
            let user_data = user_info.and_then(StringTableItem::get_user_data);
            let user_info = user_data.and_then(|d| CMsgPlayerInfo::decode(d).ok());
            let demo_event = DemoEvent {
                tick: ctx.tick(),
                game_time: self.game_time,
                event: DemoEventPayload::ChatMessage {
                    steam_name: user_info.as_ref().and_then(|u| u.name.clone()),
                    steam_id: user_info
                        .and_then(|u| u.steamid)
                        .and_then(|s| steamid64_to_steamid3(s).ok()),
                    text: msg.text,
                    all_chat: msg.all_chat,
                    lane_color: msg.lane_color,
                },
            };
            let sse_event = demo_event.try_into()?;
            self.sender.send(sse_event)?;
        }

        if packet_type == CitadelUserMessageIds::KEUserMsgHeroKilled as u32
            && let Ok(msg) = CCitadelUserMsgHeroKilled::decode(data)
        {
            let demo_event = DemoEvent {
                tick: ctx.tick(),
                game_time: self.game_time,
                event: DemoEventPayload::HeroKilled(msg),
            };
            let sse_event = demo_event.try_into()?;
            self.sender.send(sse_event)?;
        }

        // Builds before 6711 send the bans in this message; newer ones in the game rules.
        if packet_type == CitadelUserMessageIds::KEUserMsgBannedHeroes as u32
            && let Ok(msg) = CCitadelUserMsgBannedHeroes::decode(data)
        {
            self.emit_banned_heroes(ctx, msg.banned_hero_ids)?;
        }

        if packet_type == CitadelUserMessageIds::KEUserMsgHudGameAnnouncement as u32
            && let Ok(msg) = CCitadelUserMsgHudGameAnnouncement::decode(data)
        {
            let title = msg.title_locstring.as_deref().unwrap_or_default();
            let levels = self.broker.on_announcement(ctx.tick(), title);
            self.emit_broker_stock(ctx, levels)?;
        }

        if let Some(event) = self.decode_user_message(packet_type, data) {
            let demo_event = DemoEvent {
                tick: ctx.tick(),
                game_time: self.game_time,
                event,
            };
            self.sender.send(demo_event.try_into()?)?;
        }

        Ok(())
    }

    /// Decodes the user messages that map one to one onto a [`DemoEventPayload`].
    fn decode_user_message(&self, packet_type: u32, data: &[u8]) -> Option<DemoEventPayload> {
        let msg_id = CitadelUserMessageIds::try_from(i32::try_from(packet_type).ok()?).ok()?;
        match msg_id {
            CitadelUserMessageIds::KEUserMsgSoulBagPickup => {
                let msg = CCitadelUserMsgSoulBagPickup::decode(data).ok()?;
                Some(DemoEventPayload::SoulBagPickup {
                    pickup_player: handle_to_entity_index(msg.pickup_player),
                    victim_player: handle_to_entity_index(msg.victim_player),
                    killfeed_gold: msg.killfeed_gold,
                })
            }
            CitadelUserMessageIds::KEUserMsgHeroReleaseVote => {
                CCitadelUserMsgHeroReleaseVote::decode(data)
                    .ok()
                    .map(DemoEventPayload::HeroReleaseVote)
            }
            CitadelUserMessageIds::KEUserMsgCombatLogEntry => {
                CMsgCitadelCombatLogEntry::decode(data)
                    .ok()
                    .map(|msg| DemoEventPayload::CombatLogEntry(Box::new(msg)))
            }
            CitadelUserMessageIds::KEUserMsgCombatLogBulkData => {
                CCitadelUserMsgCombatLogBulkData::decode(data)
                    .ok()
                    .map(DemoEventPayload::CombatLogBulkData)
            }
            // Typing indicators belong to the chat, so they share its subscription.
            CitadelUserMessageIds::KEUserMsgPlayerTyping if self.subscribed_chat_messages => {
                let msg = CCitadelUserMsgPlayerTyping::decode(data).ok()?;
                Some(DemoEventPayload::PlayerTyping {
                    player_slot: msg.player_slot,
                    server_game_time: msg.game_time,
                    all_chat: msg.all_chat,
                    typing: msg.typing,
                })
            }
            CitadelUserMessageIds::KEUserMsgMusicQueue => {
                let msg = CCitadelUserMsgMusicQueue::decode(data).ok()?;
                Some(DemoEventPayload::MusicQueue {
                    queue: msg.queue,
                    queue_name: msg
                        .queue
                        .and_then(|q| CitadelMusicMsgType::try_from(q).ok())
                        .map(music_queue_name),
                })
            }
            _ => None,
        }
    }

    fn handle_tick_end(&mut self, ctx: &Context) -> Result<(), DemoParseError> {
        // The tick rate comes from `CSVCMsg_ServerInfo` (1/64 in build 6712 replays, not the
        // 1/60 default). Don't rely on seeing a `DemSyncTick` to pick it up: broadcast streams
        // joined mid-match may not carry one.
        if ctx.tick_interval() > 0.0 {
            self.tick_interval = ctx.tick_interval();
        }

        #[expect(clippy::cast_precision_loss)]
        {
            let ticks = ctx.tick() - self.rules.total_paused_ticks.unwrap_or_default();
            let total_time = ticks as f32 * self.tick_interval;
            self.game_time = total_time - self.rules.game_start_time.unwrap_or_default();
        }

        let demo_event = DemoEvent {
            tick: ctx.tick(),
            game_time: self.game_time,
            event: DemoEventPayload::TickEnd,
        };
        self.sender.send(demo_event.try_into()?)?;
        Ok(())
    }
}

fn music_queue_name(queue: CitadelMusicMsgType) -> &'static str {
    match queue {
        CitadelMusicMsgType::KEMusicQueueInvalid => "invalid",
        CitadelMusicMsgType::KEMusicQueueIdolAnnounce => "idol_announce",
        CitadelMusicMsgType::KEMusicQueueKothAnnounce => "koth_announce",
        CitadelMusicMsgType::KEMusicQueueRejuvDrop => "rejuv_drop",
        CitadelMusicMsgType::KEMusicQueueCorruptedItemShopAnnounce => {
            "corrupted_item_shop_announce"
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use haste::async_demofile::AsyncDemoFile;
    use haste::parser::AsyncStreamingParser;

    use super::*;

    /// Runs the visitor over a local replay and prints how often each SSE event fired, plus a
    /// sample payload of the non-entity events.
    ///
    /// `LIVE_EVENTS_TEST_DEMO=/path/to/match.dem cargo test -p deadlock-live-events -- --ignored`
    #[tokio::test]
    #[ignore = "needs a replay file in LIVE_EVENTS_TEST_DEMO"]
    async fn test_demo_events() {
        let path = std::env::var("LIVE_EVENTS_TEST_DEMO").expect("LIVE_EVENTS_TEST_DEMO not set");
        let data = std::fs::read(path).expect("failed to read replay");

        let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
        let visitor = SendingVisitor::new(sender, true, None::<Vec<EntityType>>);
        let demo_file = AsyncDemoFile::start_reading(data.as_slice()).await.unwrap();
        let mut parser =
            AsyncStreamingParser::from_stream_with_visitor(demo_file, visitor).unwrap();
        parser.run_to_end().await.unwrap();
        drop(parser);

        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut samples: BTreeMap<String, String> = BTreeMap::new();
        while let Some(event) = receiver.recv().await {
            // NOTE: axum's Event has no accessors; its debug output contains the raw
            // `event: <name>\ndata: <json>` buffer.
            let debug = format!("{event:?}");
            let name = debug
                .split("event: ")
                .nth(1)
                .and_then(|rest| rest.split("\\n").next())
                .unwrap_or("?")
                .to_owned();
            // Rare match milestones are printed in full.
            if name == "banned_heroes" || name.starts_with("corrupted_item") {
                println!("{debug}");
            } else if !name.contains("_entity_") && name != "tick_end" {
                samples.entry(name.clone()).or_insert(debug);
            }
            *counts.entry(name).or_default() += 1;
        }
        for (name, count) in &counts {
            println!("{name}: {count}");
        }
        for sample in samples.values() {
            println!("{sample}");
        }
        assert!(counts.contains_key("player_pawn_entity_update"));
    }
}
