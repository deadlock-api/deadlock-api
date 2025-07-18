use axum::response::sse::Event;
use haste::demostream::CmdHeader;
use haste::entities::{DeltaHeader, Entity};
use haste::parser::{Context, Visitor};
use tokio::sync::mpsc::UnboundedSender;

use crate::routes::v1::matches::live::parser::entity_events::{EntityType, EntityUpdateEvents};
use crate::routes::v1::matches::live::parser::error::StreamParseError;
use crate::routes::v1::matches::live::parser::types::{DemoEvent, DemoEventPayload};

pub(crate) struct EventVisitor {
    sender: UnboundedSender<Event>,
}

impl EventVisitor {
    pub(crate) fn new(sender: UnboundedSender<Event>) -> Self {
        EventVisitor { sender }
    }
}

impl Visitor for EventVisitor {
    type Error = StreamParseError;

    async fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        let Some(entity_type) = EntityType::from_opt(entity) else {
            return Ok(());
        };
        let Some(entity_update) =
            EntityUpdateEvents::from_update(ctx, delta_header.into(), entity_type, entity)
        else {
            return Ok(());
        };
        let demo_event = DemoEvent {
            tick: ctx.tick(),
            event: DemoEventPayload::EntityUpdate {
                delta: delta_header.into(),
                entity_index: entity.index(),
                entity_type,
                entity_update,
            },
        };
        self.sender.send(demo_event.try_into()?)?;
        Ok(())
    }

    async fn on_cmd(
        &mut self,
        _ctx: &Context,
        _cmd_header: &CmdHeader,
        _data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    async fn on_packet(
        &mut self,
        _ctx: &Context,
        _packet_type: u32,
        _data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    async fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        let demo_event = DemoEvent {
            tick: ctx.tick(),
            event: DemoEventPayload::TickEnd,
        };
        self.sender.send(demo_event.try_into()?)?;
        Ok(())
    }
}
