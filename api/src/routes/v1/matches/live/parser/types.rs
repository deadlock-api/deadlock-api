use core::fmt::{Display, Formatter};

use axum::response::sse::Event;
use haste::entities::{DeltaHeader, Entity};
use haste::fxhash;
use serde::Serialize;
use strum_macros::{Display, FromRepr};
use utoipa::ToSchema;

use crate::routes::v1::matches::live::parser::entity_events::EntityUpdateEvents;

#[derive(Serialize, Debug, Clone, ToSchema)]
pub(crate) struct DemoEvent {
    pub tick: i32,

    #[serde(flatten)]
    pub event: DemoEventPayload,
}

impl TryInto<Event> for DemoEvent {
    type Error = axum_core::Error;

    fn try_into(self) -> Result<Event, Self::Error> {
        let event = self.event.to_string();
        Ok(Event::default().json_data(self)?.event(event))
    }
}

#[derive(Serialize, Debug, Clone, ToSchema)]
#[serde(tag = "event_type")]
#[serde(rename_all = "snake_case")]
pub(crate) enum DemoEventPayload {
    EntityUpdate {
        delta: Delta,
        entity_index: i32,
        entity_type: EntityType,
        #[serde(flatten)]
        entity_update: EntityUpdateEvents,
    },
    TickEnd,
}

impl Display for DemoEventPayload {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::EntityUpdate {
                delta, entity_type, ..
            } => write!(f, "{entity_type}_entity_{delta}"),
            Self::TickEnd => write!(f, "tick_end"),
        }
    }
}

#[derive(FromRepr, Serialize, Debug, Clone, Copy, PartialEq, Eq, Default, Display, ToSchema)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(crate) enum Delta {
    #[default]
    #[serde(skip)]
    Invalid,
    Update,
    Leave,
    Create,
    Delete,
}

impl From<DeltaHeader> for Delta {
    fn from(delta_header: DeltaHeader) -> Self {
        match delta_header {
            DeltaHeader::UPDATE => Self::Update,
            DeltaHeader::LEAVE => Self::Leave,
            DeltaHeader::CREATE => Self::Create,
            DeltaHeader::DELETE => Self::Delete,
            _ => Self::default(),
        }
    }
}

#[derive(FromRepr, Serialize, Debug, Clone, Copy, PartialEq, Eq, Display, ToSchema)]
#[repr(u64)]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub(crate) enum EntityType {
    PlayerController = fxhash::hash_bytes(b"CCitadelPlayerController"),
    PlayerPawn = fxhash::hash_bytes(b"CCitadelPlayerPawn"),
    MidBoss = fxhash::hash_bytes(b"CNPC_MidBoss"),
    TrooperNeutral = fxhash::hash_bytes(b"CNPC_TrooperNeutral"),
    Trooper = fxhash::hash_bytes(b"CNPC_Trooper"),
    TrooperBoss = fxhash::hash_bytes(b"CNPC_TrooperBoss"),
    ShieldedSentry = fxhash::hash_bytes(b"CNPC_ShieldedSentry"),
    BaseDefenseSentry = fxhash::hash_bytes(b"CNPC_BaseDefenseSentry"),
    TrooperBarrackBoss = fxhash::hash_bytes(b"CNPC_TrooperBarrackBoss"),
    BossTier2 = fxhash::hash_bytes(b"CNPC_Boss_Tier2"),
    BossTier3 = fxhash::hash_bytes(b"CNPC_Boss_Tier3"),
}

impl EntityType {
    pub(crate) fn from_opt(entity: &Entity) -> Option<Self> {
        Self::from_repr(entity.serializer().serializer_name.hash)
    }
}
