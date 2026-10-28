use clickhouse::Row;
use game_assets::versions::heroes::Hero;
use game_assets::versions::items::Item;
use game_assets::versions::items::types::ItemSlotType;
use serde::Serialize;
use serde_repr::Serialize_repr;

#[derive(Serialize_repr, PartialEq, Eq, Debug)]
#[repr(i8)]
pub(crate) enum CHItemType {
    Upgrade = 0,
    Ability = 1,
}

#[derive(Serialize_repr, PartialEq, Eq, Debug)]
#[repr(i8)]
pub(crate) enum CHSlotType {
    Weapon = 0,
    Vitality = 1,
    Spirit = 2,
}

impl From<ItemSlotType> for CHSlotType {
    fn from(value: ItemSlotType) -> Self {
        match value {
            ItemSlotType::Weapon => Self::Weapon,
            ItemSlotType::Vitality => Self::Vitality,
            ItemSlotType::Spirit => Self::Spirit,
        }
    }
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

/// Why an item doesn't get a row.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ItemSkip {
    NotShopable,
    /// Weapons; the table only knows upgrades and abilities.
    UnknownType,
}

impl TryFrom<&Item> for ChItem {
    type Error = ItemSkip;

    fn try_from(item: &Item) -> Result<Self, ItemSkip> {
        match item {
            Item::Upgrade(u) if !u.shopable => Err(ItemSkip::NotShopable),
            Item::Upgrade(u) => Ok(Self {
                id: item.id(),
                name: u.name.clone(),
                tier: Some(u.item_tier),
                r#type: CHItemType::Upgrade,
                slot_type: Some(u.item_slot_type.into()),
                cost: u.cost,
            }),
            Item::Ability(a) => Ok(Self {
                id: item.id(),
                name: a.name.clone(),
                tier: None,
                r#type: CHItemType::Ability,
                slot_type: None,
                cost: None,
            }),
            Item::Weapon(_) => Err(ItemSkip::UnknownType),
        }
    }
}

#[derive(Serialize, Row)]
pub(crate) struct ChHero {
    pub id: u8,
    pub name: String,
}

/// Fails for a hero id that doesn't fit the table's `UInt8`.
impl TryFrom<&Hero> for ChHero {
    type Error = core::num::TryFromIntError;

    fn try_from(hero: &Hero) -> Result<Self, Self::Error> {
        Ok(Self {
            id: u8::try_from(hero.id)?,
            name: hero.name.clone(),
        })
    }
}
