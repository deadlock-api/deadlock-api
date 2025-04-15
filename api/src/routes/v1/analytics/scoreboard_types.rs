use derive_more::Display;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Copy, Clone, Debug, Serialize, Deserialize, ToSchema, Display, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ScoreboardQuerySortBy {
    /// Sort by the number of matches
    #[display("matches")]
    Matches,
    /// Sort by the number of wins
    #[display("wins")]
    Wins,
    /// Sort by the number of losses
    #[display("losses")]
    Losses,
    /// Sort by the winrate
    #[display("winrate")]
    Winrate,
    /// Sort by the max kills per match
    #[display("max_kills_per_match")]
    MaxKillsPerMatch,
    /// Sort by the avg kills per match
    #[display("avg_kills_per_match")]
    AvgKillsPerMatch,
    /// Sort by the max total kills
    #[display("kills")]
    Kills,
    /// Sort by the max deaths per match
    #[display("max_deaths_per_match")]
    MaxDeathsPerMatch,
    /// Sort by the avg deaths per match
    #[display("avg_deaths_per_match")]
    AvgDeathsPerMatch,
    /// Sort by the max total deaths
    #[display("deaths")]
    Deaths,
    /// Sort by the max damage per match
    #[display("max_damage_per_match")]
    MaxDamagePerMatch,
    /// Sort by the avg damage per match
    #[display("avg_damage_per_match")]
    AvgDamagePerMatch,
    /// Sort by the max total damage
    #[display("damage")]
    Damage,
    /// Sort by the max damage taken per match
    #[display("max_damage_taken_per_match")]
    MaxDamageTakenPerMatch,
    /// Sort by the avg damage taken per match
    #[display("avg_damage_taken_per_match")]
    AvgDamageTakenPerMatch,
    /// Sort by the max total damage taken
    #[display("damage_taken")]
    DamageTaken,
    /// Sort by the max assists per match
    #[display("max_assists_per_match")]
    MaxAssistsPerMatch,
    /// Sort by the avg assists per match
    #[display("avg_assists_per_match")]
    AvgAssistsPerMatch,
    /// Sort by the max total assists
    #[display("assists")]
    Assists,
    /// Sort by the max net_worth per match
    #[display("max_net_worth_per_match")]
    MaxNetWorthPerMatch,
    /// Sort by the avg net_worth per match
    #[display("avg_net_worth_per_match")]
    AvgNetWorthPerMatch,
    /// Sort by the max total net_worth
    #[display("net_worth")]
    NetWorth,
    /// Sort by the max last_hits per match
    #[display("max_last_hits_per_match")]
    MaxLastHitsPerMatch,
    /// Sort by the avg last_hits per match
    #[display("avg_last_hits_per_match")]
    AvgLastHitsPerMatch,
    /// Sort by the max total last_hits
    #[display("last_hits")]
    LastHits,
    /// Sort by the max denies per match
    #[display("max_denies_per_match")]
    MaxDeniesPerMatch,
    /// Sort by the avg denies per match
    #[display("avg_denies_per_match")]
    AvgDeniesPerMatch,
    /// Sort by the max total denies
    #[display("denies")]
    Denies,
    /// Sort by the max player_level per match
    #[display("max_player_level_per_match")]
    MaxPlayerLevelPerMatch,
    /// Sort by the avg player_level per match
    #[display("avg_player_level_per_match")]
    AvgPlayerLevelPerMatch,
    /// Sort by the max total player_level
    #[display("player_level")]
    PlayerLevel,
    /// Sort by the max creep_kills per match
    #[display("max_creep_kills_per_match")]
    MaxCreepKillsPerMatch,
    /// Sort by the avg creep_kills per match
    AvgCreepKillsPerMatch,
    /// Sort by the max total creep_kills
    #[display("creep_kills")]
    CreepKills,
    /// Sort by the max neutral_kills per match
    #[display("max_neutral_kills_per_match")]
    MaxNeutralKillsPerMatch,
    /// Sort by the avg neutral_kills per match
    #[display("avg_neutral_kills_per_match")]
    AvgNeutralKillsPerMatch,
    /// Sort by the max total neutral_kills
    #[display("neutral_kills")]
    NeutralKills,
    /// Sort by the max creep_damage per match
    #[display("max_creep_damage_per_match")]
    MaxCreepDamagePerMatch,
    /// Sort by the avg creep_damage per match
    #[display("avg_creep_damage_per_match")]
    AvgCreepDamagePerMatch,
    /// Sort by the max total creep_damage
    #[display("creep_damage")]
    CreepDamage,
    /// Sort by the max player_damage per match
    #[display("max_player_damage_per_match")]
    MaxPlayerDamagePerMatch,
    /// Sort by the avg player_damage per match
    #[display("avg_player_damage_per_match")]
    AvgPlayerDamagePerMatch,
    /// Sort by the max total player_damage
    #[display("player_damage")]
    PlayerDamage,
    /// Sort by the max neutral_damage per match
    #[display("max_neutral_damage_per_match")]
    MaxNeutralDamagePerMatch,
    /// Sort by the avg neutral_damage per match
    #[display("avg_neutral_damage_per_match")]
    AvgNeutralDamagePerMatch,
    /// Sort by the max total neutral_damage
    #[display("neutral_damage")]
    NeutralDamage,
    /// Sort by the max boss_damage per match
    #[display("max_boss_damage_per_match")]
    MaxBossDamagePerMatch,
    /// Sort by the avg boss_damage per match
    #[display("avg_boss_damage_per_match")]
    AvgBossDamagePerMatch,
    /// Sort by the max total boss_damage
    #[display("boss_damage")]
    BossDamage,
}

impl ScoreboardQuerySortBy {
    pub fn get_select_clause(&self) -> &'static str {
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
            Self::MaxDamagePerMatch => "max(arrayMax(stats.player_damage))",
            Self::AvgDamagePerMatch => "avg(arrayMax(stats.player_damage))",
            Self::Damage => "sum(arrayMax(stats.player_damage))",
            Self::MaxDamageTakenPerMatch => "max(arrayMax(stats.player_damage_taken))",
            Self::AvgDamageTakenPerMatch => "avg(arrayMax(stats.player_damage_taken))",
            Self::DamageTaken => "sum(arrayMax(stats.player_damage_taken))",
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
            Self::MaxCreepKillsPerMatch => "max(arrayMax(stats.creep_kills))",
            Self::AvgCreepKillsPerMatch => "avg(arrayMax(stats.creep_kills))",
            Self::CreepKills => "sum(arrayMax(stats.creep_kills))",
            Self::MaxNeutralKillsPerMatch => "max(arrayMax(stats.neutral_kills))",
            Self::AvgNeutralKillsPerMatch => "avg(arrayMax(stats.neutral_kills))",
            Self::NeutralKills => "sum(arrayMax(stats.neutral_kills))",
            Self::MaxCreepDamagePerMatch => "max(arrayMax(stats.creep_damage))",
            Self::AvgCreepDamagePerMatch => "avg(arrayMax(stats.creep_damage))",
            Self::CreepDamage => "sum(arrayMax(stats.creep_damage))",
            Self::MaxPlayerDamagePerMatch => "max(arrayMax(stats.player_damage))",
            Self::AvgPlayerDamagePerMatch => "avg(arrayMax(stats.player_damage))",
            Self::PlayerDamage => "sum(arrayMax(stats.player_damage))",
            Self::MaxNeutralDamagePerMatch => "max(arrayMax(stats.neutral_damage))",
            Self::AvgNeutralDamagePerMatch => "avg(arrayMax(stats.neutral_damage))",
            Self::NeutralDamage => "sum(arrayMax(stats.neutral_damage))",
            Self::MaxBossDamagePerMatch => "max(arrayMax(stats.boss_damage))",
            Self::AvgBossDamagePerMatch => "avg(arrayMax(stats.boss_damage))",
            Self::BossDamage => "sum(arrayMax(stats.boss_damage))",
        }
    }
}
