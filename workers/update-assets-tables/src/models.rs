use clickhouse::Row;
use game_assets::versions::heroes::Hero;
use game_assets::versions::items::Item;
use game_assets::versions::items::types::ItemSlotType;
use game_assets::versions::ranked_seasons::RankedSeason;
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

/// One ranked interval with the rank ladder of its season, a row of `ranked_season_intervals`.
#[derive(Serialize, Row, Debug, PartialEq, Eq)]
pub(crate) struct ChRankedSeasonInterval {
    pub rank_interval: u32,
    pub season: String,
    pub season_name: String,
    pub start_time: u32,
    pub end_time: u32,
    pub leaderboard_id: Option<u32>,
    pub sub_rank_xp: Vec<u32>,
}

/// Subranks per tier: `rankBadge` counts the badge's subrank from the steps of `sub_rank_xp`.
const SUBRANKS: usize = 6;

/// Why a season's intervals don't get rows.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum SeasonSkip {
    /// No `rank_info` entry lists one `sub_rank_xp` step per subrank.
    NoLadder,
    /// An interval starts or ends outside the table's `DateTime` range.
    Timestamp(core::num::TryFromIntError),
}

impl ChRankedSeasonInterval {
    /// The rows of a season's intervals. The ladder is the season's first `rank_info` entry that
    /// lists `sub_rank_xp`, as in every season so far, where it covers all ranks below Eternus.
    pub(crate) fn from_season(season: &RankedSeason) -> Result<Vec<Self>, SeasonSkip> {
        let sub_rank_xp = season
            .rank_info
            .iter()
            .map(|info| &info.sub_rank_xp)
            .find(|xp| !xp.is_empty())
            .filter(|xp| xp.len() == SUBRANKS && xp.iter().all(|&step| step > 0))
            .ok_or(SeasonSkip::NoLadder)?;
        season
            .intervals
            .iter()
            .map(|interval| {
                Ok(Self {
                    rank_interval: interval.interval,
                    season: season.class_name.clone(),
                    season_name: season.name.clone(),
                    start_time: u32::try_from(interval.start_timestamp)
                        .map_err(SeasonSkip::Timestamp)?,
                    end_time: u32::try_from(interval.end_timestamp)
                        .map_err(SeasonSkip::Timestamp)?,
                    leaderboard_id: interval.leaderboard_id,
                    sub_rank_xp: sub_rank_xp.clone(),
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use game_assets::versions::ranked_seasons::{RankInfo, SeasonInterval};

    use super::*;

    fn season(sub_rank_xp: Vec<u32>) -> RankedSeason {
        RankedSeason {
            class_name: "season_2".to_owned(),
            name: "Beta Season 2".to_owned(),
            ranked_type: "normal".to_owned(),
            min_wins: 60,
            min_hero_wins: None,
            min_hero_unlock_points: Some(35),
            min_hero_unlocks: 3,
            calibration_matches: 8,
            calibration_max_rank: Some(101),
            base_win_loss_point_grant: Some(350),
            valid_party_sizes: vec![1, 2],
            intervals: vec![SeasonInterval {
                interval: 2,
                start_timestamp: 1_793_908_800,
                end_timestamp: 1_804_802_400,
                leaderboard_id: Some(1002),
            }],
            rank_info: vec![
                RankInfo {
                    rank_end: None,
                    sub_rank_xp,
                    badge_shields: None,
                    sub_rank_shields: None,
                },
                RankInfo {
                    rank_end: Some(91),
                    sub_rank_xp: vec![],
                    badge_shields: Some(3),
                    sub_rank_shields: Some(1),
                },
            ],
        }
    }

    #[test]
    fn one_row_per_interval_with_the_seasons_ladder() {
        let rows =
            ChRankedSeasonInterval::from_season(&season(vec![1000, 1000, 1000, 1000, 1000, 1500]))
                .unwrap();
        assert_eq!(
            rows,
            [ChRankedSeasonInterval {
                rank_interval: 2,
                season: "season_2".to_owned(),
                season_name: "Beta Season 2".to_owned(),
                start_time: 1_793_908_800,
                end_time: 1_804_802_400,
                leaderboard_id: Some(1002),
                sub_rank_xp: vec![1000, 1000, 1000, 1000, 1000, 1500],
            }]
        );
    }

    #[test]
    fn a_ladder_without_six_steps_is_skipped() {
        assert_eq!(
            ChRankedSeasonInterval::from_season(&season(vec![1000, 1500])),
            Err(SeasonSkip::NoLadder)
        );
        assert_eq!(
            ChRankedSeasonInterval::from_season(&season(vec![])),
            Err(SeasonSkip::NoLadder)
        );
    }
}
