use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(Deserialize, Serialize, Row)]
pub(crate) struct Item {
    pub id: u32,
    pub name: String,
    #[serde(default, rename = "item_tier")]
    pub tier: Option<u8>,
    #[serde(default)]
    pub shopable: Option<bool>,
    pub r#type: ItemType,
    #[serde(default, rename = "item_slot_type")]
    pub slot_type: Option<SlotType>,
    pub cost: Option<u32>,
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ItemType {
    Upgrade,
    Ability,
    #[serde(other)]
    Unknown,
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SlotType {
    Weapon,
    Vitality,
    Spirit,
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
#[repr(i8)]
pub(crate) enum CHItemType {
    Upgrade = 0,
    Ability = 1,
    #[serde(other)]
    Unknown = 2,
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
#[repr(i8)]
pub(crate) enum CHSlotType {
    Weapon = 0,
    Vitality = 1,
    Spirit = 2,
}

#[derive(Serialize, Row)]
pub(crate) struct ChItem {
    pub id: u32,
    pub name: String,
    pub tier: Option<u8>,
    pub r#type: CHItemType,
    pub slot_type: Option<CHSlotType>,
    pub cost: Option<u32>,
}

impl From<Item> for ChItem {
    fn from(value: Item) -> Self {
        Self {
            id: value.id,
            name: value.name,
            tier: value.tier,
            r#type: match value.r#type {
                ItemType::Upgrade => CHItemType::Upgrade,
                ItemType::Ability => CHItemType::Ability,
                ItemType::Unknown => unreachable!(),
            },
            slot_type: match value.slot_type {
                Some(SlotType::Weapon) => Some(CHSlotType::Weapon),
                Some(SlotType::Vitality) => Some(CHSlotType::Vitality),
                Some(SlotType::Spirit) => Some(CHSlotType::Spirit),
                None => None,
            },
            cost: value.cost,
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct Hero {
    pub id: u16,
    pub name: String,
    pub disabled: Option<bool>,
    pub in_development: Option<bool>,
}

#[derive(Serialize, Row)]
pub(crate) struct ChHero {
    pub id: u16,
    pub name: String,
}

impl From<Hero> for ChHero {
    fn from(value: Hero) -> Self {
        Self {
            id: value.id,
            name: value.name,
        }
    }
}
