use crate::models::enums::{GameMode, MatchMode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MatchMetadata {
    pub match_info: MatchInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MatchInfo {
    pub duration_s: u32,
    pub match_outcome: u8,
    pub winning_team: u8,
    pub players: Vec<Player>,
    pub start_time: u32,
    pub match_id: u64,
    pub legacy_objective_masks: Option<u16>,
    pub match_mode: MatchMode,
    pub game_mode: GameMode,
    pub objectives: Vec<Objective>,
    // pub match_paths: _,
    pub damage_matrix: DamageMatrix,
    pub match_pauses: Vec<MatchPause>,
    pub custom_user_stats: Vec<CustomUserStat>,
    pub watched_death_replays: Vec<WatchedDeathReplays>,
    pub objectives_mask_team0: u16,
    pub objectives_mask_team1: u16,
    pub mid_boss: Vec<MidBoss>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Player {
    pub account_id: u64,
    pub player_slot: u8,
    pub death_details: Vec<DeathDetails>,
    pub items: Vec<Item>,
    pub stats: Vec<Stat>,
    pub team: u8,
    pub kills: u8,
    pub deaths: u8,
    pub assists: u8,
    pub net_worth: u32,
    pub hero_id: u8,
    pub last_hits: u16,
    pub denies: u16,
    pub ability_points: u16,
    pub party: u8,
    pub assigned_lane: u8,
    pub level: u32,
    pub pings: Vec<Ping>,
    pub ability_stats: Vec<AbilityStat>,
    pub stats_type_stat: Vec<f32>,
    // pub book_rewards: Vec<_>,
    pub abandon_match_time_s: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AbilityStat {
    pub ability_id: u64,
    pub ability_value: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Stat {
    pub time_stamp_s: u16,
    pub net_worth: u32,
    pub gold_player: u32,
    pub gold_player_orbs: u32,
    pub gold_lane_creep_orbs: u32,
    pub gold_neutral_creep_orbs: u32,
    pub gold_boss: u32,
    pub gold_boss_orb: u32,
    pub gold_treasure: u32,
    pub gold_denied: u32,
    pub gold_death_loss: u32,
    pub gold_lane_creep: u32,
    pub gold_neutral_creep: u32,
    pub kills: u8,
    pub deaths: u8,
    pub assists: u8,
    pub creep_kills: u16,
    pub neutral_kills: u16,
    pub possible_creeps: u16,
    pub creep_damage: u32,
    pub player_damage: u32,
    pub neutral_damage: u32,
    pub boss_damage: u32,
    pub denies: u16,
    pub player_healing: u32,
    pub ability_points: u16,
    pub self_healing: u32,
    pub player_damage_taken: u32,
    pub max_health: u16,
    pub weapon_power: u16,
    pub tech_power: u16,
    pub shots_hit: u16,
    pub shots_missed: u16,
    pub damage_absorbed: u32,
    pub absorption_provided: u16,
    pub hero_bullets_hit: u16,
    pub hero_bullets_hit_crit: u16,
    pub heal_prevented: u16,
    pub heal_lost: u16,
    pub damage_mitigated: u32,
    pub level: u32,
    pub gold_sources: Vec<GoldSource>,
    pub custom_user_stat: Option<Vec<PlayerCustomUserStat>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PlayerCustomUserStat {
    pub value: u32,
    pub id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GoldSource {
    pub source: u8,
    pub kills: u16,
    pub damage: u32,
    pub gold: u32,
    pub gold_orbs: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DeathDetails {
    pub game_time_s: u16,
    pub killer_player_slot: u8,
    pub death_pos: Position,
    pub killer_pos: Position,
    pub death_duration_s: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Item {
    pub game_time_s: u16,
    pub item_id: u32,
    pub upgrade_id: u64,
    pub sold_time_s: u16,
    pub flags: u8,
    pub imbued_ability_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Position {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Ping {
    pub ping_type: u8,
    pub ping_data: u64,
    pub game_time_s: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct Objective {
    pub legacy_objective_id: Option<u8>,
    pub destroyed_time_s: u16,
    pub creep_damage: u32,
    pub creep_damage_mitigated: u32,
    pub player_damage: u32,
    pub player_damage_mitigated: u32,
    pub first_damage_time_s: u16,
    pub team_objective_id: u8,
    pub team: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DamageMatrix {
    pub damage_dealers: Vec<DamageDealer>,
    pub sample_time_s: Vec<u16>,
    pub source_details: SourceDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DamageDealer {
    pub dealer_player_slot: u8,
    pub damage_sources: Vec<DamageSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DamageSource {
    pub damage_to_players: Vec<DamageToPlayer>,
    pub source_details_index: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DamageToPlayer {
    pub target_player_slot: u8,
    pub damage: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SourceDetails {
    pub stat_type: Vec<u8>,
    pub source_name: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MatchPause {
    pub game_time_s: u16,
    pub pause_duration_s: u16,
    pub player_slot: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CustomUserStat {
    pub name: String,
    pub id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct WatchedDeathReplays {
    pub game_time_s: u16,
    pub player_slot: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MidBoss {
    pub team_killed: u32,
    pub team_claimed: u32,
    pub destroyed_time_s: u32,
}
