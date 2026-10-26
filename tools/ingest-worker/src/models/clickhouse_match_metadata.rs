use clickhouse::Row;
use serde::Serialize;
use std::io::Read;

use prost::Message;
use tracing::warn;
use valveprotos::deadlock::c_msg_match_hero_release_votes::HeroVote;
use valveprotos::deadlock::c_msg_match_meta_data_contents::{
    BookReward, CustomUserStat, Deaths, EGoldSource, GoldSource, Items, MatchInfo, MidBoss,
    Objective as ProtoObjective, PlayerAccolade, PlayerStats, Players, PowerUpBuff,
    StreetBrawlRound,
};
use valveprotos::deadlock::{
    CMsgHeroXpGrant, CMsgMatchHeroReleaseVotes, EMatchMetadataExtraMessage,
};

use crate::models::enums::{
    BotDifficulty, GameMode, HeroReleaseVoteCategory, HeroXpGrantReason, MatchMode, MatchOutcome,
    Objective, PlayerMatchOutcome, RankedType, Team,
};

#[derive(Row, Debug, Clone, Serialize)]
pub(crate) struct ClickhouseMatchPlayer {
    pub match_id: u64,
    pub start_time: u32,
    pub duration_s: u32,
    pub match_mode: MatchMode,
    pub game_mode: GameMode,
    pub average_badge_team0: Option<u32>,
    pub average_badge_team1: Option<u32>,
    pub average_badge: Option<u32>,
    pub winning_team: Team,
    pub match_outcome: MatchOutcome,
    pub bot_difficulty: BotDifficulty,
    pub objectives_mask_team0: u16,
    pub objectives_mask_team1: u16,
    pub is_high_skill_range_parties: Option<bool>,
    pub low_pri_pool: Option<bool>,
    pub new_player_pool: Option<bool>,
    pub not_scored: Option<bool>,
    pub game_mode_version: Option<u32>,
    pub ranked_type: RankedType,
    pub rank_interval: Option<u32>,
    pub corrupted_penalty_seed: Option<u32>,
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
    #[serde(rename = "objectives.player_spirit_damage")]
    pub objectives_player_spirit_damage: Vec<u32>,
    #[serde(rename = "mid_boss.team_killed")]
    pub mid_boss_team_killed: Vec<Team>,
    #[serde(rename = "mid_boss.team_claimed")]
    pub mid_boss_team_claimed: Vec<Team>,
    #[serde(rename = "mid_boss.destroyed_time_s")]
    pub mid_boss_destroyed_time_s: Vec<u32>,
    #[serde(rename = "street_brawl_rounds.round_duration_s")]
    pub street_brawl_round_duration_s: Vec<u32>,
    #[serde(rename = "street_brawl_rounds.winning_team")]
    pub street_brawl_rounds_winning_team: Vec<Team>,
    pub team_score: Vec<u32>,
    pub match_tracked_stats: Vec<(u32, i32)>,
    pub team0_tracked_stats: Vec<(u32, i32)>,
    pub team1_tracked_stats: Vec<(u32, i32)>,
    pub account_id: u32,
    pub won: bool,
    pub player_slot: u32,
    pub team: Team,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub net_worth: u32,
    pub hero_id: u8,
    pub last_hits: u32,
    pub denies: u32,
    pub ability_points: u32,
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
    #[serde(rename = "death_details.time_to_kill_s")]
    pub death_details_time_to_kill_s: Vec<Option<f32>>,
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
    #[serde(rename = "items.upgrade_info")]
    pub items_upgrade_info: Vec<u32>,
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
    #[serde(rename = "stats.player_barriering")]
    pub stats_player_barriering: Vec<u32>,
    #[serde(rename = "stats.teammate_healing")]
    pub stats_teammate_healing: Vec<u32>,
    #[serde(rename = "stats.teammate_barriering")]
    pub stats_teammate_barriering: Vec<u32>,
    #[serde(rename = "stats.self_damage")]
    pub stats_self_damage: Vec<u32>,
    #[serde(rename = "stats.bullet_kills")]
    pub stats_bullet_kills: Vec<u32>,
    #[serde(rename = "stats.melee_kills")]
    pub stats_melee_kills: Vec<u32>,
    #[serde(rename = "stats.ability_kills")]
    pub stats_ability_kills: Vec<u32>,
    #[serde(rename = "stats.headshot_kills")]
    pub stats_headshot_kills: Vec<u32>,
    /// Per custom stat, its value at every stats tick as deltas: the first element is the
    /// value itself, each later one the change since the previous tick.
    pub custom_user_stats_deltas: Vec<(String, Vec<i32>)>,
    #[serde(rename = "stats.gold_source_players_kills")]
    pub stats_gold_source_players_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_players_damage")]
    pub stats_gold_source_players_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_players_gold")]
    pub stats_gold_source_players_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_players_gold_orbs")]
    pub stats_gold_source_players_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_lane_creeps_kills")]
    pub stats_gold_source_lane_creeps_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_lane_creeps_damage")]
    pub stats_gold_source_lane_creeps_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_lane_creeps_gold")]
    pub stats_gold_source_lane_creeps_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_lane_creeps_gold_orbs")]
    pub stats_gold_source_lane_creeps_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_neutrals_kills")]
    pub stats_gold_source_neutrals_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_neutrals_damage")]
    pub stats_gold_source_neutrals_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_neutrals_gold")]
    pub stats_gold_source_neutrals_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_neutrals_gold_orbs")]
    pub stats_gold_source_neutrals_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_bosses_kills")]
    pub stats_gold_source_bosses_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_bosses_damage")]
    pub stats_gold_source_bosses_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_bosses_gold")]
    pub stats_gold_source_bosses_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_bosses_gold_orbs")]
    pub stats_gold_source_bosses_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_treasure_kills")]
    pub stats_gold_source_treasure_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_treasure_damage")]
    pub stats_gold_source_treasure_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_treasure_gold")]
    pub stats_gold_source_treasure_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_treasure_gold_orbs")]
    pub stats_gold_source_treasure_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_assists_kills")]
    pub stats_gold_source_assists_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_assists_damage")]
    pub stats_gold_source_assists_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_assists_gold")]
    pub stats_gold_source_assists_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_assists_gold_orbs")]
    pub stats_gold_source_assists_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_denies_kills")]
    pub stats_gold_source_denies_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_denies_damage")]
    pub stats_gold_source_denies_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_denies_gold")]
    pub stats_gold_source_denies_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_denies_gold_orbs")]
    pub stats_gold_source_denies_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_team_bonus_kills")]
    pub stats_gold_source_team_bonus_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_team_bonus_damage")]
    pub stats_gold_source_team_bonus_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_team_bonus_gold")]
    pub stats_gold_source_team_bonus_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_team_bonus_gold_orbs")]
    pub stats_gold_source_team_bonus_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_ability_assassinate_kills")]
    pub stats_gold_source_ability_assassinate_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_ability_assassinate_damage")]
    pub stats_gold_source_ability_assassinate_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_ability_assassinate_gold")]
    pub stats_gold_source_ability_assassinate_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_ability_assassinate_gold_orbs")]
    pub stats_gold_source_ability_assassinate_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_trophy_collector_kills")]
    pub stats_gold_source_item_trophy_collector_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_trophy_collector_damage")]
    pub stats_gold_source_item_trophy_collector_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_trophy_collector_gold")]
    pub stats_gold_source_item_trophy_collector_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_trophy_collector_gold_orbs")]
    pub stats_gold_source_item_trophy_collector_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_cultist_sacrifice_kills")]
    pub stats_gold_source_item_cultist_sacrifice_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_cultist_sacrifice_damage")]
    pub stats_gold_source_item_cultist_sacrifice_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_cultist_sacrifice_gold")]
    pub stats_gold_source_item_cultist_sacrifice_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_cultist_sacrifice_gold_orbs")]
    pub stats_gold_source_item_cultist_sacrifice_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_breakable_kills")]
    pub stats_gold_source_breakable_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_breakable_damage")]
    pub stats_gold_source_breakable_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_breakable_gold")]
    pub stats_gold_source_breakable_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_breakable_gold_orbs")]
    pub stats_gold_source_breakable_gold_orbs: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_goose_egg_kills")]
    pub stats_gold_source_item_goose_egg_kills: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_goose_egg_damage")]
    pub stats_gold_source_item_goose_egg_damage: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_goose_egg_gold")]
    pub stats_gold_source_item_goose_egg_gold: Vec<u32>,
    #[serde(rename = "stats.gold_source_item_goose_egg_gold_orbs")]
    pub stats_gold_source_item_goose_egg_gold_orbs: Vec<u32>,
    #[serde(rename = "power_up_buffs.type")]
    pub power_up_buffs_type: Vec<String>,
    #[serde(rename = "power_up_buffs.value")]
    pub power_up_buffs_value: Vec<u32>,
    #[serde(rename = "power_up_buffs.is_permanent")]
    pub power_up_buffs_is_permanent: Vec<bool>,
    #[serde(rename = "power_up_buffs.pickup_times_s")]
    pub power_up_buffs_pickup_times_s: Vec<Vec<u32>>,
    #[serde(rename = "power_up_buffs.pickup_stat_values")]
    pub power_up_buffs_pickup_stat_values: Vec<Vec<f32>>,
    #[serde(rename = "hero_release_votes.category")]
    pub hero_release_votes_category: Vec<HeroReleaseVoteCategory>,
    #[serde(rename = "hero_release_votes.hero_id")]
    pub hero_release_votes_hero_id: Vec<u32>,
    #[serde(rename = "hero_release_votes.vote_count")]
    pub hero_release_votes_vote_count: Vec<u32>,
    pub rewards_eligible: bool,
    pub earned_holiday_award_2025: bool,
    pub hero_xp: u32,
    pub hero_equips: Vec<u64>,
    pub mvp_rank: Option<u32>,
    pub player_tracked_stats: Vec<(u32, i32)>,
    #[serde(rename = "accolades.accolade_id")]
    pub accolades_accolade_id: Vec<u32>,
    #[serde(rename = "accolades.accolade_stat_value")]
    pub accolades_accolade_stat_value: Vec<i32>,
    #[serde(rename = "accolades.accolade_threshold_achieved")]
    pub accolades_accolade_threshold_achieved: Vec<i32>,
    #[serde(rename = "hero_xp_rewards.hero_id")]
    pub hero_xp_rewards_hero_id: Vec<u32>,
    #[serde(rename = "hero_xp_rewards.xp_grant")]
    pub hero_xp_rewards_xp_grant: Vec<u32>,
    #[serde(rename = "hero_xp_rewards.reason")]
    pub hero_xp_rewards_reason: Vec<HeroXpGrantReason>,
    pub player_match_outcome: PlayerMatchOutcome,
    pub player_rank_initial_display_rank: Option<u32>,
    pub player_rank_initial_flat_progress: Option<u32>,
    pub player_rank_final_flat_progress: Option<u32>,
    pub player_rank_desired_progress_change: Option<i32>,
    pub player_rank_initial_calibration_games: Option<u32>,
    pub player_rank_initial_demotion_protection_games: Option<u32>,
    pub player_rank_consumed_demotion_protection: Option<bool>,
    pub player_rank_initial_win_streak: Option<u32>,
}

/// Match-level average badge, in the `tier * 10 + subrank` encoding.
///
/// Valve stopped populating `average_badge_team{0,1}` on 2026-07-30, so matches recorded
/// since then only carry per-player `player_rank_data`. Both shapes stay reachable because
/// the worker also re-ingests older matches, hence the two-source fallback.
///
/// A player's `initial_display_rank` is `0` while they are still in placement games;
/// those are excluded rather than averaged in as rank zero. `None` when neither source
/// yields a rank, which is the normal case for non-ranked match modes.
fn average_badge(match_info: &MatchInfo) -> Option<u32> {
    let team_badges: Vec<u32> = [
        match_info.average_badge_team0,
        match_info.average_badge_team1,
    ]
    .into_iter()
    .flatten()
    .filter(|badge| *badge > 0)
    .collect();
    if let Some(avg) = mean_badge(&team_badges) {
        return Some(avg);
    }

    let player_ranks: Vec<u32> = match_info
        .players
        .iter()
        .filter_map(|player| player.player_rank_data)
        .filter_map(|rank| rank.initial_display_rank)
        .filter(|rank| *rank > 0)
        .collect();
    mean_badge(&player_ranks)
}

/// The `tier * 10 + subrank` encoding is not a linear scale: subranks stop at 6, so `x0` and
/// `x7`..=`x9` are unreachable. Averaging it directly lands in those gaps and yields badges that
/// do not exist (Mystic 6 and Ritualist 1 average to 58, i.e. "Mystic 8"). Badges are therefore
/// projected onto the dense `tier * 6 + subrank` scale, averaged there, and projected back.
///
/// Ties round half up, matching the `average_badge` column's DEFAULT expression in `ClickHouse`,
/// so rows written here agree with rows the database derives from `average_badge_team{0,1}`.
/// Half up rather than to even because a two-team average is a tie half the time, and ties to
/// even would starve odd ranks of that mass and leave a sawtooth in the rank distribution.
///
/// Callers filter out zero badges, so the dense mean is at least 1.
#[expect(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn mean_badge(badges: &[u32]) -> Option<u32> {
    let count = u32::try_from(badges.len()).ok().filter(|c| *c > 0)?;
    let dense_sum: u32 = badges.iter().map(|badge| badge - 4 * (badge / 10)).sum();
    let dense_mean = (f64::from(dense_sum) / f64::from(count) + 0.5).floor() as u32;
    Some(dense_mean + 4 * ((dense_mean - 1) / 6))
}

/// Decode the hero release votes carried in the match's `extra_messages` blocks.
fn hero_release_votes(match_info: &MatchInfo) -> Vec<CMsgMatchHeroReleaseVotes> {
    match_info
        .extra_messages
        .iter()
        .filter(|b| {
            b.msg_type()
                == EMatchMetadataExtraMessage::KEMatchMetadataExtraMessageHeroReleaseVotes as u32
        })
        .filter_map(|b| {
            let contents = b.contents();
            let decoded = if b.is_compressed() {
                let mut buf = Vec::new();
                zstd::stream::read::Decoder::new(contents)
                    .and_then(|mut d| d.read_to_end(&mut buf))
                    .map(|_| buf)
                    .inspect_err(|e| {
                        warn!(
                            match_id = match_info.match_id(),
                            "Failed to decompress hero release votes: {e}"
                        );
                    })
                    .ok()?
            } else {
                contents.to_vec()
            };
            CMsgMatchHeroReleaseVotes::decode(decoded.as_slice())
                .inspect_err(|e| {
                    warn!(
                        match_id = match_info.match_id(),
                        "Failed to decode hero release votes: {e}"
                    );
                })
                .ok()
        })
        .collect()
}

/// Match-level values every player row of a match repeats, computed once per match
/// rather than once per player (the hero release votes are zstd-decompressed).
pub(crate) struct MatchShared<'a> {
    match_info: &'a MatchInfo,
    average_badge: Option<u32>,
    hero_votes: Vec<(HeroReleaseVoteCategory, HeroVote)>,
    objectives_destroyed_time_s: Vec<u32>,
    objectives_creep_damage: Vec<u32>,
    objectives_creep_damage_mitigated: Vec<u32>,
    objectives_player_damage: Vec<u32>,
    objectives_player_damage_mitigated: Vec<u32>,
    objectives_first_damage_time_s: Vec<u32>,
    objectives_team_objective: Vec<Objective>,
    objectives_team: Vec<Team>,
    objectives_player_spirit_damage: Vec<u32>,
    mid_boss_team_killed: Vec<Team>,
    mid_boss_team_claimed: Vec<Team>,
    mid_boss_destroyed_time_s: Vec<u32>,
    street_brawl_round_duration_s: Vec<u32>,
    street_brawl_rounds_winning_team: Vec<Team>,
    team_score: Vec<u32>,
    match_tracked_stats: Vec<(u32, i32)>,
    team0_tracked_stats: Vec<(u32, i32)>,
    team1_tracked_stats: Vec<(u32, i32)>,
}

impl<'a> MatchShared<'a> {
    #[expect(clippy::too_many_lines)]
    pub(crate) fn new(match_info: &'a MatchInfo) -> Self {
        let hero_votes = hero_release_votes(match_info)
            .into_iter()
            .flat_map(|votes| votes.categories)
            .flat_map(|c| {
                let category = HeroReleaseVoteCategory::from(c.vote_category());
                c.hero_votes.into_iter().map(move |v| (category.clone(), v))
            })
            .collect();
        Self {
            match_info,
            average_badge: average_badge(match_info),
            hero_votes,
            objectives_destroyed_time_s: match_info
                .objectives
                .iter()
                .map(ProtoObjective::destroyed_time_s)
                .collect(),
            objectives_creep_damage: match_info
                .objectives
                .iter()
                .map(ProtoObjective::creep_damage)
                .collect(),
            objectives_creep_damage_mitigated: match_info
                .objectives
                .iter()
                .map(ProtoObjective::creep_damage_mitigated)
                .collect(),
            objectives_player_damage: match_info
                .objectives
                .iter()
                .map(ProtoObjective::player_damage)
                .collect(),
            objectives_player_damage_mitigated: match_info
                .objectives
                .iter()
                .map(ProtoObjective::player_damage_mitigated)
                .collect(),
            objectives_first_damage_time_s: match_info
                .objectives
                .iter()
                .map(ProtoObjective::first_damage_time_s)
                .collect(),
            objectives_team_objective: match_info
                .objectives
                .iter()
                .map(ProtoObjective::team_objective_id)
                .map(Objective::from)
                .collect(),
            objectives_team: match_info
                .objectives
                .iter()
                .map(ProtoObjective::team)
                .map(Team::from)
                .collect(),
            objectives_player_spirit_damage: match_info
                .objectives
                .iter()
                .map(ProtoObjective::player_spirit_damage)
                .collect(),
            mid_boss_team_killed: match_info
                .mid_boss
                .iter()
                .map(MidBoss::team_killed)
                .map(Team::from)
                .collect(),
            mid_boss_team_claimed: match_info
                .mid_boss
                .iter()
                .map(MidBoss::team_claimed)
                .map(Team::from)
                .collect(),
            mid_boss_destroyed_time_s: match_info
                .mid_boss
                .iter()
                .map(MidBoss::destroyed_time_s)
                .collect(),
            street_brawl_round_duration_s: match_info
                .street_brawl_rounds
                .iter()
                .map(StreetBrawlRound::round_duration_s)
                .collect(),
            street_brawl_rounds_winning_team: match_info
                .street_brawl_rounds
                .iter()
                .map(StreetBrawlRound::winning_team)
                .map(Team::from)
                .collect(),
            team_score: match_info.team_score.clone(),
            match_tracked_stats: match_info
                .match_tracked_stats
                .iter()
                .map(|x| (x.tracked_stat_id(), x.tracked_stat_value()))
                .collect(),
            team0_tracked_stats: match_info.teams.first().map_or_default(|t| {
                t.team_tracked_stats
                    .iter()
                    .map(|x| (x.tracked_stat_id(), x.tracked_stat_value()))
                    .collect()
            }),
            team1_tracked_stats: match_info.teams.get(1).map_or_default(|t| {
                t.team_tracked_stats
                    .iter()
                    .map(|x| (x.tracked_stat_id(), x.tracked_stat_value()))
                    .collect()
            }),
        }
    }
}

#[expect(clippy::too_many_lines)]
impl From<(&MatchShared<'_>, bool, &Players)> for ClickhouseMatchPlayer {
    fn from((shared, won, value): (&MatchShared<'_>, bool, &Players)) -> Self {
        let match_info = shared.match_info;
        // One value per stats tick (or per item) for a field.
        let stat = |field: fn(&PlayerStats) -> u32| -> Vec<u32> {
            value.stats.iter().map(field).collect()
        };
        let gold = |source: EGoldSource, field: fn(&GoldSource) -> u32| {
            gold_source_values(&value.stats, source, field)
        };
        let item =
            |field: fn(&Items) -> u32| -> Vec<u32> { value.items.iter().map(field).collect() };
        let player_votes: Vec<&(HeroReleaseVoteCategory, HeroVote)> = shared
            .hero_votes
            .iter()
            .filter(|(_, v)| v.vote_player_slot() == value.player_slot())
            .collect();
        Self {
            match_id: match_info.match_id(),
            start_time: match_info.start_time(),
            duration_s: match_info.duration_s(),
            match_mode: MatchMode::from(match_info.match_mode()),
            game_mode: GameMode::from(match_info.game_mode()),
            average_badge_team0: match_info.average_badge_team0,
            average_badge_team1: match_info.average_badge_team1,
            average_badge: shared.average_badge,
            winning_team: Team::from(match_info.winning_team()),
            match_outcome: MatchOutcome::from(match_info.match_outcome()),
            bot_difficulty: BotDifficulty::from(match_info.bot_difficulty()),
            objectives_mask_team0: match_info.objectives_mask_team0() as u16,
            objectives_mask_team1: match_info.objectives_mask_team1() as u16,
            is_high_skill_range_parties: match_info.is_high_skill_range_parties,
            low_pri_pool: match_info.low_pri_pool,
            new_player_pool: match_info.new_player_pool,
            not_scored: match_info.not_scored,
            game_mode_version: match_info.game_mode_version,
            ranked_type: RankedType::from(match_info.ranked_type()),
            rank_interval: match_info.rank_interval,
            corrupted_penalty_seed: match_info.corrupted_penalty_seed,
            objectives_destroyed_time_s: shared.objectives_destroyed_time_s.clone(),
            objectives_creep_damage: shared.objectives_creep_damage.clone(),
            objectives_creep_damage_mitigated: shared.objectives_creep_damage_mitigated.clone(),
            objectives_player_damage: shared.objectives_player_damage.clone(),
            objectives_player_damage_mitigated: shared.objectives_player_damage_mitigated.clone(),
            objectives_first_damage_time_s: shared.objectives_first_damage_time_s.clone(),
            objectives_team_objective: shared.objectives_team_objective.clone(),
            objectives_team: shared.objectives_team.clone(),
            objectives_player_spirit_damage: shared.objectives_player_spirit_damage.clone(),
            mid_boss_team_killed: shared.mid_boss_team_killed.clone(),
            mid_boss_team_claimed: shared.mid_boss_team_claimed.clone(),
            mid_boss_destroyed_time_s: shared.mid_boss_destroyed_time_s.clone(),
            street_brawl_round_duration_s: shared.street_brawl_round_duration_s.clone(),
            street_brawl_rounds_winning_team: shared.street_brawl_rounds_winning_team.clone(),
            team_score: shared.team_score.clone(),
            match_tracked_stats: shared.match_tracked_stats.clone(),
            team0_tracked_stats: shared.team0_tracked_stats.clone(),
            team1_tracked_stats: shared.team1_tracked_stats.clone(),
            account_id: value.account_id(),
            won,
            player_slot: value.player_slot(),
            death_details_game_time_s: value
                .death_details
                .iter()
                .map(Deaths::game_time_s)
                .collect(),
            death_details_time_to_kill_s: value
                .death_details
                .iter()
                .map(|v| v.time_to_kill_s)
                .collect(),
            death_details_killer_player_slot: value
                .death_details
                .iter()
                .map(Deaths::killer_player_slot)
                .collect(),
            death_details_death_pos: value
                .death_details
                .iter()
                .map(|v| {
                    let p = v.death_pos.unwrap_or_default();
                    (p.x(), p.y(), p.z())
                })
                .collect(),
            death_details_killer_pos: value
                .death_details
                .iter()
                .map(|v| {
                    let p = v.killer_pos.unwrap_or_default();
                    (p.x(), p.y(), p.z())
                })
                .collect(),
            death_details_death_duration_s: value
                .death_details
                .iter()
                .map(Deaths::death_duration_s)
                .collect(),
            items_game_time_s: item(Items::game_time_s),
            items_item_id: item(Items::item_id),
            items_upgrade_id: item(Items::upgrade_id),
            items_sold_time_s: item(Items::sold_time_s),
            items_flags: item(Items::flags),
            items_imbued_ability_id: item(Items::imbued_ability_id),
            items_upgrade_info: item(Items::upgrade_info),
            stats_time_stamp_s: stat(PlayerStats::time_stamp_s),
            stats_net_worth: stat(PlayerStats::net_worth),
            stats_gold_player: stat(PlayerStats::gold_player),
            stats_gold_player_orbs: stat(PlayerStats::gold_player_orbs),
            stats_gold_lane_creep_orbs: stat(PlayerStats::gold_lane_creep_orbs),
            stats_gold_neutral_creep_orbs: stat(PlayerStats::gold_neutral_creep_orbs),
            stats_gold_boss: stat(PlayerStats::gold_boss),
            stats_gold_boss_orb: stat(PlayerStats::gold_boss_orb),
            stats_gold_treasure: stat(PlayerStats::gold_treasure),
            stats_gold_denied: stat(PlayerStats::gold_denied),
            stats_gold_death_loss: stat(PlayerStats::gold_death_loss),
            stats_gold_lane_creep: stat(PlayerStats::gold_lane_creep),
            stats_gold_neutral_creep: stat(PlayerStats::gold_neutral_creep),
            stats_kills: stat(PlayerStats::kills),
            stats_deaths: stat(PlayerStats::deaths),
            stats_assists: stat(PlayerStats::assists),
            stats_creep_kills: stat(PlayerStats::creep_kills),
            stats_neutral_kills: stat(PlayerStats::neutral_kills),
            stats_possible_creeps: stat(PlayerStats::possible_creeps),
            stats_creep_damage: stat(PlayerStats::creep_damage),
            stats_player_damage: stat(PlayerStats::player_damage),
            stats_neutral_damage: stat(PlayerStats::neutral_damage),
            stats_boss_damage: stat(PlayerStats::boss_damage),
            stats_denies: stat(PlayerStats::denies),
            stats_player_healing: stat(PlayerStats::player_healing),
            stats_ability_points: stat(PlayerStats::ability_points),
            stats_self_healing: stat(PlayerStats::self_healing),
            stats_player_damage_taken: stat(PlayerStats::player_damage_taken),
            stats_max_health: stat(PlayerStats::max_health),
            stats_weapon_power: stat(PlayerStats::weapon_power),
            stats_tech_power: stat(PlayerStats::tech_power),
            stats_shots_hit: stat(PlayerStats::shots_hit),
            stats_shots_missed: stat(PlayerStats::shots_missed),
            stats_damage_absorbed: stat(PlayerStats::damage_absorbed),
            stats_absorption_provided: stat(PlayerStats::absorption_provided),
            stats_hero_bullets_hit: stat(PlayerStats::hero_bullets_hit),
            stats_hero_bullets_hit_crit: stat(PlayerStats::hero_bullets_hit_crit),
            stats_heal_prevented: stat(PlayerStats::heal_prevented),
            stats_heal_lost: stat(PlayerStats::heal_lost),
            stats_damage_mitigated: stat(PlayerStats::damage_mitigated),
            stats_level: stat(PlayerStats::level),
            stats_player_barriering: stat(PlayerStats::player_barriering),
            stats_teammate_healing: stat(PlayerStats::teammate_healing),
            stats_teammate_barriering: stat(PlayerStats::teammate_barriering),
            stats_self_damage: stat(PlayerStats::self_damage),
            stats_bullet_kills: stat(PlayerStats::bullet_kills),
            stats_melee_kills: stat(PlayerStats::melee_kills),
            stats_ability_kills: stat(PlayerStats::ability_kills),
            stats_headshot_kills: stat(PlayerStats::headshot_kills),
            custom_user_stats_deltas: custom_user_stats_deltas(match_info, &value.stats),
            stats_gold_source_players_kills: gold(EGoldSource::KEPlayers, GoldSource::kills),
            stats_gold_source_players_damage: gold(EGoldSource::KEPlayers, GoldSource::damage),
            stats_gold_source_players_gold: gold(EGoldSource::KEPlayers, GoldSource::gold),
            stats_gold_source_players_gold_orbs: gold(
                EGoldSource::KEPlayers,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_lane_creeps_kills: gold(EGoldSource::KELaneCreeps, GoldSource::kills),
            stats_gold_source_lane_creeps_damage: gold(
                EGoldSource::KELaneCreeps,
                GoldSource::damage,
            ),
            stats_gold_source_lane_creeps_gold: gold(EGoldSource::KELaneCreeps, GoldSource::gold),
            stats_gold_source_lane_creeps_gold_orbs: gold(
                EGoldSource::KELaneCreeps,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_neutrals_kills: gold(EGoldSource::KENeutrals, GoldSource::kills),
            stats_gold_source_neutrals_damage: gold(EGoldSource::KENeutrals, GoldSource::damage),
            stats_gold_source_neutrals_gold: gold(EGoldSource::KENeutrals, GoldSource::gold),
            stats_gold_source_neutrals_gold_orbs: gold(
                EGoldSource::KENeutrals,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_bosses_kills: gold(EGoldSource::KEBosses, GoldSource::kills),
            stats_gold_source_bosses_damage: gold(EGoldSource::KEBosses, GoldSource::damage),
            stats_gold_source_bosses_gold: gold(EGoldSource::KEBosses, GoldSource::gold),
            stats_gold_source_bosses_gold_orbs: gold(EGoldSource::KEBosses, GoldSource::gold_orbs),
            stats_gold_source_treasure_kills: gold(EGoldSource::KETreasure, GoldSource::kills),
            stats_gold_source_treasure_damage: gold(EGoldSource::KETreasure, GoldSource::damage),
            stats_gold_source_treasure_gold: gold(EGoldSource::KETreasure, GoldSource::gold),
            stats_gold_source_treasure_gold_orbs: gold(
                EGoldSource::KETreasure,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_assists_kills: gold(EGoldSource::KEAssists, GoldSource::kills),
            stats_gold_source_assists_damage: gold(EGoldSource::KEAssists, GoldSource::damage),
            stats_gold_source_assists_gold: gold(EGoldSource::KEAssists, GoldSource::gold),
            stats_gold_source_assists_gold_orbs: gold(
                EGoldSource::KEAssists,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_denies_kills: gold(EGoldSource::KEDenies, GoldSource::kills),
            stats_gold_source_denies_damage: gold(EGoldSource::KEDenies, GoldSource::damage),
            stats_gold_source_denies_gold: gold(EGoldSource::KEDenies, GoldSource::gold),
            stats_gold_source_denies_gold_orbs: gold(EGoldSource::KEDenies, GoldSource::gold_orbs),
            stats_gold_source_team_bonus_kills: gold(EGoldSource::KETeamBonus, GoldSource::kills),
            stats_gold_source_team_bonus_damage: gold(EGoldSource::KETeamBonus, GoldSource::damage),
            stats_gold_source_team_bonus_gold: gold(EGoldSource::KETeamBonus, GoldSource::gold),
            stats_gold_source_team_bonus_gold_orbs: gold(
                EGoldSource::KETeamBonus,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_ability_assassinate_kills: gold(
                EGoldSource::KEAbilityAssassinate,
                GoldSource::kills,
            ),
            stats_gold_source_ability_assassinate_damage: gold(
                EGoldSource::KEAbilityAssassinate,
                GoldSource::damage,
            ),
            stats_gold_source_ability_assassinate_gold: gold(
                EGoldSource::KEAbilityAssassinate,
                GoldSource::gold,
            ),
            stats_gold_source_ability_assassinate_gold_orbs: gold(
                EGoldSource::KEAbilityAssassinate,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_item_trophy_collector_kills: gold(
                EGoldSource::KEItemTrophyCollector,
                GoldSource::kills,
            ),
            stats_gold_source_item_trophy_collector_damage: gold(
                EGoldSource::KEItemTrophyCollector,
                GoldSource::damage,
            ),
            stats_gold_source_item_trophy_collector_gold: gold(
                EGoldSource::KEItemTrophyCollector,
                GoldSource::gold,
            ),
            stats_gold_source_item_trophy_collector_gold_orbs: gold(
                EGoldSource::KEItemTrophyCollector,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_item_cultist_sacrifice_kills: gold(
                EGoldSource::KEItemCultistSacrifice,
                GoldSource::kills,
            ),
            stats_gold_source_item_cultist_sacrifice_damage: gold(
                EGoldSource::KEItemCultistSacrifice,
                GoldSource::damage,
            ),
            stats_gold_source_item_cultist_sacrifice_gold: gold(
                EGoldSource::KEItemCultistSacrifice,
                GoldSource::gold,
            ),
            stats_gold_source_item_cultist_sacrifice_gold_orbs: gold(
                EGoldSource::KEItemCultistSacrifice,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_breakable_kills: gold(EGoldSource::KEBreakable, GoldSource::kills),
            stats_gold_source_breakable_damage: gold(EGoldSource::KEBreakable, GoldSource::damage),
            stats_gold_source_breakable_gold: gold(EGoldSource::KEBreakable, GoldSource::gold),
            stats_gold_source_breakable_gold_orbs: gold(
                EGoldSource::KEBreakable,
                GoldSource::gold_orbs,
            ),
            stats_gold_source_item_goose_egg_kills: gold(
                EGoldSource::KEItemGooseEgg,
                GoldSource::kills,
            ),
            stats_gold_source_item_goose_egg_damage: gold(
                EGoldSource::KEItemGooseEgg,
                GoldSource::damage,
            ),
            stats_gold_source_item_goose_egg_gold: gold(
                EGoldSource::KEItemGooseEgg,
                GoldSource::gold,
            ),
            stats_gold_source_item_goose_egg_gold_orbs: gold(
                EGoldSource::KEItemGooseEgg,
                GoldSource::gold_orbs,
            ),
            power_up_buffs_type: value
                .power_up_buffs
                .iter()
                .map(PowerUpBuff::r#type)
                .map(std::string::ToString::to_string)
                .collect(),
            power_up_buffs_value: value
                .power_up_buffs
                .iter()
                .map(PowerUpBuff::value)
                .collect(),
            power_up_buffs_is_permanent: value
                .power_up_buffs
                .iter()
                .map(PowerUpBuff::is_permanent)
                .collect(),
            power_up_buffs_pickup_times_s: value
                .power_up_buffs
                .iter()
                .map(|b| b.pickup_times_s.clone())
                .collect(),
            power_up_buffs_pickup_stat_values: value
                .power_up_buffs
                .iter()
                .map(|b| b.pickup_stat_values.clone())
                .collect(),
            hero_release_votes_category: player_votes.iter().map(|(c, _)| c.clone()).collect(),
            hero_release_votes_hero_id: player_votes
                .iter()
                .map(|(_, v)| v.vote_hero_id())
                .collect(),
            hero_release_votes_vote_count: player_votes
                .iter()
                .map(|(_, v)| v.vote_count())
                .collect(),
            team: Team::from(value.team()),
            kills: value.kills(),
            deaths: value.deaths(),
            assists: value.assists(),
            net_worth: value.net_worth(),
            hero_id: value.hero_id() as u8,
            last_hits: value.last_hits(),
            denies: value.denies(),
            ability_points: value.ability_points(),
            assigned_lane: value.assigned_lane(),
            player_level: value.level(),
            ability_stats: value
                .ability_stats
                .iter()
                .map(|v| (i64::from(v.ability_id()), i64::from(v.ability_value())))
                .collect(),
            stats_type_stat: value.stats_type_stat.clone(),
            book_reward_starting_xp: value
                .book_rewards
                .iter()
                .map(BookReward::starting_xp)
                .collect(),
            book_reward_xp_amount: value
                .book_rewards
                .iter()
                .map(BookReward::xp_amount)
                .collect(),
            book_reward_book_id: value.book_rewards.iter().map(BookReward::book_id).collect(),
            abandon_match_time_s: value.abandon_match_time_s(),
            rewards_eligible: value.rewards_eligible(),
            earned_holiday_award_2025: value.earned_holiday_award_2025(),
            hero_xp: value
                .hero_data
                .as_ref()
                .and_then(|h| h.hero_xp)
                .unwrap_or_default(),
            hero_equips: value
                .hero_data
                .as_ref()
                .and_then(|h| {
                    h.hero_equips
                        .as_ref()
                        .map(|e| e.items.iter().filter_map(|i| i.id).collect())
                })
                .unwrap_or_default(),
            mvp_rank: value.mvp_rank,
            player_tracked_stats: value
                .player_tracked_stats
                .iter()
                .map(|v| (v.tracked_stat_id(), v.tracked_stat_value()))
                .collect(),
            accolades_accolade_id: value
                .accolades
                .iter()
                .map(PlayerAccolade::accolade_id)
                .collect(),
            accolades_accolade_stat_value: value
                .accolades
                .iter()
                .map(PlayerAccolade::accolade_stat_value)
                .collect(),
            accolades_accolade_threshold_achieved: value
                .accolades
                .iter()
                .map(PlayerAccolade::accolade_threshold_achieved)
                .collect(),
            hero_xp_rewards_hero_id: value
                .hero_xp_rewards
                .iter()
                .filter_map(|r| r.xp_grant.as_ref())
                .map(CMsgHeroXpGrant::hero_id)
                .collect(),
            hero_xp_rewards_xp_grant: value
                .hero_xp_rewards
                .iter()
                .filter_map(|r| r.xp_grant.as_ref())
                .map(CMsgHeroXpGrant::xp_grant)
                .collect(),
            hero_xp_rewards_reason: value
                .hero_xp_rewards
                .iter()
                .filter_map(|r| r.xp_grant.as_ref())
                .map(CMsgHeroXpGrant::reason)
                .map(HeroXpGrantReason::from)
                .collect(),
            player_match_outcome: PlayerMatchOutcome::from(value.player_match_outcome()),
            player_rank_initial_display_rank: value
                .player_rank_data
                .and_then(|r| r.initial_display_rank),
            player_rank_initial_flat_progress: value
                .player_rank_data
                .and_then(|r| r.initial_flat_progress),
            player_rank_final_flat_progress: value
                .player_rank_data
                .and_then(|r| r.final_flat_progress),
            player_rank_desired_progress_change: value
                .player_rank_data
                .and_then(|r| r.desired_progress_change),
            player_rank_initial_calibration_games: value
                .player_rank_data
                .and_then(|r| r.initial_calibration_games),
            player_rank_initial_demotion_protection_games: value
                .player_rank_data
                .and_then(|r| r.initial_demotion_protection_games),
            player_rank_consumed_demotion_protection: value
                .player_rank_data
                .and_then(|r| r.consumed_demotion_protection),
            player_rank_initial_win_streak: value
                .player_rank_data
                .and_then(|r| r.initial_win_streak),
        }
    }
}

/// Custom stats keyed by name (the id when the match has no name for it), in order of first
/// appearance, each with one delta-encoded value per stats tick, 0 on ticks without an entry.
/// Deltas wrap at 32 bits, so a cumulative sum truncated to `UInt32` restores every value.
fn custom_user_stats_deltas(
    match_info: &MatchInfo,
    stats: &[PlayerStats],
) -> Vec<(String, Vec<i32>)> {
    let mut ids: Vec<u32> = Vec::new();
    for v in stats.iter().flat_map(|s| &s.custom_user_stats) {
        if !ids.contains(&v.id()) {
            ids.push(v.id());
        }
    }
    ids.into_iter()
        .map(|id| {
            let name = match_info
                .custom_user_stats
                .iter()
                .find(|n| n.id() == id)
                .map_or_else(|| id.to_string(), |n| n.name().to_owned());
            let mut prev = 0u32;
            let deltas = stats
                .iter()
                .map(|s| {
                    let value = s
                        .custom_user_stats
                        .iter()
                        .find(|v| v.id() == id)
                        .map_or(0, CustomUserStat::value);
                    #[allow(clippy::cast_possible_wrap)]
                    let delta = value.wrapping_sub(prev) as i32;
                    prev = value;
                    delta
                })
                .collect();
            (name, deltas)
        })
        .collect()
}

/// One value per stats tick for `source`, 0 on ticks without an entry for it.
fn gold_source_values(
    stats: &[PlayerStats],
    source: EGoldSource,
    field: fn(&GoldSource) -> u32,
) -> Vec<u32> {
    stats
        .iter()
        .map(|s| {
            s.gold_sources
                .iter()
                .find(|g| g.source() == source)
                .map_or(0, field)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use valveprotos::deadlock::CMsgMatchPlayerRankData;

    use super::*;

    fn match_info(team0: Option<u32>, team1: Option<u32>, ranks: &[Option<u32>]) -> MatchInfo {
        MatchInfo {
            average_badge_team0: team0,
            average_badge_team1: team1,
            players: ranks
                .iter()
                .map(|rank| Players {
                    player_rank_data: rank.map(|initial_display_rank| CMsgMatchPlayerRankData {
                        initial_display_rank: Some(initial_display_rank),
                        ..Default::default()
                    }),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn custom_user_stats_are_delta_encoded_per_stat() {
        use valveprotos::deadlock::c_msg_match_meta_data_contents::CustomUserStatInfo;

        let stat = |id, value| CustomUserStat {
            id: Some(id),
            value: Some(value),
        };
        let tick = |stats| PlayerStats {
            custom_user_stats: stats,
            ..Default::default()
        };
        let info = MatchInfo {
            custom_user_stats: vec![CustomUserStatInfo {
                id: Some(1),
                name: Some("Shots".to_owned()),
            }],
            ..Default::default()
        };
        let stats = [
            tick(vec![stat(1, 10), stat(2, u32::MAX)]),
            tick(vec![stat(1, 25), stat(2, 3)]),
            tick(vec![stat(1, 20), stat(3, 7)]),
        ];
        let deltas = custom_user_stats_deltas(&info, &stats);
        assert_eq!(
            deltas,
            vec![
                ("Shots".to_owned(), vec![10, 15, -5]),
                ("2".to_owned(), vec![-1, 4, -3]),
                ("3".to_owned(), vec![0, 0, 7]),
            ]
        );
        // A cumulative sum truncated to 32 bits restores the values (ClickHouse:
        // toUInt32(arrayCumSum(deltas))).
        let restored: Vec<u32> = deltas[1]
            .1
            .iter()
            .scan(0i64, |sum, d| {
                *sum += i64::from(*d);
                #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                Some(*sum as u32)
            })
            .collect();
        assert_eq!(restored, vec![u32::MAX, 3, 0]);
    }

    #[test]
    fn prefers_team_averages_over_player_ranks() {
        let info = match_info(Some(61), Some(81), &[Some(111), Some(111)]);
        assert_eq!(average_badge(&info), Some(71));
    }

    #[test]
    fn averages_across_a_tier_boundary_stay_on_the_badge_scale() {
        // Mystic 6 and Ritualist 1 are adjacent ranks; the mean of the raw encoding is 58.5,
        // which decodes to the nonexistent "Mystic 8".
        assert_eq!(
            average_badge(&match_info(Some(56), Some(61), &[])),
            Some(61)
        );
        assert_eq!(
            average_badge(&match_info(Some(31), Some(56), &[])),
            Some(44)
        );
    }

    #[test]
    fn single_known_team_is_not_halved() {
        assert_eq!(average_badge(&match_info(Some(55), None, &[])), Some(55));
        assert_eq!(average_badge(&match_info(Some(55), Some(0), &[])), Some(55));
    }

    #[test]
    fn falls_back_to_player_ranks() {
        let absent = match_info(None, None, &[Some(82), Some(84)]);
        assert_eq!(average_badge(&absent), Some(83));
        let zeroed = match_info(Some(0), Some(0), &[Some(82), Some(84)]);
        assert_eq!(average_badge(&zeroed), Some(83));
    }

    #[test]
    fn players_still_in_placements_are_excluded() {
        let info = match_info(None, None, &[Some(0), Some(0), None, Some(84)]);
        assert_eq!(average_badge(&info), Some(84));
    }

    #[test]
    fn ties_round_half_up_like_clickhouse() {
        // Dense means 13.5 -> 14, 11.5 -> 12, 2.5 -> 3
        assert_eq!(
            average_badge(&match_info(Some(21), Some(22), &[])),
            Some(22)
        );
        assert_eq!(
            average_badge(&match_info(Some(15), Some(16), &[])),
            Some(16)
        );
        assert_eq!(average_badge(&match_info(Some(2), Some(3), &[])), Some(3));
    }

    #[test]
    fn every_badge_is_a_reachable_rank() {
        let badges: Vec<u32> = (11..=116).filter(|b| (1..=6).contains(&(b % 10))).collect();
        for team0 in &badges {
            for team1 in &badges {
                let avg = average_badge(&match_info(Some(*team0), Some(*team1), &[])).unwrap();
                assert!(
                    (1..=6).contains(&(avg % 10)) && (11..=116).contains(&avg),
                    "{team0} and {team1} averaged to {avg}"
                );
            }
        }
    }

    #[test]
    fn gold_sources_map_per_tick_with_zero_for_missing_entries() {
        let tick = |sources: &[(EGoldSource, u32, u32)]| PlayerStats {
            gold_sources: sources
                .iter()
                .map(|&(source, gold, gold_orbs)| GoldSource {
                    source: Some(source as i32),
                    gold: Some(gold),
                    gold_orbs: Some(gold_orbs),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let stats = [
            tick(&[(EGoldSource::KEBreakable, 50, 0)]),
            tick(&[
                (EGoldSource::KELaneCreeps, 300, 120),
                (EGoldSource::KEBreakable, 90, 0),
            ]),
            tick(&[]),
        ];
        assert_eq!(
            gold_source_values(&stats, EGoldSource::KEBreakable, GoldSource::gold),
            [50, 90, 0]
        );
        assert_eq!(
            gold_source_values(&stats, EGoldSource::KELaneCreeps, GoldSource::gold_orbs),
            [0, 120, 0]
        );
    }

    #[test]
    fn none_when_neither_source_has_data() {
        assert_eq!(average_badge(&match_info(None, None, &[])), None);
        assert_eq!(
            average_badge(&match_info(Some(0), Some(0), &[Some(0), None])),
            None
        );
    }
}
