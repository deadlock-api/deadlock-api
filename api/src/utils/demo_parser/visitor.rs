use std::collections::HashSet;

use axum::response::sse::Event;
use haste::demostream::CmdHeader;
use haste::entities::{DeltaHeader, Entity};
use haste::parser::{Context, Visitor};
use haste::stringtables::StringTableItem;
use prost::Message;
use tokio::sync::mpsc::UnboundedSender;
use tracing::debug;
use valveprotos::common::{CMsgPlayerInfo, EDemoCommands};
use valveprotos::deadlock::{CCitadelUserMsgChatMsg, CitadelUserMessageIds};

use crate::utils::demo_parser::entity_events::{
    EntityType, EntityUpdateEvent, EntityUpdateEvents, GameRulesProxyEvent,
};
use crate::utils::demo_parser::error::DemoParseError;
use crate::utils::demo_parser::types::{DemoEvent, DemoEventPayload};
use crate::utils::parse::steamid64_to_steamid3;

pub(crate) struct SendingVisitor {
    sender: UnboundedSender<Event>,
    subscribed_chat_messages: bool,
    subscribed_entities: Option<HashSet<EntityType>>,
    game_time: f32,
    tick_interval: f32,
    rules: GameRulesProxyEvent,
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
        }
    }
}

impl Visitor for SendingVisitor {
    type Error = DemoParseError;

    async fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        let Some(entity_type) = EntityType::from_opt(entity) else {
            return Ok(());
        };

        if entity_type == EntityType::GameRulesProxy
            && let Some(rules) =
                GameRulesProxyEvent::from_entity_update(ctx, delta_header.into(), entity)
        {
            debug!("Updating game rules");
            self.rules = rules;
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

    async fn on_cmd(
        &mut self,
        ctx: &Context,
        cmd_header: &CmdHeader,
        _data: &[u8],
    ) -> Result<(), Self::Error> {
        if cmd_header.cmd == EDemoCommands::DemSyncTick {
            debug!("Updating tick interval");
            self.tick_interval = ctx.tick_interval();
        }
        Ok(())
    }

    async fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        if self.subscribed_chat_messages
            && packet_type == CitadelUserMessageIds::KEUserMsgChatMsg as u32
            && let Ok(msg) = CCitadelUserMsgChatMsg::decode(data)
            && let Some(tables) = ctx.string_tables()
            && let Some(table) = tables.find_table("userinfo")
            && let Some(player_slot) = msg.player_slot
        {
            let user_info = table.get_item(&player_slot);
            let user_data = user_info.and_then(StringTableItem::get_user_data);
            let user_info = user_data.and_then(|d| CMsgPlayerInfo::decode(d.as_ref()).ok());
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
        Ok(())
    }

    async fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        #[allow(clippy::cast_precision_loss)]
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
