use clickhouse::Row;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Row)]
pub struct UpgradeItem {
    pub id: u32,
    pub name: String,
    pub item_tier: u8,
    pub shopable: Option<bool>,
}

#[derive(Serialize, Row)]
pub struct ChUpgradeItem {
    pub id: u32,
    pub name: String,
    pub tier: u8,
}

impl From<UpgradeItem> for ChUpgradeItem {
    fn from(value: UpgradeItem) -> Self {
        Self {
            id: value.id,
            name: value.name,
            tier: value.item_tier,
        }
    }
}

#[derive(Deserialize)]
pub struct Hero {
    pub id: u16,
    pub name: String,
    pub disabled: Option<bool>,
    pub in_development: Option<bool>,
}

#[derive(Serialize, Row)]
pub struct ChHero {
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
