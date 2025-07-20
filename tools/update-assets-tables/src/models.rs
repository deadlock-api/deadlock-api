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
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ItemType {
    Upgrade,
    Ability,
    #[serde(other)]
    Unknown,
}

#[derive(Serialize_repr, Deserialize_repr, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
#[repr(u8)]
pub(crate) enum CHItemType {
    Upgrade,
    Ability,
    #[serde(other)]
    Unknown,
}

#[derive(Serialize, Row)]
pub(crate) struct ChItem {
    pub id: u32,
    pub name: String,
    pub tier: Option<u8>,
    pub r#type: CHItemType,
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
