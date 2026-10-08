//! Maps a GraphQL selection set onto `ClickHouse` SELECT expressions. The
//! static `MATCH_COLUMNS` / `PLAYER_COLUMNS` allow-lists are the only column
//! references that reach the emitted SQL.

use async_graphql::Lookahead;

#[derive(Clone, Copy, Debug)]
pub(super) struct Column {
    pub(super) gql: &'static str,
    pub(super) ch_expr: &'static str,
}

const fn mp(gql: &'static str, ch_expr: &'static str) -> Column {
    Column { gql, ch_expr }
}

/// A column exposed under its `ClickHouse` name.
const fn col(name: &'static str) -> Column {
    mp(name, name)
}

/// Shared SQL expressions referenced by both the projection registries and the
/// filter builder so a rename in one place can't drift from the other.
pub(super) const SQL_START_TIME_UNIX: &str = "toUnixTimestamp(start_time)";
pub(super) const SQL_AVG_BADGE_T0: &str = "average_badge_team0";
pub(super) const SQL_AVG_BADGE_T1: &str = "average_badge_team1";
pub(super) const SQL_AVG_BADGE: &str = "average_badge";

/// Match-level columns. All live on `match_player` (denormalized).
pub(super) const MATCH_COLUMNS: &[Column] = &[
    col("match_id"),
    mp("start_time", SQL_START_TIME_UNIX),
    col("duration_s"),
    col("match_mode"),
    col("game_mode"),
    col("game_mode_version"),
    col("bot_difficulty"),
    col("winning_team"),
    col("match_outcome"),
    mp("average_badge_team_0", SQL_AVG_BADGE_T0),
    mp("average_badge_team_1", SQL_AVG_BADGE_T1),
    mp("average_badge", SQL_AVG_BADGE),
    col("is_high_skill_range_parties"),
    col("low_pri_pool"),
    col("new_player_pool"),
    col("not_scored"),
    col("ranked_type"),
    col("rank_interval"),
    col("corrupted_penalty_seed"),
    col("rewards_eligible"),
    col("earned_holiday_award_2025"),
    mp("objectives_mask_team_0", "objectives_mask_team0"),
    mp("objectives_mask_team_1", "objectives_mask_team1"),
    col("team_score"),
    col("match_tracked_stats"),
    mp("team_0_tracked_stats", "team0_tracked_stats"),
    mp("team_1_tracked_stats", "team1_tracked_stats"),
    col("objectives"),
    col("mid_boss"),
    col("street_brawl_rounds"),
    col("first_mid_boss_time_s"),
    col("first_objective_destroyed_time_s"),
    col("banned_hero_ids"),
];

/// Player-level columns. All live on `match_player`.
pub(super) const PLAYER_COLUMNS: &[Column] = &[
    mp("match_id", "match_player.match_id"),
    col("account_id"),
    col("player_slot"),
    col("team"),
    col("hero_id"),
    col("party"),
    col("assigned_lane"),
    mp("start_time", SQL_START_TIME_UNIX),
    col("duration_s"),
    col("match_mode"),
    col("game_mode"),
    col("winning_team"),
    col("match_outcome"),
    mp("average_badge_team_0", SQL_AVG_BADGE_T0),
    mp("average_badge_team_1", SQL_AVG_BADGE_T1),
    mp("average_badge", SQL_AVG_BADGE),
    col("kills"),
    col("deaths"),
    col("assists"),
    col("net_worth"),
    col("last_hits"),
    col("denies"),
    col("ability_points"),
    col("player_level"),
    col("abandon_match_time_s"),
    col("mvp_rank"),
    col("max_level"),
    col("max_player_damage"),
    col("max_player_damage_taken"),
    col("max_boss_damage"),
    col("max_creep_damage"),
    col("max_creep_kills"),
    col("max_neutral_kills"),
    col("max_neutral_damage"),
    col("max_max_health"),
    col("max_hero_bullets_hit"),
    col("max_hero_bullets_hit_crit"),
    col("max_shots_hit"),
    col("max_shots_missed"),
    col("max_self_healing"),
    col("max_player_healing"),
    col("max_gold_player"),
    col("max_gold_player_orbs"),
    col("max_gold_lane_creep"),
    col("max_gold_lane_creep_orbs"),
    col("max_gold_neutral_creep"),
    col("max_gold_neutral_creep_orbs"),
    col("max_gold_boss"),
    col("max_gold_boss_orb"),
    col("max_gold_treasure"),
    col("max_gold_denied"),
    col("max_gold_death_loss"),
    col("max_gold_assists"),
    col("max_gold_team_bonus"),
    col("max_gold_breakable"),
    col("max_gold_ability_assassinate"),
    col("max_gold_item_trophy_collector"),
    col("max_gold_item_cultist_sacrifice"),
    col("max_gold_item_goose_egg"),
    col("max_damage_mitigated"),
    col("max_absorption_provided"),
    col("max_heal_prevented"),
    col("max_possible_creeps"),
    col("max_weapon_power"),
    col("max_tech_power"),
    col("max_teammate_healing"),
    col("max_teammate_barriering"),
    col("final_stats"),
    col("won"),
    col("hero_xp"),
    col("hero_equips"),
    col("abilities"),
    mp("created_at", "toUnixTimestamp(created_at)"),
    col("rewards_eligible"),
    col("earned_holiday_award_2025"),
    col("death_details"),
    col("accolades"),
    col("book_reward"),
    col("power_up_buffs"),
    col("ability_stats"),
    col("player_tracked_stats"),
    col("stats_type_stat"),
    col("hero_build_id"),
    col("pregame_hero_id"),
    col("hero_xp_rewards"),
    col("hero_release_votes"),
    col("player_match_outcome"),
    col("player_rank_initial_display_rank"),
    col("player_rank_initial_flat_progress"),
    col("player_rank_final_flat_progress"),
    col("player_rank_desired_progress_change"),
    col("player_rank_initial_calibration_games"),
    col("player_rank_initial_demotion_protection_games"),
    col("player_rank_consumed_demotion_protection"),
    col("player_rank_initial_win_streak"),
];

/// Columns of the `player_match_history` table. `account_id` and `match_id`
/// are the merge keys and always projected.
pub(super) const MATCH_HISTORY_COLUMNS: &[Column] = &[
    col("account_id"),
    col("match_id"),
    col("hero_id"),
    col("hero_level"),
    mp("start_time", SQL_START_TIME_UNIX),
    col("game_mode"),
    col("match_mode"),
    col("player_team"),
    col("player_kills"),
    col("player_deaths"),
    col("player_assists"),
    col("denies"),
    col("net_worth"),
    col("last_hits"),
    col("team_abandoned"),
    col("abandoned_time_s"),
    col("match_duration_s"),
    col("match_result"),
    mp("objectives_mask_team_0", "objectives_mask_team0"),
    mp("objectives_mask_team_1", "objectives_mask_team1"),
    mp("brawl_score_team_0", "brawl_score_team0"),
    mp("brawl_score_team_1", "brawl_score_team1"),
    col("brawl_avg_round_time_s"),
    col("won"),
    col("player_match_outcome"),
    col("ranked_display_badge"),
    col("ranked_delta"),
    col("ranked_calibration_match"),
    col("ranked_used_demotion_protection"),
];

/// Sub-fields of the `items` Nested column. All `UInt32`.
pub(super) const ITEM_SUBFIELDS: &[&str] = &[
    "game_time_s",
    "item_id",
    "upgrade_id",
    "sold_time_s",
    "flags",
    "imbued_ability_id",
    "upgrade_info",
    "net_worth_at_buy",
];

/// Sub-fields of the materialized `upgrades.*` arrays: the `items` entries that
/// are purchased, non-corrupted upgrade items (migrations 30 and 42). All `UInt32`.
pub(super) const UPGRADE_SUBFIELDS: &[&str] =
    &["item_id", "game_time_s", "sold_time_s", "net_worth_at_buy"];

/// Sub-fields of the `stats` Nested column. All `UInt32`.
pub(super) const STAT_SUBFIELDS: &[&str] = &[
    "time_stamp_s",
    "net_worth",
    "gold_player",
    "gold_player_orbs",
    "gold_lane_creep_orbs",
    "gold_neutral_creep_orbs",
    "gold_boss",
    "gold_boss_orb",
    "gold_treasure",
    "gold_denied",
    "gold_death_loss",
    "gold_lane_creep",
    "gold_neutral_creep",
    "kills",
    "deaths",
    "assists",
    "creep_kills",
    "neutral_kills",
    "possible_creeps",
    "creep_damage",
    "player_damage",
    "neutral_damage",
    "boss_damage",
    "denies",
    "player_healing",
    "ability_points",
    "self_healing",
    "player_damage_taken",
    "max_health",
    "weapon_power",
    "tech_power",
    "shots_hit",
    "shots_missed",
    "damage_absorbed",
    "absorption_provided",
    "hero_bullets_hit",
    "hero_bullets_hit_crit",
    "heal_prevented",
    "heal_lost",
    "damage_mitigated",
    "level",
    "player_barriering",
    "teammate_healing",
    "teammate_barriering",
    "self_damage",
    "bullet_kills",
    "melee_kills",
    "ability_kills",
    "headshot_kills",
    "custom_user_stats",
    "gold_source_players_kills",
    "gold_source_players_damage",
    "gold_source_players_gold",
    "gold_source_players_gold_orbs",
    "gold_source_lane_creeps_kills",
    "gold_source_lane_creeps_damage",
    "gold_source_lane_creeps_gold",
    "gold_source_lane_creeps_gold_orbs",
    "gold_source_neutrals_kills",
    "gold_source_neutrals_damage",
    "gold_source_neutrals_gold",
    "gold_source_neutrals_gold_orbs",
    "gold_source_bosses_kills",
    "gold_source_bosses_damage",
    "gold_source_bosses_gold",
    "gold_source_bosses_gold_orbs",
    "gold_source_treasure_kills",
    "gold_source_treasure_damage",
    "gold_source_treasure_gold",
    "gold_source_treasure_gold_orbs",
    "gold_source_assists_kills",
    "gold_source_assists_damage",
    "gold_source_assists_gold",
    "gold_source_assists_gold_orbs",
    "gold_source_denies_kills",
    "gold_source_denies_damage",
    "gold_source_denies_gold",
    "gold_source_denies_gold_orbs",
    "gold_source_team_bonus_kills",
    "gold_source_team_bonus_damage",
    "gold_source_team_bonus_gold",
    "gold_source_team_bonus_gold_orbs",
    "gold_source_ability_assassinate_kills",
    "gold_source_ability_assassinate_damage",
    "gold_source_ability_assassinate_gold",
    "gold_source_ability_assassinate_gold_orbs",
    "gold_source_item_trophy_collector_kills",
    "gold_source_item_trophy_collector_damage",
    "gold_source_item_trophy_collector_gold",
    "gold_source_item_trophy_collector_gold_orbs",
    "gold_source_item_cultist_sacrifice_kills",
    "gold_source_item_cultist_sacrifice_damage",
    "gold_source_item_cultist_sacrifice_gold",
    "gold_source_item_cultist_sacrifice_gold_orbs",
    "gold_source_breakable_kills",
    "gold_source_breakable_damage",
    "gold_source_breakable_gold",
    "gold_source_breakable_gold_orbs",
    "gold_source_item_goose_egg_kills",
    "gold_source_item_goose_egg_damage",
    "gold_source_item_goose_egg_gold",
    "gold_source_item_goose_egg_gold_orbs",
];

fn lookup<'a>(columns: &'a [Column], gql: &str) -> Option<&'a Column> {
    columns.iter().find(|c| c.gql == gql)
}

#[derive(Debug, Default)]
pub(super) struct Projection {
    pub(super) match_columns: Vec<Column>,
    pub(super) player_columns: Vec<Column>,
    pub(super) items_subfields: Vec<&'static str>,
    pub(super) upgrades_subfields: Vec<&'static str>,
    pub(super) stats_subfields: Vec<&'static str>,
}

impl Projection {
    pub(super) fn include_players(&self) -> bool {
        !self.player_columns.is_empty()
    }
}

pub(super) fn project_matches(look: &Lookahead<'_>) -> Projection {
    let mut projection = Projection::default();
    for col in MATCH_COLUMNS {
        if look.field(col.gql).exists() {
            projection.match_columns.push(*col);
        }
    }
    let players_field = look.field("players");
    if players_field.exists() {
        project_players(&players_field, &mut projection);
    }
    projection
}

pub(super) fn project_match_players(look: &Lookahead<'_>) -> Projection {
    let mut projection = Projection::default();
    project_players(look, &mut projection);
    projection
}

/// Projects the player-level selection `look` (a `MatchPlayer` object).
fn project_players(look: &Lookahead<'_>, projection: &mut Projection) {
    for col in PLAYER_COLUMNS {
        if look.field(col.gql).exists() {
            projection.player_columns.push(*col);
        }
    }
    ensure_player_identity(&mut projection.player_columns);
    ensure_hero_build_keys(look, &mut projection.player_columns);
    collect_subfields(
        look,
        "items",
        ITEM_SUBFIELDS,
        &mut projection.items_subfields,
    );
    collect_subfields(
        look,
        "upgrades",
        UPGRADE_SUBFIELDS,
        &mut projection.upgrades_subfields,
    );
    collect_subfields(
        look,
        "stats",
        STAT_SUBFIELDS,
        &mut projection.stats_subfields,
    );
}

pub(super) fn project_match_history(look: &Lookahead<'_>) -> Vec<Column> {
    let mut columns: Vec<Column> = MATCH_HISTORY_COLUMNS
        .iter()
        .filter(|col| look.field(col.gql).exists())
        .copied()
        .collect();
    // The merge keys must always be grouped on and selected.
    ensure_present(&mut columns, MATCH_HISTORY_COLUMNS, "account_id");
    ensure_present(&mut columns, MATCH_HISTORY_COLUMNS, "match_id");
    // The nested `hero` asset resolver reads `hero_id` from the row.
    if look.field("hero").exists() {
        ensure_present(&mut columns, MATCH_HISTORY_COLUMNS, "hero_id");
    }
    columns
}

fn collect_subfields(
    parent: &Lookahead<'_>,
    field: &'static str,
    registry: &'static [&'static str],
    out: &mut Vec<&'static str>,
) {
    let f = parent.field(field);
    if !f.exists() {
        return;
    }
    for &name in registry {
        if f.field(name).exists() {
            out.push(name);
        }
    }
}

/// The nested `hero_build` resolver reads `hero_id` + `hero_build_id` from the row.
fn ensure_hero_build_keys(look: &Lookahead<'_>, cols: &mut Vec<Column>) {
    if look.field("hero_build").exists() {
        ensure_present(cols, PLAYER_COLUMNS, "hero_id");
        ensure_present(cols, PLAYER_COLUMNS, "hero_build_id");
    }
}

fn ensure_player_identity(cols: &mut Vec<Column>) {
    ensure_present(cols, PLAYER_COLUMNS, "match_id");
    ensure_present(cols, PLAYER_COLUMNS, "account_id");
}

fn ensure_present(cols: &mut Vec<Column>, registry: &[Column], gql: &str) {
    if cols.iter().any(|c| c.gql == gql) {
        return;
    }
    if let Some(col) = lookup(registry, gql) {
        cols.push(*col);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_duplicate_gql_names() {
        for (name, columns) in [
            ("MATCH_COLUMNS", MATCH_COLUMNS),
            ("PLAYER_COLUMNS", PLAYER_COLUMNS),
            ("MATCH_HISTORY_COLUMNS", MATCH_HISTORY_COLUMNS),
        ] {
            for (i, a) in columns.iter().enumerate() {
                for b in &columns[i + 1..] {
                    assert_ne!(a.gql, b.gql, "duplicate GQL name in {name}: {}", a.gql);
                }
            }
        }
    }
}
