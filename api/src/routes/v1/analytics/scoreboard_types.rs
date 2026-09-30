use serde::Deserialize;
use strum::Display;
use utoipa::ToSchema;

use crate::routes::v1::players::rank::{badge_from_flat_progress_sql, subrank_progress_sql};

#[derive(Copy, Clone, Debug, Deserialize, ToSchema, Display, Eq, PartialEq, Hash, Default)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum ScoreboardQuerySortBy {
    /// Sort by the number of matches
    #[default]
    Matches,
    /// Sort by the rank progress the player ended their latest ranked match in range on, which
    /// also orders players within Eternus. The entry's `badge` is the matching rank badge.
    /// Player scoreboard only.
    Rank,
    /// Sort by the highest rank progress the player ended any ranked match in range on. The
    /// entry's `badge` is the matching rank badge. Player scoreboard only.
    PeakRank,
    /// Sort by the number of wins
    Wins,
    /// Sort by the number of losses
    Losses,
    /// Sort by the winrate
    Winrate,
    /// Sort by the max kills per match
    MaxKillsPerMatch,
    /// Sort by the avg kills per match
    AvgKillsPerMatch,
    /// Sort by the max total kills
    Kills,
    /// Sort by the max deaths per match
    MaxDeathsPerMatch,
    /// Sort by the avg deaths per match
    AvgDeathsPerMatch,
    /// Sort by the max total deaths
    Deaths,
    /// Sort by the max damage taken per match
    MaxDamageTakenPerMatch,
    /// Sort by the avg damage taken per match
    AvgDamageTakenPerMatch,
    /// Sort by the max total damage taken
    DamageTaken,
    /// Sort by the max assists per match
    MaxAssistsPerMatch,
    /// Sort by the avg assists per match
    AvgAssistsPerMatch,
    /// Sort by the max total assists
    Assists,
    /// Sort by the max `net_worth` per match
    MaxNetWorthPerMatch,
    /// Sort by the avg `net_worth` per match
    AvgNetWorthPerMatch,
    /// Sort by the max total `net_worth`
    NetWorth,
    /// Sort by the max `last_hits` per match
    MaxLastHitsPerMatch,
    /// Sort by the avg `last_hits` per match
    AvgLastHitsPerMatch,
    /// Sort by the max total `last_hits`
    LastHits,
    /// Sort by the max denies per match
    MaxDeniesPerMatch,
    /// Sort by the avg denies per match
    AvgDeniesPerMatch,
    /// Sort by the max total denies
    Denies,
    /// Sort by the max `player_level` per match
    MaxPlayerLevelPerMatch,
    /// Sort by the avg `player_level` per match
    AvgPlayerLevelPerMatch,
    /// Sort by the max total `player_level`
    PlayerLevel,
    /// Sort by the max `creep_kills` per match
    MaxCreepKillsPerMatch,
    /// Sort by the avg `creep_kills` per match
    AvgCreepKillsPerMatch,
    /// Sort by the max total `creep_kills`
    CreepKills,
    /// Sort by the max `neutral_kills` per match
    MaxNeutralKillsPerMatch,
    /// Sort by the avg `neutral_kills` per match
    AvgNeutralKillsPerMatch,
    /// Sort by the max total `neutral_kills`
    NeutralKills,
    /// Sort by the max `creep_damage` per match
    MaxCreepDamagePerMatch,
    /// Sort by the avg `creep_damage` per match
    AvgCreepDamagePerMatch,
    /// Sort by the max total `creep_damage`
    CreepDamage,
    /// Sort by the max `player_damage` per match
    MaxPlayerDamagePerMatch,
    /// Sort by the avg `player_damage` per match
    AvgPlayerDamagePerMatch,
    /// Sort by the max total `player_damage`
    PlayerDamage,
    /// Sort by the max `neutral_damage` per match
    MaxNeutralDamagePerMatch,
    /// Sort by the avg `neutral_damage` per match
    AvgNeutralDamagePerMatch,
    /// Sort by the max total `neutral_damage`
    NeutralDamage,
    /// Sort by the max `boss_damage` per match
    MaxBossDamagePerMatch,
    /// Sort by the avg `boss_damage` per match
    AvgBossDamagePerMatch,
    /// Sort by the max total `boss_damage`
    BossDamage,
    /// Sort by the max `max_health` per match
    MaxMaxHealthPerMatch,
    /// Sort by the avg `max_health` per match
    AvgMaxHealthPerMatch,
    /// Sort by the max total `max_health`
    MaxHealth,
    /// Sort by the max `shots_hit` per match
    MaxShotsHitPerMatch,
    /// Sort by the avg `shots_hit` per match
    AvgShotsHitPerMatch,
    /// Sort by the max total `shots_hit`
    ShotsHit,
    /// Sort by the max `shots_missed` per match
    MaxShotsMissedPerMatch,
    /// Sort by the avg `shots_missed` per match
    AvgShotsMissedPerMatch,
    /// Sort by the max total `shots_missed`
    ShotsMissed,
    /// Sort by the max `hero_bullets_hit` per match
    MaxHeroBulletsHitPerMatch,
    /// Sort by the avg `hero_bullets_hit` per match
    AvgHeroBulletsHitPerMatch,
    /// Sort by the max total `hero_bullets_hit`
    HeroBulletsHit,
    /// Sort by the max `hero_bullets_hit_crit` per match
    MaxHeroBulletsHitCritPerMatch,
    /// Sort by the avg `hero_bullets_hit_crit` per match
    AvgHeroBulletsHitCritPerMatch,
    /// Sort by the max total `hero_bullets_hit_crit`
    HeroBulletsHitCrit,
    /// Sort by the max permanent buff (power-up) pickups per match. On the player scoreboard it requires `min_unix_timestamp` or `min_match_id`.
    MaxPermanentBuffsPerMatch,
    /// Sort by the avg permanent buff (power-up) pickups per match. On the player scoreboard it requires `min_unix_timestamp` or `min_match_id`.
    AvgPermanentBuffsPerMatch,
    /// Sort by the total permanent buff (power-up) pickups. On the player scoreboard it requires `min_unix_timestamp` or `min_match_id`.
    PermanentBuffs,
}

/// Only rows of ranked matches after placement carry a rank: `initial_display_rank` stays `0`
/// through placement, so those rows must not contribute.
const RANKED_ROW: &str = "ifNull(player_rank_initial_display_rank, 0) > 0";

/// Rank progress the player ended their latest ranked match on.
fn latest_progress_clause() -> String {
    format!("argMaxIf(player_rank_final_flat_progress, match_id, {RANKED_ROW})")
}

/// Highest rank progress the player ended any ranked match on.
fn peak_progress_clause() -> String {
    format!("maxIf(player_rank_final_flat_progress, {RANKED_ROW})")
}

/// Badge for `progress`, with the Eternus division read from `display_rank` of the same row, and
/// the progress into that badge. The badge is `0` and the progress `NULL` when no grouped row
/// carries a rank; the progress is also `NULL` in Eternus.
fn badge_columns(progress: &str, display_rank: &str) -> RankBadgeColumns {
    let badge = badge_from_flat_progress_sql(
        &format!("assumeNotNull({progress})"),
        &format!("assumeNotNull({display_rank})"),
    );
    let badge_progress = subrank_progress_sql(&format!("assumeNotNull({progress})"));
    RankBadgeColumns {
        badge: format!("if({progress} IS NULL, 0, {badge})"),
        badge_progress: format!("if({progress} IS NULL, NULL, {badge_progress})"),
    }
}

/// `SELECT` expressions for the badge a rank sort's `value` falls in.
pub(super) struct RankBadgeColumns {
    pub(super) badge: String,
    pub(super) badge_progress: String,
}

impl ScoreboardQuerySortBy {
    pub(super) fn get_select_clause(self) -> String {
        let clause = match self {
            // Sorting by progress rather than badge orders players within Eternus by points.
            Self::Rank => return format!("ifNull({}, 0)", latest_progress_clause()),
            Self::PeakRank => return format!("ifNull({}, 0)", peak_progress_clause()),
            Self::MaxPermanentBuffsPerMatch => "max(permanent_buffs)",
            Self::AvgPermanentBuffsPerMatch => "avg(permanent_buffs)",
            Self::PermanentBuffs => "sum(permanent_buffs)",
            Self::Matches => "uniq(match_id)",
            Self::Wins => "countIf(won)",
            Self::Losses => "countIf(not won)",
            Self::Winrate => "countIf(won) / uniq(match_id)",
            Self::MaxKillsPerMatch => "max(kills)",
            Self::AvgKillsPerMatch => "avg(kills)",
            Self::Kills => "sum(kills)",
            Self::MaxDeathsPerMatch => "max(deaths)",
            Self::AvgDeathsPerMatch => "avg(deaths)",
            Self::Deaths => "sum(deaths)",
            Self::MaxDamageTakenPerMatch => "max(max_player_damage_taken)",
            Self::AvgDamageTakenPerMatch => "avg(max_player_damage_taken)",
            Self::DamageTaken => "sum(max_player_damage_taken)",
            Self::MaxAssistsPerMatch => "max(assists)",
            Self::AvgAssistsPerMatch => "avg(assists)",
            Self::Assists => "sum(assists)",
            Self::MaxNetWorthPerMatch => "max(net_worth)",
            Self::AvgNetWorthPerMatch => "avg(net_worth)",
            Self::NetWorth => "sum(net_worth)",
            Self::MaxLastHitsPerMatch => "max(last_hits)",
            Self::AvgLastHitsPerMatch => "avg(last_hits)",
            Self::LastHits => "sum(last_hits)",
            Self::MaxDeniesPerMatch => "max(denies)",
            Self::AvgDeniesPerMatch => "avg(denies)",
            Self::Denies => "sum(denies)",
            Self::MaxPlayerLevelPerMatch => "max(player_level)",
            Self::AvgPlayerLevelPerMatch => "avg(player_level)",
            Self::PlayerLevel => "sum(player_level)",
            Self::MaxCreepKillsPerMatch => "max(max_creep_kills)",
            Self::AvgCreepKillsPerMatch => "avg(max_creep_kills)",
            Self::CreepKills => "sum(max_creep_kills)",
            Self::MaxNeutralKillsPerMatch => "max(max_neutral_kills)",
            Self::AvgNeutralKillsPerMatch => "avg(max_neutral_kills)",
            Self::NeutralKills => "sum(max_neutral_kills)",
            Self::MaxCreepDamagePerMatch => "max(max_creep_damage)",
            Self::AvgCreepDamagePerMatch => "avg(max_creep_damage)",
            Self::CreepDamage => "sum(max_creep_damage)",
            Self::MaxPlayerDamagePerMatch => "max(max_player_damage)",
            Self::AvgPlayerDamagePerMatch => "avg(max_player_damage)",
            Self::PlayerDamage => "sum(max_player_damage)",
            Self::MaxNeutralDamagePerMatch => "max(max_neutral_damage)",
            Self::AvgNeutralDamagePerMatch => "avg(max_neutral_damage)",
            Self::NeutralDamage => "sum(max_neutral_damage)",
            Self::MaxBossDamagePerMatch => "max(max_boss_damage)",
            Self::AvgBossDamagePerMatch => "avg(max_boss_damage)",
            Self::BossDamage => "sum(max_boss_damage)",
            Self::MaxMaxHealthPerMatch => "max(max_max_health)",
            Self::AvgMaxHealthPerMatch => "avg(max_max_health)",
            Self::MaxHealth => "sum(max_max_health)",
            Self::MaxShotsHitPerMatch => "max(max_shots_hit)",
            Self::AvgShotsHitPerMatch => "avg(max_shots_hit)",
            Self::ShotsHit => "sum(max_shots_hit)",
            Self::MaxShotsMissedPerMatch => "max(max_shots_missed)",
            Self::AvgShotsMissedPerMatch => "avg(max_shots_missed)",
            Self::ShotsMissed => "sum(max_shots_missed)",
            Self::MaxHeroBulletsHitPerMatch => "max(max_hero_bullets_hit)",
            Self::AvgHeroBulletsHitPerMatch => "avg(max_hero_bullets_hit)",
            Self::HeroBulletsHit => "sum(max_hero_bullets_hit)",
            Self::MaxHeroBulletsHitCritPerMatch => "max(max_hero_bullets_hit_crit)",
            Self::AvgHeroBulletsHitCritPerMatch => "avg(max_hero_bullets_hit_crit)",
            Self::HeroBulletsHitCrit => "sum(max_hero_bullets_hit_crit)",
        };
        clause.to_owned()
    }

    /// Whether the sort's aggregate ignores duplicate `ReplacingMergeTree` rows, letting
    /// `player_scoreboard` read the base table directly on hero- or account-scoped reads —
    /// skipping the inline `GROUP BY` dedup (~63% less wall time, ~3x less peak memory). Only
    /// `Matches` qualifies: its output is `uniq(match_id)`, and `match_id` is immutable across
    /// row versions. `sum`/`avg`/`max` columns can be corrected downward by a newer version, so
    /// reading raw rows would diverge from `FINAL` — those keep the dedup path. Unscoped reads
    /// use `FINAL` + `count()` regardless, which is exact and cheaper than the raw scan.
    pub(super) fn dedup_free(self) -> bool {
        matches!(self, Self::Matches)
    }

    /// The badge the rank sorts report next to their progress value, `None` for the others.
    pub(super) fn badge_columns(self) -> Option<RankBadgeColumns> {
        match self {
            Self::Rank => Some(badge_columns(
                &latest_progress_clause(),
                &format!("argMaxIf(player_rank_initial_display_rank, match_id, {RANKED_ROW})"),
            )),
            // The Eternus division comes from the row that set the peak.
            Self::PeakRank => Some(badge_columns(
                &peak_progress_clause(),
                &format!(
                    "argMaxIf(player_rank_initial_display_rank, player_rank_final_flat_progress, \
                     {RANKED_ROW})"
                ),
            )),
            _ => None,
        }
    }

    /// Whether the sort reads the player's rank, which heroes do not have.
    pub(super) fn is_rank_sort(self) -> bool {
        matches!(self, Self::Rank | Self::PeakRank)
    }

    /// Whether the sort reads `match_player.permanent_buffs`. The scoreboards' account-scoped
    /// path (`player_match_stats`) has the column too, but only for recent rows, and none of
    /// `match_player`'s projections carries it.
    pub(super) fn is_buff_sort(self) -> bool {
        matches!(
            self,
            Self::MaxPermanentBuffsPerMatch
                | Self::AvgPermanentBuffsPerMatch
                | Self::PermanentBuffs
        )
    }

    /// Columns from `match_player` that must be carried through the per-(`account_id`,
    /// `match_id`) dedup subquery. Empty means the sort only needs `match_id`, which is always
    /// projected. Used by `player_scoreboard` to deduplicate `ReplacingMergeTree` rows without
    /// `FINAL` while still getting correct `sum` / `countIf` aggregates.
    pub(super) fn inner_columns(self) -> &'static [&'static str] {
        match self {
            Self::Matches => &[],
            Self::Rank | Self::PeakRank => &[
                "player_rank_final_flat_progress",
                "player_rank_initial_display_rank",
            ],
            Self::Wins | Self::Losses | Self::Winrate => &["won"],
            Self::MaxKillsPerMatch | Self::AvgKillsPerMatch | Self::Kills => &["kills"],
            Self::MaxDeathsPerMatch | Self::AvgDeathsPerMatch | Self::Deaths => &["deaths"],
            Self::MaxDamageTakenPerMatch | Self::AvgDamageTakenPerMatch | Self::DamageTaken => {
                &["max_player_damage_taken"]
            }
            Self::MaxAssistsPerMatch | Self::AvgAssistsPerMatch | Self::Assists => &["assists"],
            Self::MaxNetWorthPerMatch | Self::AvgNetWorthPerMatch | Self::NetWorth => {
                &["net_worth"]
            }
            Self::MaxLastHitsPerMatch | Self::AvgLastHitsPerMatch | Self::LastHits => {
                &["last_hits"]
            }
            Self::MaxDeniesPerMatch | Self::AvgDeniesPerMatch | Self::Denies => &["denies"],
            Self::MaxPlayerLevelPerMatch | Self::AvgPlayerLevelPerMatch | Self::PlayerLevel => {
                &["player_level"]
            }
            Self::MaxCreepKillsPerMatch | Self::AvgCreepKillsPerMatch | Self::CreepKills => {
                &["max_creep_kills"]
            }
            Self::MaxNeutralKillsPerMatch | Self::AvgNeutralKillsPerMatch | Self::NeutralKills => {
                &["max_neutral_kills"]
            }
            Self::MaxCreepDamagePerMatch | Self::AvgCreepDamagePerMatch | Self::CreepDamage => {
                &["max_creep_damage"]
            }
            Self::MaxPlayerDamagePerMatch | Self::AvgPlayerDamagePerMatch | Self::PlayerDamage => {
                &["max_player_damage"]
            }
            Self::MaxNeutralDamagePerMatch
            | Self::AvgNeutralDamagePerMatch
            | Self::NeutralDamage => &["max_neutral_damage"],
            Self::MaxBossDamagePerMatch | Self::AvgBossDamagePerMatch | Self::BossDamage => {
                &["max_boss_damage"]
            }
            Self::MaxMaxHealthPerMatch | Self::AvgMaxHealthPerMatch | Self::MaxHealth => {
                &["max_max_health"]
            }
            Self::MaxShotsHitPerMatch | Self::AvgShotsHitPerMatch | Self::ShotsHit => {
                &["max_shots_hit"]
            }
            Self::MaxShotsMissedPerMatch | Self::AvgShotsMissedPerMatch | Self::ShotsMissed => {
                &["max_shots_missed"]
            }
            Self::MaxHeroBulletsHitPerMatch
            | Self::AvgHeroBulletsHitPerMatch
            | Self::HeroBulletsHit => &["max_hero_bullets_hit"],
            Self::MaxHeroBulletsHitCritPerMatch
            | Self::AvgHeroBulletsHitCritPerMatch
            | Self::HeroBulletsHitCrit => &["max_hero_bullets_hit_crit"],
            Self::MaxPermanentBuffsPerMatch
            | Self::AvgPermanentBuffsPerMatch
            | Self::PermanentBuffs => &["permanent_buffs"],
        }
    }
}
