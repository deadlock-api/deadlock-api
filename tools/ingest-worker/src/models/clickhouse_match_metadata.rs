use crate::models::enums::{GameMode, MatchMode, MatchOutcome, Objective, Team};
use clickhouse::Row;
use serde::Serialize;
use valveprotos::deadlock::c_msg_match_meta_data_contents::MatchInfo;
use valveprotos::deadlock::c_msg_match_meta_data_contents::Players;

#[derive(Row, Debug, Serialize)]
pub struct ClickhouseMatchInfo {
    pub match_id: u64,
    pub start_time: u32,
    pub winning_team: Team,
    pub duration_s: u32,
    pub match_outcome: MatchOutcome,
    pub match_mode: MatchMode,
    pub game_mode: GameMode,
    pub sample_time_s: Vec<u32>,
    pub stat_type: Vec<i32>,
    pub source_name: Vec<String>,
    pub objectives_mask_team0: u16,
    pub objectives_mask_team1: u16,
    #[serde(rename = "objectives.destroyed_time_s")]
    pub objectives_destroyed_time_s: Vec<u32>,
    #[serde(rename = "objectives.creep_damage")]
    pub objectives_creep_damage: Vec<u32>,
    #[serde(rename = "objectives.creep_damage_mitigated")]
    pub objectives_creep_damage_mitigated: Vec<u32>,
    #[serde(rename = "objectives.player_damage")]
    pub objectives_player_damage: Vec<u32>,
    #[serde(rename = "objectives.player_damage_mitigated")]
    pub objectives_player_damage_mitigated: Vec<u32>,
    #[serde(rename = "objectives.first_damage_time_s")]
    pub objectives_first_damage_time_s: Vec<u32>,
    #[serde(rename = "objectives.team_objective")]
    pub objectives_team_objective: Vec<Objective>,
    #[serde(rename = "objectives.team")]
    pub objectives_team: Vec<Team>,
    #[serde(rename = "mid_boss.team_killed")]
    pub mid_boss_team_killed: Vec<Team>,
    #[serde(rename = "mid_boss.team_claimed")]
    pub mid_boss_team_claimed: Vec<Team>,
    #[serde(rename = "mid_boss.destroyed_time_s")]
    pub mid_boss_destroyed_time_s: Vec<u32>,
}

impl From<MatchInfo> for ClickhouseMatchInfo {
    fn from(value: MatchInfo) -> Self {
        Self {
            match_id: value.match_id(),
            duration_s: value.duration_s(),
            match_outcome: MatchOutcome::from(value.match_outcome()),
            winning_team: Team::from(value.winning_team()),
            start_time: value.start_time(),
            game_mode: GameMode::from(value.game_mode()),
            match_mode: MatchMode::from(value.match_mode()),
            objectives_destroyed_time_s: value
                .objectives
                .iter()
                .map(|v| v.destroyed_time_s())
                .collect(),
            objectives_creep_damage: value.objectives.iter().map(|v| v.creep_damage()).collect(),
            objectives_creep_damage_mitigated: value
                .objectives
                .iter()
                .map(|v| v.creep_damage_mitigated())
                .collect(),
            objectives_player_damage: value.objectives.iter().map(|v| v.player_damage()).collect(),
            objectives_player_damage_mitigated: value
                .objectives
                .iter()
                .map(|v| v.player_damage_mitigated())
                .collect(),
            objectives_first_damage_time_s: value
                .objectives
                .iter()
                .map(|v| v.first_damage_time_s())
                .collect(),
            objectives_team_objective: value
                .objectives
                .iter()
                .map(|v| v.team_objective_id())
                .map(Objective::from)
                .collect(),
            objectives_team: value
                .objectives
                .iter()
                .map(|v| v.team())
                .map(Team::from)
                .collect(),
            sample_time_s: value
                .damage_matrix
                .as_ref()
                .map(|v| v.clone().sample_time_s)
                .unwrap_or_default(),
            stat_type: value
                .damage_matrix
                .as_ref()
                .map(|v| v.clone().source_details.unwrap().stat_type)
                .unwrap_or_default(),
            source_name: value
                .damage_matrix
                .as_ref()
                .map(|v| v.clone().source_details.unwrap().source_name)
                .unwrap_or_default(),
            objectives_mask_team0: value.objectives_mask_team0() as u16,
            objectives_mask_team1: value.objectives_mask_team1() as u16,
            mid_boss_team_killed: value
                .mid_boss
                .iter()
                .map(|v| v.team_killed())
                .map(Team::from)
                .collect(),
            mid_boss_team_claimed: value
                .mid_boss
                .iter()
                .map(|v| v.team_claimed())
                .map(Team::from)
                .collect(),
            mid_boss_destroyed_time_s: value
                .mid_boss
                .iter()
                .map(|v| v.destroyed_time_s())
                .collect(),
        }
    }
}

#[derive(Row, Debug, Serialize)]
pub struct ClickhouseMatchPlayer {
    pub match_id: u64,
    pub account_id: u32,
    pub player_slot: u32,
    pub team: Team,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub net_worth: u32,
    pub hero_id: u32,
    pub last_hits: u32,
    pub denies: u32,
    pub ability_points: u32,
    pub party: u32,
    pub assigned_lane: u32,
    pub player_level: u32,
    pub abandon_match_time_s: u32,
    pub ability_stats: Vec<(i64, i64)>,
    pub stats_type_stat: Vec<f32>,
    #[serde(rename = "book_reward.book_id")]
    pub book_reward_book_id: Vec<u32>,
    #[serde(rename = "book_reward.xp_amount")]
    pub book_reward_xp_amount: Vec<u32>,
    #[serde(rename = "book_reward.starting_xp")]
    pub book_reward_starting_xp: Vec<u32>,
    #[serde(rename = "death_details.game_time_s")]
    pub death_details_game_time_s: Vec<u32>,
    #[serde(rename = "death_details.killer_player_slot")]
    pub death_details_killer_player_slot: Vec<u32>,
    #[serde(rename = "death_details.death_pos")]
    pub death_details_death_pos: Vec<(f32, f32, f32)>,
    #[serde(rename = "death_details.killer_pos")]
    pub death_details_killer_pos: Vec<(f32, f32, f32)>,
    #[serde(rename = "death_details.death_duration_s")]
    pub death_details_death_duration_s: Vec<u32>,
    #[serde(rename = "items.game_time_s")]
    pub items_game_time_s: Vec<u32>,
    #[serde(rename = "items.item_id")]
    pub items_item_id: Vec<u32>,
    #[serde(rename = "items.upgrade_id")]
    pub items_upgrade_id: Vec<u32>,
    #[serde(rename = "items.sold_time_s")]
    pub items_sold_time_s: Vec<u32>,
    #[serde(rename = "items.flags")]
    pub items_flags: Vec<u32>,
    #[serde(rename = "items.imbued_ability_id")]
    pub items_imbued_ability_id: Vec<u32>,
    #[serde(rename = "stats.time_stamp_s")]
    pub stats_time_stamp_s: Vec<u32>,
    #[serde(rename = "stats.net_worth")]
    pub stats_net_worth: Vec<u32>,
    #[serde(rename = "stats.gold_player")]
    pub stats_gold_player: Vec<u32>,
    #[serde(rename = "stats.gold_player_orbs")]
    pub stats_gold_player_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_lane_creep_orbs")]
    pub stats_gold_lane_creep_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_neutral_creep_orbs")]
    pub stats_gold_neutral_creep_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_boss")]
    pub stats_gold_boss: Vec<u32>,
    #[serde(rename = "stats.gold_boss_orb")]
    pub stats_gold_boss_orb: Vec<u32>,
    #[serde(rename = "stats.gold_treasure")]
    pub stats_gold_treasure: Vec<u32>,
    #[serde(rename = "stats.gold_denied")]
    pub stats_gold_denied: Vec<u32>,
    #[serde(rename = "stats.gold_death_loss")]
    pub stats_gold_death_loss: Vec<u32>,
    #[serde(rename = "stats.gold_lane_creep")]
    pub stats_gold_lane_creep: Vec<u32>,
    #[serde(rename = "stats.gold_neutral_creep")]
    pub stats_gold_neutral_creep: Vec<u32>,
    #[serde(rename = "stats.kills")]
    pub stats_kills: Vec<u32>,
    #[serde(rename = "stats.deaths")]
    pub stats_deaths: Vec<u32>,
    #[serde(rename = "stats.assists")]
    pub stats_assists: Vec<u32>,
    #[serde(rename = "stats.creep_kills")]
    pub stats_creep_kills: Vec<u32>,
    #[serde(rename = "stats.neutral_kills")]
    pub stats_neutral_kills: Vec<u32>,
    #[serde(rename = "stats.possible_creeps")]
    pub stats_possible_creeps: Vec<u32>,
    #[serde(rename = "stats.creep_damage")]
    pub stats_creep_damage: Vec<u32>,
    #[serde(rename = "stats.player_damage")]
    pub stats_player_damage: Vec<u32>,
    #[serde(rename = "stats.neutral_damage")]
    pub stats_neutral_damage: Vec<u32>,
    #[serde(rename = "stats.boss_damage")]
    pub stats_boss_damage: Vec<u32>,
    #[serde(rename = "stats.denies")]
    pub stats_denies: Vec<u32>,
    #[serde(rename = "stats.player_healing")]
    pub stats_player_healing: Vec<u32>,
    #[serde(rename = "stats.ability_points")]
    pub stats_ability_points: Vec<u32>,
    #[serde(rename = "stats.self_healing")]
    pub stats_self_healing: Vec<u32>,
    #[serde(rename = "stats.player_damage_taken")]
    pub stats_player_damage_taken: Vec<u32>,
    #[serde(rename = "stats.max_health")]
    pub stats_max_health: Vec<u32>,
    #[serde(rename = "stats.weapon_power")]
    pub stats_weapon_power: Vec<u32>,
    #[serde(rename = "stats.tech_power")]
    pub stats_tech_power: Vec<u32>,
    #[serde(rename = "stats.shots_hit")]
    pub stats_shots_hit: Vec<u32>,
    #[serde(rename = "stats.shots_missed")]
    pub stats_shots_missed: Vec<u32>,
    #[serde(rename = "stats.damage_absorbed")]
    pub stats_damage_absorbed: Vec<u32>,
    #[serde(rename = "stats.absorption_provided")]
    pub stats_absorption_provided: Vec<u32>,
    #[serde(rename = "stats.hero_bullets_hit")]
    pub stats_hero_bullets_hit: Vec<u32>,
    #[serde(rename = "stats.hero_bullets_hit_crit")]
    pub stats_hero_bullets_hit_crit: Vec<u32>,
    #[serde(rename = "stats.heal_prevented")]
    pub stats_heal_prevented: Vec<u32>,
    #[serde(rename = "stats.heal_lost")]
    pub stats_heal_lost: Vec<u32>,
    #[serde(rename = "stats.damage_mitigated")]
    pub stats_damage_mitigated: Vec<u32>,
    #[serde(rename = "stats.level")]
    pub stats_level: Vec<u32>,
}

impl From<(u64, Players)> for ClickhouseMatchPlayer {
    fn from((match_id, value): (u64, Players)) -> Self {
        Self {
            match_id,
            account_id: value.account_id(),
            player_slot: value.player_slot(),
            death_details_game_time_s: value
                .death_details
                .iter()
                .map(|v| v.game_time_s())
                .collect(),
            death_details_killer_player_slot: value
                .death_details
                .iter()
                .map(|v| v.killer_player_slot())
                .collect(),
            death_details_death_pos: value
                .death_details
                .iter()
                .map(|v| {
                    (
                        v.death_pos.unwrap().x(),
                        v.death_pos.unwrap().y(),
                        v.death_pos.unwrap().z(),
                    )
                })
                .collect(),
            death_details_killer_pos: value
                .death_details
                .iter()
                .map(|v| {
                    (
                        v.killer_pos.unwrap().x(),
                        v.killer_pos.unwrap().y(),
                        v.killer_pos.unwrap().z(),
                    )
                })
                .collect(),
            death_details_death_duration_s: value
                .death_details
                .iter()
                .map(|v| v.death_duration_s())
                .collect(),
            items_game_time_s: value.items.iter().map(|v| v.game_time_s()).collect(),
            items_item_id: value.items.iter().map(|v| v.item_id()).collect(),
            items_upgrade_id: value.items.iter().map(|v| v.upgrade_id()).collect(),
            items_sold_time_s: value.items.iter().map(|v| v.sold_time_s()).collect(),
            items_flags: value.items.iter().map(|v| v.flags()).collect(),
            items_imbued_ability_id: value.items.iter().map(|v| v.imbued_ability_id()).collect(),
            stats_time_stamp_s: value.stats.iter().map(|v| v.time_stamp_s()).collect(),
            stats_net_worth: value.stats.iter().map(|v| v.net_worth()).collect(),
            stats_gold_player: value.stats.iter().map(|v| v.gold_player()).collect(),
            stats_gold_player_orbs: value.stats.iter().map(|v| v.gold_player_orbs()).collect(),
            stats_gold_lane_creep_orbs: value
                .stats
                .iter()
                .map(|v| v.gold_lane_creep_orbs())
                .collect(),
            stats_gold_neutral_creep_orbs: value
                .stats
                .iter()
                .map(|v| v.gold_neutral_creep_orbs())
                .collect(),
            stats_gold_boss: value.stats.iter().map(|v| v.gold_boss()).collect(),
            stats_gold_boss_orb: value.stats.iter().map(|v| v.gold_boss_orb()).collect(),
            stats_gold_treasure: value.stats.iter().map(|v| v.gold_treasure()).collect(),
            stats_gold_denied: value.stats.iter().map(|v| v.gold_denied()).collect(),
            stats_gold_death_loss: value.stats.iter().map(|v| v.gold_death_loss()).collect(),
            stats_gold_lane_creep: value.stats.iter().map(|v| v.gold_lane_creep()).collect(),
            stats_gold_neutral_creep: value.stats.iter().map(|v| v.gold_neutral_creep()).collect(),
            stats_kills: value.stats.iter().map(|v| v.kills()).collect(),
            stats_deaths: value.stats.iter().map(|v| v.deaths()).collect(),
            stats_assists: value.stats.iter().map(|v| v.assists()).collect(),
            stats_creep_kills: value.stats.iter().map(|v| v.creep_kills()).collect(),
            stats_neutral_kills: value.stats.iter().map(|v| v.neutral_kills()).collect(),
            stats_possible_creeps: value.stats.iter().map(|v| v.possible_creeps()).collect(),
            stats_creep_damage: value.stats.iter().map(|v| v.creep_damage()).collect(),
            stats_player_damage: value.stats.iter().map(|v| v.player_damage()).collect(),
            stats_neutral_damage: value.stats.iter().map(|v| v.neutral_damage()).collect(),
            stats_boss_damage: value.stats.iter().map(|v| v.boss_damage()).collect(),
            stats_denies: value.stats.iter().map(|v| v.denies()).collect(),
            stats_player_healing: value.stats.iter().map(|v| v.player_healing()).collect(),
            stats_ability_points: value.stats.iter().map(|v| v.ability_points()).collect(),
            stats_self_healing: value.stats.iter().map(|v| v.self_healing()).collect(),
            stats_player_damage_taken: value
                .stats
                .iter()
                .map(|v| v.player_damage_taken())
                .collect(),
            stats_max_health: value.stats.iter().map(|v| v.max_health()).collect(),
            stats_weapon_power: value.stats.iter().map(|v| v.weapon_power()).collect(),
            stats_tech_power: value.stats.iter().map(|v| v.tech_power()).collect(),
            stats_shots_hit: value.stats.iter().map(|v| v.shots_hit()).collect(),
            stats_shots_missed: value.stats.iter().map(|v| v.shots_missed()).collect(),
            stats_damage_absorbed: value.stats.iter().map(|v| v.damage_absorbed()).collect(),
            stats_absorption_provided: value
                .stats
                .iter()
                .map(|v| v.absorption_provided())
                .collect(),
            stats_hero_bullets_hit: value.stats.iter().map(|v| v.hero_bullets_hit()).collect(),
            stats_hero_bullets_hit_crit: value
                .stats
                .iter()
                .map(|v| v.hero_bullets_hit_crit())
                .collect(),
            stats_heal_prevented: value.stats.iter().map(|v| v.heal_prevented()).collect(),
            stats_heal_lost: value.stats.iter().map(|v| v.heal_lost()).collect(),
            stats_damage_mitigated: value.stats.iter().map(|v| v.damage_mitigated()).collect(),
            stats_level: value.stats.iter().map(|v| v.level()).collect(),
            team: Team::from(value.team()),
            kills: value.kills(),
            deaths: value.deaths(),
            assists: value.assists(),
            net_worth: value.net_worth(),
            hero_id: value.hero_id(),
            last_hits: value.last_hits(),
            denies: value.denies(),
            ability_points: value.ability_points(),
            party: value.party(),
            assigned_lane: value.assigned_lane(),
            player_level: value.level(),
            ability_stats: value
                .ability_stats
                .iter()
                .map(|v| (v.ability_id() as i64, v.ability_value() as i64))
                .collect(),
            stats_type_stat: value.stats_type_stat.clone(),
            book_reward_starting_xp: value.book_rewards.iter().map(|v| v.starting_xp()).collect(),
            book_reward_xp_amount: value.book_rewards.iter().map(|v| v.xp_amount()).collect(),
            book_reward_book_id: value.book_rewards.iter().map(|v| v.book_id()).collect(),
            abandon_match_time_s: value.abandon_match_time_s(),
        }
    }
}
