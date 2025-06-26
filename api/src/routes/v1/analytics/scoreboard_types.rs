use serde::Deserialize;
use strum_macros::Display;
use utoipa::ToSchema;

#[derive(Copy, Clone, Debug, Deserialize, ToSchema, Display, Eq, PartialEq, Hash, Default)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum ScoreboardQuerySortBy {
    /// Sort by the number of matches
    #[default]
    Matches,
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
}

impl ScoreboardQuerySortBy {
    pub(super) fn get_select_clause(&self) -> &'static str {
        match self {
            Self::Matches => "count(distinct match_id)",
            Self::Wins => "sum(won)",
            Self::Losses => "sum(not won)",
            Self::Winrate => "sum(won) / count(distinct match_id)",
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
        }
    }
}
