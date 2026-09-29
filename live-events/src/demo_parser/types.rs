use core::fmt::{Display, Formatter};

use axum::response::sse::Event;
use haste::entities::DeltaHeader;
use serde::Serialize;
use strum::{Display, FromRepr};
use valveprotos::deadlock::{
    CCitadelUserMsgCombatLogBulkData, CCitadelUserMsgHeroKilled, CCitadelUserMsgHeroReleaseVote,
    CMsgCitadelCombatLogEntry,
};

use crate::demo_parser::entity_events::{EntityType, EntityUpdateEvents};

#[derive(Serialize, Debug, Clone)]
pub(crate) struct DemoEvent {
    pub(super) tick: i32,
    pub(super) game_time: f32,

    #[serde(flatten)]
    pub(super) event: DemoEventPayload,
}

impl TryInto<Event> for DemoEvent {
    type Error = axum::Error;

    fn try_into(self) -> Result<Event, Self::Error> {
        let event = self.event.to_string();
        Event::default().event(event).json_data(self)
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "event_type")]
#[serde(rename_all = "snake_case")]
pub(super) enum DemoEventPayload {
    EntityUpdate {
        delta: Delta,
        entity_index: i32,
        entity_type: EntityType,
        #[serde(flatten)]
        entity_update: EntityUpdateEvents,
    },
    ChatMessage {
        steam_name: Option<String>,
        steam_id: Option<u32>,
        text: Option<String>,
        all_chat: Option<bool>,
        lane_color: Option<i32>,
    },
    HeroKilled(CCitadelUserMsgHeroKilled),
    BannedHeroes {
        banned_hero_ids: Vec<u32>,
    },
    SoulBagPickup {
        /// Entity index of the player that picked up the soul bag.
        pickup_player: Option<i32>,
        /// Entity index of the player that dropped the soul bag.
        victim_player: Option<i32>,
        killfeed_gold: Option<i32>,
    },
    HeroReleaseVote(CCitadelUserMsgHeroReleaseVote),
    CombatLogEntry(Box<CMsgCitadelCombatLogEntry>),
    CombatLogBulkData(CCitadelUserMsgCombatLogBulkData),
    PlayerTyping {
        player_slot: Option<i32>,
        /// Server game time sent with the message (the envelope's `game_time` is the match
        /// clock).
        server_game_time: Option<f32>,
        all_chat: Option<bool>,
        typing: Option<bool>,
    },
    MusicQueue {
        queue: Option<i32>,
        /// Snake-case name of `queue` (e.g. `corrupted_item_shop_announce` for the Broker's
        /// arrival), if it is known.
        queue_name: Option<&'static str>,
    },
    TickEnd,
}

impl Display for DemoEventPayload {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::EntityUpdate {
                delta, entity_type, ..
            } => write!(f, "{entity_type}_entity_{delta}"),
            Self::ChatMessage { .. } => write!(f, "chat_message"),
            Self::HeroKilled { .. } => write!(f, "hero_killed"),
            Self::BannedHeroes { .. } => write!(f, "banned_heroes"),
            Self::SoulBagPickup { .. } => write!(f, "soul_bag_pickup"),
            Self::HeroReleaseVote(..) => write!(f, "hero_release_vote"),
            Self::CombatLogEntry(..) => write!(f, "combat_log_entry"),
            Self::CombatLogBulkData(..) => write!(f, "combat_log_bulk_data"),
            Self::PlayerTyping { .. } => write!(f, "player_typing"),
            Self::MusicQueue { .. } => write!(f, "music_queue"),
            Self::TickEnd => write!(f, "tick_end"),
        }
    }
}

#[derive(FromRepr, Serialize, Debug, Clone, Copy, PartialEq, Eq, Default, Display)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(super) enum Delta {
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
