//! Shared query of the enemy and mate stats endpoints: per other player, how often and with
//! which result the account played against or with them, from `player_match_roster`.

use crate::routes::v1::matches::types::GameMode;
use crate::services::clickhouse_batcher::in_clause;
use crate::utils::sql::{MatchInfoFilters, ROSTER_DURATION_COLUMN};

/// Which of the roster's player arrays to count.
#[derive(Debug, Clone, Copy)]
pub(super) enum RosterSide {
    Enemy,
    Mate,
}

impl RosterSide {
    fn id_column(self) -> &'static str {
        match self {
            Self::Enemy => "enemy_id",
            Self::Mate => "mate_id",
        }
    }

    fn array_column(self) -> &'static str {
        match self {
            Self::Enemy => "enemy_ids",
            Self::Mate => "mate_ids",
        }
    }

    fn log_comment(self) -> &'static str {
        match self {
            Self::Enemy => "enemy_stats",
            Self::Mate => "mate_stats",
        }
    }
}

pub(super) struct RosterStatsQuery<'a> {
    pub side: RosterSide,
    pub account_id: u32,
    pub game_mode: Option<GameMode>,
    pub match_info: MatchInfoFilters,
    pub min_matches_played: Option<u64>,
    pub max_matches_played: Option<u64>,
    /// Restricts the other players to these accounts.
    pub other_ids: Option<&'a [u32]>,
}

impl RosterStatsQuery<'_> {
    /// `won` is the queried account's own result, so `wins` counts the matches the account won:
    /// against an enemy that is the enemy losing, with a mate it is winning together.
    pub(super) fn build(&self) -> String {
        let id = self.side.id_column();
        let array = self.side.array_column();
        let log_comment = self.side.log_comment();
        // The roster table only contains Ranked/Unranked matches, so no match_mode filter is
        // needed.
        let mut filters = vec![
            format!("account_id = {}", self.account_id),
            GameMode::sql_filter(self.game_mode),
        ];
        filters.extend(self.match_info.predicates("", ROSTER_DURATION_COLUMN));
        // PREWHERE: under FINAL, ClickHouse only moves sorting-key conditions there itself, so
        // the other filters would run after reading every column. Duplicate versions of a row
        // never differ in the filtered columns (checked 2026-10-04), so filtering before FINAL
        // keeps the same rows.
        let prewhere_clause = filters.join(" AND ");
        // The other player's id comes from the ARRAY JOIN, so its filter stays in WHERE.
        let where_clause = self.other_ids.map_or_else(String::new, |ids| {
            format!("WHERE {id} IN ({})", in_clause(ids))
        });
        let mut having_filters = vec![];
        if let Some(min_matches_played) = self.min_matches_played {
            having_filters.push(format!("matches_played >= {min_matches_played}"));
        }
        if let Some(max_matches_played) = self.max_matches_played {
            having_filters.push(format!("matches_played <= {max_matches_played}"));
        }
        let having_clause = if having_filters.is_empty() {
            String::new()
        } else {
            format!("HAVING {}", having_filters.join(" AND "))
        };
        format!(
            "
    SELECT
        {id},
        countIf(won) as wins,
        count() as matches_played,
        groupArray(match_id) as matches
    FROM player_match_roster FINAL
    ARRAY JOIN {array} AS {id}
    PREWHERE {prewhere_clause}
    {where_clause}
    GROUP BY {id}
    {having_clause}
    ORDER BY matches_played DESC
    SETTINGS log_comment = '{log_comment}'
    "
        )
    }
}
