//! Maps a GraphQL selection set onto `ClickHouse` SELECT expressions. The
//! static `MATCH_COLUMNS` / `PLAYER_COLUMNS` allow-lists are the only column
//! references that reach the emitted SQL.

use async_graphql::Lookahead;

#[derive(Clone, Copy, Debug)]
pub(super) struct Column {
    pub(super) gql: &'static str,
    pub(super) ch_expr: &'static str,
    pub(super) source: ColumnSource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ColumnSource {
    MatchPlayer,
    DemoPlayer,
}

const fn mp(gql: &'static str, ch_expr: &'static str) -> Column {
    Column {
        gql,
        ch_expr,
        source: ColumnSource::MatchPlayer,
    }
}

const fn dp(gql: &'static str, ch_expr: &'static str) -> Column {
    Column {
        gql,
        ch_expr,
        source: ColumnSource::DemoPlayer,
    }
}

/// Shared SQL expressions referenced by both the projection registries and the
/// filter builder so a rename in one place can't drift from the other.
pub(super) const SQL_START_TIME_UNIX: &str = "toUnixTimestamp(start_time)";
pub(super) const SQL_AVG_BADGE_T0: &str = "average_badge_team0";
pub(super) const SQL_AVG_BADGE_T1: &str = "average_badge_team1";

/// Match-level columns. All live on `match_player` (denormalized) except
/// `banned_hero_ids` which comes from `demo_player`.
pub(super) const MATCH_COLUMNS: &[Column] = &[
    mp("match_id", "match_id"),
    mp("start_time", SQL_START_TIME_UNIX),
    mp("duration_s", "duration_s"),
    mp("match_mode", "match_mode"),
    mp("game_mode", "game_mode"),
    mp("game_mode_version", "game_mode_version"),
    mp("bot_difficulty", "bot_difficulty"),
    mp("winning_team", "winning_team"),
    mp("match_outcome", "match_outcome"),
    mp("average_badge_team_0", SQL_AVG_BADGE_T0),
    mp("average_badge_team_1", SQL_AVG_BADGE_T1),
    mp("is_high_skill_range_parties", "is_high_skill_range_parties"),
    mp("low_pri_pool", "low_pri_pool"),
    mp("new_player_pool", "new_player_pool"),
    mp("not_scored", "not_scored"),
    mp("rewards_eligible", "rewards_eligible"),
    mp("earned_holiday_award_2025", "earned_holiday_award_2025"),
    mp("objectives_mask_team_0", "objectives_mask_team0"),
    mp("objectives_mask_team_1", "objectives_mask_team1"),
    mp("team_score", "team_score"),
    mp("match_tracked_stats", "match_tracked_stats"),
    mp("team_0_tracked_stats", "team0_tracked_stats"),
    mp("team_1_tracked_stats", "team1_tracked_stats"),
    mp("objectives", "objectives"),
    mp("mid_boss", "mid_boss"),
    mp("street_brawl_rounds", "street_brawl_rounds"),
    mp("first_mid_boss_time_s", "first_mid_boss_time_s"),
    mp(
        "first_objective_destroyed_time_s",
        "first_objective_destroyed_time_s",
    ),
    dp("banned_hero_ids", "banned_hero_ids"),
];

/// Player-level columns. Most live on `match_player`; `hero_build_id` is from
/// `demo_player`.
pub(super) const PLAYER_COLUMNS: &[Column] = &[
    mp("match_id", "match_player.match_id"),
    mp("account_id", "account_id"),
    mp("player_slot", "player_slot"),
    mp("team", "team"),
    mp("hero_id", "hero_id"),
    mp("party", "party"),
    mp("assigned_lane", "assigned_lane"),
    mp("start_time", SQL_START_TIME_UNIX),
    mp("duration_s", "duration_s"),
    mp("match_mode", "match_mode"),
    mp("game_mode", "game_mode"),
    mp("winning_team", "winning_team"),
    mp("match_outcome", "match_outcome"),
    mp("average_badge_team_0", SQL_AVG_BADGE_T0),
    mp("average_badge_team_1", SQL_AVG_BADGE_T1),
    mp("kills", "kills"),
    mp("deaths", "deaths"),
    mp("assists", "assists"),
    mp("net_worth", "net_worth"),
    mp("last_hits", "last_hits"),
    mp("denies", "denies"),
    mp("ability_points", "ability_points"),
    mp("player_level", "player_level"),
    mp("abandon_match_time_s", "abandon_match_time_s"),
    mp("mvp_rank", "mvp_rank"),
    mp("max_level", "max_level"),
    mp("max_player_damage", "max_player_damage"),
    mp("max_player_damage_taken", "max_player_damage_taken"),
    mp("max_boss_damage", "max_boss_damage"),
    mp("max_creep_damage", "max_creep_damage"),
    mp("max_creep_kills", "max_creep_kills"),
    mp("max_neutral_kills", "max_neutral_kills"),
    mp("max_neutral_damage", "max_neutral_damage"),
    mp("max_max_health", "max_max_health"),
    mp("max_hero_bullets_hit", "max_hero_bullets_hit"),
    mp("max_hero_bullets_hit_crit", "max_hero_bullets_hit_crit"),
    mp("max_shots_hit", "max_shots_hit"),
    mp("max_shots_missed", "max_shots_missed"),
    mp("rewards_eligible", "rewards_eligible"),
    mp("earned_holiday_award_2025", "earned_holiday_award_2025"),
    mp("death_details", "death_details"),
    mp("accolades", "accolades"),
    mp("book_reward", "book_reward"),
    mp("power_up_buffs", "power_up_buffs"),
    mp("ability_stats", "ability_stats"),
    mp("player_tracked_stats", "player_tracked_stats"),
    mp("stats_type_stat", "stats_type_stat"),
    dp("hero_build_id", "hero_build_id"),
];

/// Sub-fields of the `items` Nested column. All `UInt32`.
pub(super) const ITEM_SUBFIELDS: &[&str] = &[
    "game_time_s",
    "item_id",
    "upgrade_id",
    "sold_time_s",
    "flags",
    "imbued_ability_id",
];

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
];

fn lookup<'a>(columns: &'a [Column], gql: &str) -> Option<&'a Column> {
    columns.iter().find(|c| c.gql == gql)
}

#[derive(Debug, Default)]
pub(super) struct Projection {
    pub(super) match_columns: Vec<Column>,
    pub(super) player_columns: Vec<Column>,
    pub(super) items_subfields: Vec<&'static str>,
    pub(super) stats_subfields: Vec<&'static str>,
}

impl Projection {
    pub(super) fn needs_demo_player(&self) -> bool {
        self.match_columns
            .iter()
            .chain(self.player_columns.iter())
            .any(|c| c.source == ColumnSource::DemoPlayer)
    }

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
        for col in PLAYER_COLUMNS {
            if players_field.field(col.gql).exists() {
                projection.player_columns.push(*col);
            }
        }
        ensure_player_identity(&mut projection.player_columns);
        collect_subfields(
            &players_field,
            "items",
            ITEM_SUBFIELDS,
            &mut projection.items_subfields,
        );
        collect_subfields(
            &players_field,
            "stats",
            STAT_SUBFIELDS,
            &mut projection.stats_subfields,
        );
    }
    projection
}

pub(super) fn project_match_players(look: &Lookahead<'_>) -> Projection {
    let mut projection = Projection::default();
    for col in PLAYER_COLUMNS {
        if look.field(col.gql).exists() {
            projection.player_columns.push(*col);
        }
    }
    ensure_player_identity(&mut projection.player_columns);
    collect_subfields(
        look,
        "items",
        ITEM_SUBFIELDS,
        &mut projection.items_subfields,
    );
    collect_subfields(
        look,
        "stats",
        STAT_SUBFIELDS,
        &mut projection.stats_subfields,
    );
    projection
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
    fn no_duplicate_gql_names_in_match_columns() {
        for (i, a) in MATCH_COLUMNS.iter().enumerate() {
            for b in &MATCH_COLUMNS[i + 1..] {
                assert_ne!(
                    a.gql, b.gql,
                    "duplicate GQL name in MATCH_COLUMNS: {}",
                    a.gql
                );
            }
        }
    }

    #[test]
    fn no_duplicate_gql_names_in_player_columns() {
        for (i, a) in PLAYER_COLUMNS.iter().enumerate() {
            for b in &PLAYER_COLUMNS[i + 1..] {
                assert_ne!(
                    a.gql, b.gql,
                    "duplicate GQL name in PLAYER_COLUMNS: {}",
                    a.gql
                );
            }
        }
    }
}
