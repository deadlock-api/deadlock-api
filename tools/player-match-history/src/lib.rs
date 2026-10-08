//! The `player_match_history` `ClickHouse` row and its conversion from the GC's
//! match history response, shared by the API and history-fetcher so both write
//! the same values.

#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(clippy::pedantic)]

use clickhouse::Row;
use serde::{Deserialize, Serialize};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_history_response;

/// Highest Eternus badge (tier 11, subrank 6). The GC's after-match `ranked_display_badge`
/// keeps extending the flat-progress ladder past it, yielding subranks Valve never displays,
/// so stored badges are capped here.
pub const ETERNUS_MAX_BADGE: u32 = 116;

#[derive(Debug, Clone, Serialize, Deserialize, Row, Eq, PartialEq, Hash)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct PlayerMatchHistoryEntry {
    pub account_id: u32,
    pub match_id: u64,
    /// See more: <https://api.deadlock-api.com/v1/assets/heroes>
    pub hero_id: u8,
    pub hero_level: u32,
    pub start_time: u32,
    pub game_mode: i8,
    pub match_mode: i8,
    pub player_team: i8,
    pub player_kills: u32,
    pub player_deaths: u32,
    pub player_assists: u32,
    pub denies: u32,
    pub net_worth: u32,
    pub last_hits: u32,
    pub team_abandoned: Option<bool>,
    pub abandoned_time_s: Option<u32>,
    pub match_duration_s: u32,
    pub match_result: u32,
    pub objectives_mask_team0: u32,
    pub objectives_mask_team1: u32,
    pub brawl_score_team0: Option<u32>,
    pub brawl_score_team1: Option<u32>,
    pub brawl_avg_round_time_s: Option<u32>,
    /// How the match was scored for the player: 0 = invalid, 1 = win, 2 = loss, 3 = penalized, 4 = penalized party, 5 = not scored.
    pub player_match_outcome: i8,
    /// The ranked badge shown for the player after the match (tier = first digits, subtier = last digit). Within Eternus, where subranks are percentile cuts the GC misreports, this is the badge the player entered the match with. See more: <https://api.deadlock-api.com/v1/assets/ranks>
    pub ranked_display_badge: Option<u32>,
    /// The ranked progress change the player got from this match.
    pub ranked_delta: Option<i32>,
    /// Non-zero if this match counted towards the player's ranked calibration.
    pub ranked_calibration_match: Option<u32>,
    /// Whether the player's demotion protection absorbed a loss in this match.
    pub ranked_used_demotion_protection: Option<bool>,
}

impl PlayerMatchHistoryEntry {
    /// Converts one GC match history entry. `None` if a required field is missing or
    /// out of range for its column.
    #[must_use]
    pub fn from_protobuf(
        account_id: u32,
        entry: c_msg_client_to_gc_get_match_history_response::Match,
    ) -> Option<Self> {
        Some(Self {
            account_id,
            match_id: entry.match_id?,
            hero_id: u8::try_from(entry.hero_id?).ok()?,
            hero_level: entry.hero_level?,
            start_time: entry.start_time?,
            game_mode: i8::try_from(entry.game_mode?).ok()?,
            match_mode: i8::try_from(entry.match_mode?).ok()?,
            player_team: i8::try_from(entry.player_team?).ok()?,
            player_kills: entry.player_kills?,
            player_deaths: entry.player_deaths?,
            player_assists: entry.player_assists?,
            denies: entry.denies?,
            net_worth: entry.net_worth?,
            last_hits: entry.last_hits?,
            team_abandoned: entry.team_abandoned,
            abandoned_time_s: entry.abandoned_time_s,
            match_duration_s: entry.match_duration_s?,
            match_result: entry.match_result?,
            objectives_mask_team0: u32::try_from(entry.objectives_mask_team0?).ok()?,
            objectives_mask_team1: u32::try_from(entry.objectives_mask_team1?).ok()?,
            brawl_score_team0: entry.brawl_score_team0,
            brawl_score_team1: entry.brawl_score_team1,
            brawl_avg_round_time_s: entry.brawl_avg_round_time_s,
            player_match_outcome: i8::try_from(entry.player_match_outcome.unwrap_or_default())
                .ok()?,
            ranked_display_badge: entry
                .ranked_display_badge
                .map(|badge| badge.min(ETERNUS_MAX_BADGE)),
            ranked_delta: entry.ranked_delta,
            ranked_calibration_match: entry.ranked_calibration_match,
            ranked_used_demotion_protection: entry.ranked_used_demotion_protection,
        })
    }

    #[must_use]
    pub fn won(&self) -> bool {
        i8::try_from(self.match_result).is_ok_and(|r| r == self.player_team)
    }

    #[must_use]
    pub fn has_ranked_data(&self) -> bool {
        self.ranked_display_badge.is_some()
            || self.ranked_delta.is_some()
            || self.ranked_calibration_match.is_some()
            || self.ranked_used_demotion_protection.is_some()
    }

    /// Fills unset ranked fields from `fallback`, mirroring the table's
    /// `CoalescingMergeTree` merge.
    #[must_use]
    pub fn coalesce_ranked(mut self, fallback: &Self) -> Self {
        self.ranked_display_badge = self.ranked_display_badge.or(fallback.ranked_display_badge);
        self.ranked_delta = self.ranked_delta.or(fallback.ranked_delta);
        self.ranked_calibration_match = self
            .ranked_calibration_match
            .or(fallback.ranked_calibration_match);
        self.ranked_used_demotion_protection = self
            .ranked_used_demotion_protection
            .or(fallback.ranked_used_demotion_protection);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> c_msg_client_to_gc_get_match_history_response::Match {
        c_msg_client_to_gc_get_match_history_response::Match {
            match_id: Some(1),
            hero_id: Some(7),
            hero_level: Some(30),
            start_time: Some(1_700_000_000),
            game_mode: Some(1),
            match_mode: Some(4),
            player_team: Some(1),
            player_kills: Some(5),
            player_deaths: Some(2),
            player_assists: Some(9),
            denies: Some(3),
            net_worth: Some(40_000),
            last_hits: Some(200),
            match_duration_s: Some(1_800),
            match_result: Some(1),
            objectives_mask_team0: Some(3),
            objectives_mask_team1: Some(5),
            brawl_score_team0: Some(2),
            brawl_score_team1: Some(3),
            brawl_avg_round_time_s: Some(120),
            ranked_display_badge: Some(118),
            ..Default::default()
        }
    }

    #[test]
    fn keeps_brawl_fields_and_caps_eternus_badge() {
        let row = PlayerMatchHistoryEntry::from_protobuf(42, entry()).unwrap();
        assert_eq!(row.brawl_score_team0, Some(2));
        assert_eq!(row.brawl_score_team1, Some(3));
        assert_eq!(row.brawl_avg_round_time_s, Some(120));
        assert_eq!(row.ranked_display_badge, Some(ETERNUS_MAX_BADGE));
        assert!(row.won());
    }

    #[test]
    fn rejects_out_of_range_hero_id() {
        let mut e = entry();
        e.hero_id = Some(300);
        assert!(PlayerMatchHistoryEntry::from_protobuf(42, e).is_none());
    }
}
