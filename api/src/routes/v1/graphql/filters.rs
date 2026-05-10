//! GraphQL input types for filtering `match_player` rows.
//!
//! Each scalar `*Filter` exposes the standard set of operators and compiles
//! into a SQL fragment. Values are inlined as literals (integers / quoted
//! strings) — the filter values come from async-graphql's parser so they're
//! constrained to safe primitives, and string values get single-quote escaped.
//!
//! Multiple field filters on a `MatchWhere` / `MatchPlayerWhere` are AND-ed.

use async_graphql::InputObject;
use itertools::Itertools;

use crate::routes::v1::graphql::projection::{
    SQL_AVG_BADGE_T0, SQL_AVG_BADGE_T1, SQL_START_TIME_UNIX,
};

fn escape_sql_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

fn quoted(s: &str) -> String {
    format!("'{}'", escape_sql_string(s))
}

fn and_join(mut parts: Vec<String>) -> Option<String> {
    match parts.len() {
        0 => None,
        1 => Some(parts.swap_remove(0)),
        _ => Some(format!("({})", parts.join(" AND "))),
    }
}

fn null_predicate(col: &str, is_null: bool) -> String {
    if is_null {
        format!("{col} IS NULL")
    } else {
        format!("{col} IS NOT NULL")
    }
}

macro_rules! numeric_filter {
    ($name:ident, $ty:ty) => {
        #[derive(Clone, Debug, Default, InputObject)]
        #[graphql(rename_fields = "snake_case")]
        pub(super) struct $name {
            pub(super) eq: Option<$ty>,
            pub(super) r#in: Option<Vec<$ty>>,
            pub(super) gt: Option<$ty>,
            pub(super) gte: Option<$ty>,
            pub(super) lt: Option<$ty>,
            pub(super) lte: Option<$ty>,
            pub(super) is_null: Option<bool>,
        }

        impl $name {
            pub(super) fn to_sql(&self, col: &str) -> Option<String> {
                let mut parts = Vec::new();
                if let Some(v) = self.eq {
                    parts.push(format!("{col} = {v}"));
                }
                if let Some(vs) = &self.r#in
                    && !vs.is_empty()
                {
                    parts.push(format!("{col} IN ({})", vs.iter().join(",")));
                }
                if let Some(v) = self.gt {
                    parts.push(format!("{col} > {v}"));
                }
                if let Some(v) = self.gte {
                    parts.push(format!("{col} >= {v}"));
                }
                if let Some(v) = self.lt {
                    parts.push(format!("{col} < {v}"));
                }
                if let Some(v) = self.lte {
                    parts.push(format!("{col} <= {v}"));
                }
                if let Some(b) = self.is_null {
                    parts.push(null_predicate(col, b));
                }
                and_join(parts)
            }
        }
    };
}

numeric_filter!(U64Filter, u64);
numeric_filter!(U32Filter, u32);
numeric_filter!(I64Filter, i64);

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct StringFilter {
    pub(super) eq: Option<String>,
    pub(super) r#in: Option<Vec<String>>,
    pub(super) is_null: Option<bool>,
}

impl StringFilter {
    pub(super) fn to_sql(&self, col: &str) -> Option<String> {
        let mut parts = Vec::new();
        if let Some(v) = &self.eq {
            parts.push(format!("{col} = {}", quoted(v)));
        }
        if let Some(vs) = &self.r#in
            && !vs.is_empty()
        {
            parts.push(format!(
                "{col} IN ({})",
                vs.iter().map(|s| quoted(s)).join(",")
            ));
        }
        if let Some(b) = self.is_null {
            parts.push(null_predicate(col, b));
        }
        and_join(parts)
    }
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct BoolFilter {
    pub(super) eq: Option<bool>,
    pub(super) is_null: Option<bool>,
}

impl BoolFilter {
    pub(super) fn to_sql(&self, col: &str) -> Option<String> {
        let mut parts = Vec::new();
        if let Some(v) = self.eq {
            parts.push(format!("{col} = {v}"));
        }
        if let Some(b) = self.is_null {
            parts.push(null_predicate(col, b));
        }
        and_join(parts)
    }
}

/// Filter input for the `matches` and (transitively) `match_players` queries.
/// All listed columns are filterable. Operations across fields are AND-ed.
#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct MatchPlayerWhere {
    pub(super) match_id: Option<U64Filter>,
    pub(super) account_id: Option<U32Filter>,
    pub(super) hero_id: Option<U32Filter>,
    pub(super) player_slot: Option<U32Filter>,
    pub(super) team: Option<StringFilter>,
    pub(super) start_time: Option<I64Filter>,
    pub(super) duration_s: Option<U32Filter>,
    pub(super) match_mode: Option<StringFilter>,
    pub(super) game_mode: Option<StringFilter>,
    pub(super) winning_team: Option<StringFilter>,
    pub(super) match_outcome: Option<StringFilter>,
    pub(super) average_badge_team_0: Option<U32Filter>,
    pub(super) average_badge_team_1: Option<U32Filter>,
    pub(super) is_high_skill_range_parties: Option<BoolFilter>,
    pub(super) low_pri_pool: Option<BoolFilter>,
    pub(super) new_player_pool: Option<BoolFilter>,
    pub(super) not_scored: Option<BoolFilter>,
    pub(super) rewards_eligible: Option<BoolFilter>,
    pub(super) kills: Option<U32Filter>,
    pub(super) deaths: Option<U32Filter>,
    pub(super) assists: Option<U32Filter>,
    pub(super) net_worth: Option<U32Filter>,
    pub(super) player_level: Option<U32Filter>,
    pub(super) assigned_lane: Option<U32Filter>,
}

impl MatchPlayerWhere {
    pub(super) fn to_sql_filters(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        macro_rules! push {
            ($field:ident, $col:expr) => {
                if let Some(f) = &self.$field
                    && let Some(s) = f.to_sql($col)
                {
                    out.push(s);
                }
            };
        }
        // Match-level (identifying)
        push!(match_id, "match_id");
        push!(start_time, SQL_START_TIME_UNIX);
        push!(duration_s, "duration_s");
        push!(match_mode, "match_mode");
        push!(game_mode, "game_mode");
        push!(winning_team, "winning_team");
        push!(match_outcome, "match_outcome");
        push!(average_badge_team_0, SQL_AVG_BADGE_T0);
        push!(average_badge_team_1, SQL_AVG_BADGE_T1);
        push!(is_high_skill_range_parties, "is_high_skill_range_parties");
        push!(low_pri_pool, "low_pri_pool");
        push!(new_player_pool, "new_player_pool");
        push!(not_scored, "not_scored");
        push!(rewards_eligible, "rewards_eligible");
        // Player-level
        push!(account_id, "account_id");
        push!(hero_id, "hero_id");
        push!(player_slot, "player_slot");
        push!(team, "team");
        push!(kills, "kills");
        push!(deaths, "deaths");
        push!(assists, "assists");
        push!(net_worth, "net_worth");
        push!(player_level, "player_level");
        push!(assigned_lane, "assigned_lane");
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_filter_produces_no_sql() {
        let f = U64Filter::default();
        assert_eq!(f.to_sql("match_id"), None);
    }

    #[test]
    fn eq_filter_produces_eq_sql() {
        let f = U64Filter {
            eq: Some(123),
            ..Default::default()
        };
        assert_eq!(f.to_sql("match_id"), Some("match_id = 123".into()));
    }

    #[test]
    fn combined_operators_are_anded() {
        let f = U64Filter {
            gte: Some(10),
            lt: Some(20),
            ..Default::default()
        };
        let sql = f.to_sql("match_id").unwrap();
        assert!(sql.contains("match_id >= 10"));
        assert!(sql.contains("match_id < 20"));
        assert!(sql.starts_with('('));
    }

    #[test]
    fn string_filter_escapes_quotes() {
        let f = StringFilter {
            eq: Some("Ran'ked".into()),
            ..Default::default()
        };
        assert_eq!(f.to_sql("match_mode").unwrap(), "match_mode = 'Ran\\'ked'");
    }

    #[test]
    fn in_filter_with_empty_vec_yields_no_predicate() {
        let f = U32Filter {
            r#in: Some(vec![]),
            ..Default::default()
        };
        assert_eq!(f.to_sql("hero_id"), None);
    }
}
