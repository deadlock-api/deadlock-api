use core::fmt::Write as _;

use axum::http::StatusCode;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

use super::common_filters::{MatchInfoFilters, id_list};
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::types::{GameMode, MatchMode};

/// Every 180s up to 900, every 300s after. A match's final tick lands off that grid and is dropped:
/// it is not comparable across matches.
pub(super) const SAMPLE_GRID_FILTER: &str = "((time_stamp_s <= 900 AND time_stamp_s % 180 = 0) OR (time_stamp_s > 900 AND time_stamp_s % 300 = 0))";

const MAX_STATS: usize = 8;

/// Per-tick columns of `match_player.stats`. Every variant's `snake_case` name *is* its column name.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    Display,
    EnumString,
    ToSchema,
)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum LaneStat {
    NetWorth,
    Kills,
    Deaths,
    Assists,
    Denies,
    CreepKills,
    NeutralKills,
    PossibleCreeps,
    CreepDamage,
    NeutralDamage,
    BossDamage,
    PlayerDamage,
    PlayerDamageTaken,
    PlayerHealing,
    SelfHealing,
    SelfDamage,
    TeammateHealing,
    TeammateBarriering,
    PlayerBarriering,
    DamageMitigated,
    DamageAbsorbed,
    AbsorptionProvided,
    HealPrevented,
    HealLost,
    Level,
    AbilityPoints,
    MaxHealth,
    WeaponPower,
    TechPower,
    ShotsHit,
    ShotsMissed,
    HeroBulletsHit,
    HeroBulletsHitCrit,
    BulletKills,
    MeleeKills,
    AbilityKills,
    HeadshotKills,
    GoldPlayer,
    GoldPlayerOrbs,
    GoldLaneCreep,
    GoldLaneCreepOrbs,
    GoldNeutralCreep,
    GoldNeutralCreepOrbs,
    GoldBoss,
    GoldBossOrb,
    GoldTreasure,
    GoldDenied,
    GoldDeathLoss,
}

pub(super) struct LaneStats {
    pub requested: Vec<LaneStat>,
    /// `requested` prefixed with `net_worth`, which both endpoints report unconditionally.
    pub computed: Vec<LaneStat>,
}

impl LaneStats {
    pub(super) fn new(requested: Option<&[LaneStat]>) -> APIResult<Self> {
        let requested = requested.map(<[LaneStat]>::to_vec).unwrap_or_default();
        if requested.len() > MAX_STATS {
            return Err(APIError::StatusMsg {
                status: StatusCode::BAD_REQUEST,
                message: format!("At most {MAX_STATS} stats can be requested at once"),
            });
        }
        let computed = [LaneStat::NetWorth]
            .into_iter()
            .chain(requested.iter().copied())
            .unique()
            .collect();
        Ok(Self {
            requested,
            computed,
        })
    }

    pub(super) fn tick_array_join(&self) -> String {
        self.computed.iter().fold(String::new(), |mut acc, stat| {
            let _ = write!(acc, ", stats.{stat} AS {stat}_sample");
            acc
        })
    }

    /// `WITH` bindings reading every stat at the first tick from `at_time_s` on. The index is
    /// resolved once rather than per stat, and `has_sample` is derived from it rather than from a
    /// value, because `0` kills is a real reading. Out-of-range indexing yields `0`, so players
    /// whose match ended earlier read as unsampled.
    pub(super) fn sample_bindings(&self, at_time_s: u32) -> String {
        [format!(
            "arrayFirstIndex(t -> t >= {at_time_s}, stats.time_stamp_s) AS sample_index"
        )]
        .into_iter()
        .chain(
            self.computed
                .iter()
                .map(|stat| format!("stats.{stat}[sample_index] AS {stat}_sample")),
        )
        .chain(["sample_index > 0 AS has_sample".to_string()])
        .join(",\n        ")
    }

    pub(super) fn side_totals(&self) -> String {
        self.computed.iter().fold(String::new(), |mut acc, stat| {
            let _ = write!(
                acc,
                ",\n        toFloat64(sumIf({stat}_sample, team = 'Team0')) AS {stat}_t0,\n        toFloat64(sumIf({stat}_sample, team = 'Team1')) AS {stat}_t1"
            );
            acc
        })
    }

    pub(super) fn side_swap(&self) -> String {
        self.computed.iter().fold(String::new(), |mut acc, stat| {
            let _ = write!(
                acc,
                ",\n    [{stat}_t0, {stat}_t1] AS x_{stat}_value,\n    [{stat}_t0 - {stat}_t1, {stat}_t1 - {stat}_t0] AS x_{stat}_diff"
            );
            acc
        })
    }
}

#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    EnumString,
    ToSchema,
)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub(super) enum LaneGroupBy {
    AssignedLane,
    HeroIds,
    EnemyHeroIds,
}

impl LaneGroupBy {
    /// Fixed, so column order never depends on the order the caller asked for.
    const ALL: [Self; 3] = [Self::AssignedLane, Self::HeroIds, Self::EnemyHeroIds];

    fn name(self) -> &'static str {
        match self {
            Self::AssignedLane => "assigned_lane",
            Self::HeroIds => "hero_ids",
            Self::EnemyHeroIds => "enemy_hero_ids",
        }
    }

    fn definition(self) -> &'static str {
        match self {
            Self::AssignedLane => "assigned_lane",
            Self::HeroIds => "arrayMap(h -> toUInt32(h), duo) AS hero_ids",
            Self::EnemyHeroIds => "arrayMap(h -> toUInt32(h), enemy_duo) AS enemy_hero_ids",
        }
    }

    /// Stand-in for a folded dimension. `0` is free for `assigned_lane`: unassigned players are
    /// filtered out before grouping.
    fn folded(self) -> &'static str {
        match self {
            Self::AssignedLane => "toUInt32(0) AS assigned_lane",
            Self::HeroIds => "CAST([], 'Array(UInt32)') AS hero_ids",
            Self::EnemyHeroIds => "CAST([], 'Array(UInt32)') AS enemy_hero_ids",
        }
    }
}

pub(super) struct LaneGrouping(Vec<LaneGroupBy>);

impl LaneGrouping {
    pub(super) fn new(group_by: Option<&[LaneGroupBy]>) -> Self {
        let requested = group_by.unwrap_or(&LaneGroupBy::ALL);
        Self(
            LaneGroupBy::ALL
                .into_iter()
                .filter(|dim| requested.contains(dim))
                .collect(),
        )
    }

    pub(super) fn dims(&self) -> &[LaneGroupBy] {
        &self.0
    }

    /// Folded dimensions are omitted so nothing downstream can group on them.
    pub(super) fn select_grouped(&self) -> String {
        self.0
            .iter()
            .map(|dim| format!("{},", dim.definition()))
            .join("\n    ")
    }

    pub(super) fn select_all_defined(&self) -> String {
        self.select_all(LaneGroupBy::definition)
    }

    pub(super) fn select_all_by_name(&self) -> String {
        self.select_all(LaneGroupBy::name)
    }

    fn select_all(&self, grouped: impl Fn(LaneGroupBy) -> &'static str) -> String {
        LaneGroupBy::ALL
            .into_iter()
            .map(|dim| {
                if self.0.contains(&dim) {
                    grouped(dim)
                } else {
                    dim.folded()
                }
            })
            .join(",\n    ")
    }

    /// Empty when nothing is grouped, collapsing the query to a single row.
    pub(super) fn group_by_clause(&self, extra: &[&str]) -> String {
        let cols = self
            .0
            .iter()
            .map(|dim| dim.name())
            .chain(extra.iter().copied())
            .join(", ");
        if cols.is_empty() {
            String::new()
        } else {
            format!("GROUP BY {cols}")
        }
    }
}

pub(super) fn matches_having_clause(min_matches: Option<u64>, max_matches: Option<u64>) -> String {
    let filters = min_matches
        .map(|v| format!("matches_played >= {v}"))
        .into_iter()
        .chain(max_matches.map(|v| format!("matches_played <= {v}")))
        .join(" AND ");
    if filters.is_empty() {
        String::new()
    } else {
        format!("HAVING {filters}")
    }
}

/// One element per requested stat, in request order — the ordering the response mapping relies on.
/// `CAST` rather than a bare `[]` so the empty case still carries `empty_type`.
pub(super) fn stat_array(
    stats: &LaneStats,
    empty_type: &str,
    expr: impl Fn(LaneStat) -> String,
) -> String {
    if stats.requested.is_empty() {
        return format!("CAST([], '{empty_type}')");
    }
    format!("[{}]", stats.requested.iter().map(|s| expr(*s)).join(", "))
}

/// The predicate every pass over `match_player` scans a lane query with.
pub(super) struct LaneScanFilters<'a> {
    pub game_mode: Option<GameMode>,
    pub match_mode: Option<&'a [MatchMode]>,
    pub info: MatchInfoFilters,
    pub assigned_lanes: Option<&'a [u32]>,
    /// ` AND ...` fragments from [`super::common_filters::LaneDuoFilters`].
    pub accounts: &'a str,
    pub heroes: &'a str,
    /// Heroes every surviving matchup must contain, from the same source.
    pub required_heroes: &'a [u32],
}

impl LaneScanFilters<'_> {
    pub(super) fn build(&self) -> String {
        let lanes = self
            .assigned_lanes
            .filter(|lanes| !lanes.is_empty())
            .map_or_else(String::new, |lanes| {
                format!(" AND assigned_lane IN ({})", id_list(lanes))
            });
        let match_mode = MatchMode::sql_filter(self.match_mode);
        let game_mode = GameMode::sql_filter(self.game_mode);
        let info = self.info.build();
        // The duo filters run after the per-lane GROUP BY, so without this every match in the
        // window is aggregated and then thrown away. Restricting the scan to matches that
        // contain all requested heroes is a superset of what those filters keep and lets the
        // primary key skip the rest (measured 280 M -> 28 M rows for a two-hero duo).
        let matches = if self.required_heroes.is_empty() {
            String::new()
        } else {
            format!(
                " AND match_id IN (SELECT match_id FROM match_player WHERE {match_mode} AND \
                 {game_mode}{info} AND hero_id IN ({}) GROUP BY match_id HAVING uniqExact(hero_id) \
                 = {})",
                id_list(self.required_heroes),
                self.required_heroes.len()
            )
        };
        format!(
            "{match_mode} AND {game_mode}{info} AND team IN ('Team0', 'Team1') AND assigned_lane > \
             0{lanes}{}{}{matches}",
            self.accounts, self.heroes,
        )
    }
}
