//! GraphQL output types for the `match_player` table.
//!
//! Every supported column is exposed as an `Option<T>` field. The resolver
//! projects only the GraphQL-requested fields into the underlying SQL SELECT,
//! so absent fields deserialize to `None` and are omitted from the response.
//!
//! Nested (`Nested(...)`) and `Map(...)` columns are surfaced as a JSON scalar
//! passthrough — clients still get column-level projection (the SELECT only
//! includes the requested column) without us having to model dozens of nested
//! `ClickHouse` types as GraphQL objects in v1.
#![allow(clippy::struct_field_names)]

use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};

/// Generic JSON scalar used for `ClickHouse` Nested / Map / Array columns that
/// would otherwise need bespoke GraphQL types.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(super) struct JsonScalar(pub serde_json::Value);

async_graphql::scalar!(JsonScalar);

#[derive(Clone, Debug, Default, Deserialize, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct Match {
    // Identity / schedule
    pub(super) match_id: Option<u64>,
    pub(super) start_time: Option<i64>,
    pub(super) duration_s: Option<u32>,

    // Match classification
    pub(super) match_mode: Option<String>,
    pub(super) game_mode: Option<String>,
    pub(super) game_mode_version: Option<u32>,
    pub(super) bot_difficulty: Option<String>,

    // Outcome
    pub(super) winning_team: Option<String>,
    pub(super) match_outcome: Option<String>,

    // Badge / matchmaking
    pub(super) average_badge_team_0: Option<u32>,
    pub(super) average_badge_team_1: Option<u32>,
    pub(super) is_high_skill_range_parties: Option<bool>,
    pub(super) low_pri_pool: Option<bool>,
    pub(super) new_player_pool: Option<bool>,
    pub(super) not_scored: Option<bool>,

    // Misc match flags / stats
    pub(super) rewards_eligible: Option<bool>,
    pub(super) earned_holiday_award_2025: Option<bool>,
    pub(super) objectives_mask_team_0: Option<u32>,
    pub(super) objectives_mask_team_1: Option<u32>,

    // JSON passthrough for complex columns
    #[graphql(complexity = 50)]
    pub(super) team_score: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) match_tracked_stats: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) team_0_tracked_stats: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) team_1_tracked_stats: Option<JsonScalar>,
    #[graphql(complexity = 100)]
    pub(super) objectives: Option<JsonScalar>,
    #[graphql(complexity = 100)]
    pub(super) mid_boss: Option<JsonScalar>,
    #[graphql(complexity = 100)]
    pub(super) street_brawl_rounds: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) banned_hero_ids: Option<JsonScalar>,
    pub(super) first_mid_boss_time_s: Option<u32>,
    pub(super) first_objective_destroyed_time_s: Option<u32>,

    #[graphql(complexity = "50 + 5 * child_complexity")]
    pub(super) players: Option<Vec<MatchPlayer>>,
}

#[derive(Clone, Debug, Default, Deserialize, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct MatchPlayer {
    // Identity
    pub(super) match_id: Option<u64>,
    pub(super) account_id: Option<u32>,
    pub(super) player_slot: Option<u32>,
    pub(super) team: Option<String>,
    pub(super) hero_id: Option<u32>,
    pub(super) party: Option<u32>,
    pub(super) assigned_lane: Option<u32>,

    // Match-level (denormalized on match_player)
    pub(super) start_time: Option<i64>,
    pub(super) duration_s: Option<u32>,
    pub(super) match_mode: Option<String>,
    pub(super) game_mode: Option<String>,
    pub(super) winning_team: Option<String>,
    pub(super) match_outcome: Option<String>,
    pub(super) average_badge_team_0: Option<u32>,
    pub(super) average_badge_team_1: Option<u32>,

    // Core combat stats
    pub(super) kills: Option<u32>,
    pub(super) deaths: Option<u32>,
    pub(super) assists: Option<u32>,
    pub(super) net_worth: Option<u32>,
    pub(super) last_hits: Option<u32>,
    pub(super) denies: Option<u32>,
    pub(super) ability_points: Option<u32>,
    pub(super) player_level: Option<u32>,
    pub(super) abandon_match_time_s: Option<u32>,
    pub(super) mvp_rank: Option<u32>,

    // Materialized maxima
    pub(super) max_level: Option<u32>,
    pub(super) max_player_damage: Option<u32>,
    pub(super) max_player_damage_taken: Option<u32>,
    pub(super) max_boss_damage: Option<u32>,
    pub(super) max_creep_damage: Option<u32>,
    pub(super) max_creep_kills: Option<u32>,
    pub(super) max_neutral_kills: Option<u32>,
    pub(super) max_neutral_damage: Option<u32>,
    pub(super) max_max_health: Option<u32>,
    pub(super) max_hero_bullets_hit: Option<u32>,
    pub(super) max_hero_bullets_hit_crit: Option<u32>,
    pub(super) max_shots_hit: Option<u32>,
    pub(super) max_shots_missed: Option<u32>,

    // Player-level flags
    pub(super) rewards_eligible: Option<bool>,
    pub(super) earned_holiday_award_2025: Option<bool>,

    // Demo-derived
    pub(super) hero_build_id: Option<u32>,

    #[graphql(complexity = "20 + 5 * child_complexity")]
    pub(super) items: Option<Vec<Item>>,
    #[graphql(complexity = "20 + 5 * child_complexity")]
    pub(super) stats: Option<Vec<Stat>>,
    #[graphql(complexity = 100)]
    pub(super) death_details: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) accolades: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) book_reward: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) power_up_buffs: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) ability_stats: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) player_tracked_stats: Option<JsonScalar>,
    #[graphql(complexity = 50)]
    pub(super) stats_type_stat: Option<JsonScalar>,
}

#[derive(Clone, Debug, Default, Deserialize, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct Item {
    pub(super) game_time_s: Option<u32>,
    pub(super) item_id: Option<u32>,
    pub(super) upgrade_id: Option<u32>,
    pub(super) sold_time_s: Option<u32>,
    pub(super) flags: Option<u32>,
    pub(super) imbued_ability_id: Option<u32>,
}

#[derive(Clone, Debug, Default, Deserialize, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct Stat {
    pub(super) time_stamp_s: Option<u32>,
    pub(super) net_worth: Option<u32>,
    pub(super) gold_player: Option<u32>,
    pub(super) gold_player_orbs: Option<u32>,
    pub(super) gold_lane_creep_orbs: Option<u32>,
    pub(super) gold_neutral_creep_orbs: Option<u32>,
    pub(super) gold_boss: Option<u32>,
    pub(super) gold_boss_orb: Option<u32>,
    pub(super) gold_treasure: Option<u32>,
    pub(super) gold_denied: Option<u32>,
    pub(super) gold_death_loss: Option<u32>,
    pub(super) gold_lane_creep: Option<u32>,
    pub(super) gold_neutral_creep: Option<u32>,
    pub(super) kills: Option<u32>,
    pub(super) deaths: Option<u32>,
    pub(super) assists: Option<u32>,
    pub(super) creep_kills: Option<u32>,
    pub(super) neutral_kills: Option<u32>,
    pub(super) possible_creeps: Option<u32>,
    pub(super) creep_damage: Option<u32>,
    pub(super) player_damage: Option<u32>,
    pub(super) neutral_damage: Option<u32>,
    pub(super) boss_damage: Option<u32>,
    pub(super) denies: Option<u32>,
    pub(super) player_healing: Option<u32>,
    pub(super) ability_points: Option<u32>,
    pub(super) self_healing: Option<u32>,
    pub(super) player_damage_taken: Option<u32>,
    pub(super) max_health: Option<u32>,
    pub(super) weapon_power: Option<u32>,
    pub(super) tech_power: Option<u32>,
    pub(super) shots_hit: Option<u32>,
    pub(super) shots_missed: Option<u32>,
    pub(super) damage_absorbed: Option<u32>,
    pub(super) absorption_provided: Option<u32>,
    pub(super) hero_bullets_hit: Option<u32>,
    pub(super) hero_bullets_hit_crit: Option<u32>,
    pub(super) heal_prevented: Option<u32>,
    pub(super) heal_lost: Option<u32>,
    pub(super) damage_mitigated: Option<u32>,
    pub(super) level: Option<u32>,
    pub(super) player_barriering: Option<u32>,
    pub(super) teammate_healing: Option<u32>,
    pub(super) teammate_barriering: Option<u32>,
}
