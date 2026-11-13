//! The `stats` Nested column of `match_player`: the sub-fields the API serves and where each
//! one is stored.

/// Sub-fields of the `stats` Nested column as the API serves them. All `UInt32` but
/// `custom_user_stats`, which is rebuilt from `custom_user_stats_keys`/`_values`. The
/// [`DUPLICATE_STATS`] names are read from the column they duplicated.
pub(crate) const STAT_SUBFIELDS: &[&str] = &[
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

/// `stats.gold_source_*` sub-fields that were exact copies of another `stats` column in every
/// row (checked across all match ids on 2026-11-13). Their columns were dropped from
/// `match_player` (53 GiB); the API still serves them, read from the original column.
pub(crate) const DUPLICATE_STATS: &[(&str, &str)] = &[
    ("gold_source_players_damage", "player_damage"),
    ("gold_source_lane_creeps_damage", "creep_damage"),
    ("gold_source_lane_creeps_gold", "gold_lane_creep"),
    ("gold_source_lane_creeps_gold_orbs", "gold_lane_creep_orbs"),
    ("gold_source_neutrals_damage", "neutral_damage"),
    ("gold_source_neutrals_gold", "gold_neutral_creep"),
    ("gold_source_bosses_damage", "boss_damage"),
];

/// The stored `stats` sub-field a served one is read from: itself, or the column a dropped
/// duplicate copied.
pub(crate) fn stored_stat(subfield: &str) -> &str {
    DUPLICATE_STATS
        .iter()
        .find(|(served, _)| *served == subfield)
        .map_or(subfield, |(_, stored)| stored)
}

/// The whole `stats` Nested column as an array of named tuples, the shape `SELECT stats` returned
/// before the duplicates were dropped (except for the field order). `custom_user_stats` is left
/// out, as it was never part of it. Needs `enable_named_columns_in_function_tuple = 1`.
pub(crate) fn stats_array_expr() -> String {
    let fields = STAT_SUBFIELDS
        .iter()
        .copied()
        .filter(|f| *f != "custom_user_stats")
        .collect::<Vec<_>>();
    let bindings = fields.join(", ");
    let arrays = fields
        .iter()
        .map(|f| format!("stats.{}", stored_stat(f)))
        .collect::<Vec<_>>()
        .join(", ");
    format!("arrayMap(({bindings}) -> tuple({bindings}), {arrays})")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicates_are_served_and_stored_once() {
        for (served, stored) in DUPLICATE_STATS {
            assert!(STAT_SUBFIELDS.contains(served), "{served} not served");
            assert!(STAT_SUBFIELDS.contains(stored), "{stored} not served");
            assert_eq!(stored_stat(served), *stored);
        }
        assert_eq!(stored_stat("kills"), "kills");
    }

    #[test]
    fn stats_array_reads_originals_for_duplicates() {
        let expr = stats_array_expr();
        assert!(expr.starts_with("arrayMap((time_stamp_s, net_worth, "));
        assert!(!expr.contains("custom_user_stats"));
        assert!(!expr.contains("stats.gold_source_players_damage"));
        assert!(expr.contains("gold_source_players_damage"));
        assert!(expr.contains("stats.gold_source_players_gold"));
    }
}
