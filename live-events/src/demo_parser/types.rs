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

impl TryFrom<DemoEvent> for Event {
    type Error = axum::Error;

    fn try_from(event: DemoEvent) -> Result<Self, Self::Error> {
        Self::default()
            .event(event.event.to_string())
            .json_data(event)
    }
}

#[derive(Serialize, Debug, Clone, Display)]
#[serde(tag = "event_type")]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(super) enum DemoEventPayload {
    #[strum(to_string = "{entity_type}_entity_{delta}")]
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
    /// A player got an item, bought or not.
    ItemAcquired {
        /// Entity index of the player that got the item.
        player: Option<i32>,
        /// Item id (as used by the assets API).
        ability_id: Option<u32>,
        upgrade_bits: Option<u32>,
        /// Whether the player bought the item.
        purchased: Option<bool>,
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
    /// The Broker (corrupted item shop) spawned.
    CorruptedItemShopSpawn {
        /// Number of corrupted items on offer; 1 for the spawn.
        corrupted_items_limit: i32,
    },
    /// The Broker restocked.
    CorruptedItemShopRestock {
        /// Number of corrupted items on offer; 2 for the first restock, then +1 per restock.
        corrupted_items_limit: i32,
    },
    /// An item/upgrade entity that is a corrupted item (bought from the Broker) appeared.
    CorruptedItem {
        /// Entity index of the item entity.
        entity_index: i32,
        /// Entity index of the owning player pawn.
        owner_entity: Option<i32>,
        team: Option<u8>,
        /// Item id (as used by the assets API).
        item_id: u32,
        /// Packed `m_nUpgradeInfo`; bit 23 (`0x800000`) marks the item as corrupted.
        upgrade_info: u32,
    },
    TickEnd,
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn event(event: DemoEventPayload) -> (String, serde_json::Value) {
        let name = event.to_string();
        let demo_event = DemoEvent {
            tick: 120_300,
            game_time: 1829.5,
            event,
        };
        (name, serde_json::to_value(demo_event).unwrap())
    }

    #[test]
    fn test_banned_heroes_payload() {
        let (name, value) = event(DemoEventPayload::BannedHeroes {
            banned_hero_ids: vec![18, 16, 14],
        });
        assert_eq!(name, "banned_heroes");
        assert_eq!(
            value,
            json!({
                "tick": 120_300,
                "game_time": 1829.5,
                "event_type": "banned_heroes",
                "banned_hero_ids": [18, 16, 14],
            })
        );
    }

    #[test]
    fn test_item_acquired_payload() {
        let (name, value) = event(DemoEventPayload::ItemAcquired {
            player: Some(94),
            ability_id: Some(787_198_704),
            upgrade_bits: Some(0x0081_0000),
            purchased: Some(true),
        });
        assert_eq!(name, "item_acquired");
        assert_eq!(
            value,
            json!({
                "tick": 120_300,
                "game_time": 1829.5,
                "event_type": "item_acquired",
                "player": 94,
                "ability_id": 787_198_704,
                "upgrade_bits": 8_454_144,
                "purchased": true,
            })
        );
    }

    #[test]
    fn test_broker_payloads() {
        let (name, value) = event(DemoEventPayload::CorruptedItemShopSpawn {
            corrupted_items_limit: 1,
        });
        assert_eq!(name, "corrupted_item_shop_spawn");
        assert_eq!(value["event_type"], "corrupted_item_shop_spawn");
        assert_eq!(value["corrupted_items_limit"], 1);

        let (name, value) = event(DemoEventPayload::CorruptedItemShopRestock {
            corrupted_items_limit: 2,
        });
        assert_eq!(name, "corrupted_item_shop_restock");
        assert_eq!(value["event_type"], "corrupted_item_shop_restock");
        assert_eq!(value["corrupted_items_limit"], 2);
    }

    #[test]
    fn test_corrupted_item_payload() {
        let (name, value) = event(DemoEventPayload::CorruptedItem {
            entity_index: 3949,
            owner_entity: Some(89),
            team: Some(2),
            item_id: 787_198_704,
            upgrade_info: 0x0081_0000,
        });
        assert_eq!(name, "corrupted_item");
        assert_eq!(
            value,
            json!({
                "tick": 120_300,
                "game_time": 1829.5,
                "event_type": "corrupted_item",
                "entity_index": 3949,
                "owner_entity": 89,
                "team": 2,
                "item_id": 787_198_704,
                "upgrade_info": 8_454_144,
            })
        );
    }
}
