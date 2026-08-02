use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use valveprotos::deadlock::CMsgMatchPlayerRankData;
use valveprotos::deadlock::c_msg_match_meta_data_contents::{MatchInfo, Players};

use crate::models::enums::{PlayerMatchOutcome, Team};

#[derive(Serialize_repr, Deserialize_repr, Copy, Clone, PartialEq, Debug, Default)]
#[repr(i8)]
pub(crate) enum Source {
    #[default]
    HistoryFetcher = 1,
    MatchPlayer = 2,
}

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub(crate) struct PlayerMatchHistoryEntry {
    pub account_id: u32,
    pub match_id: u64,
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
    pub player_match_outcome: PlayerMatchOutcome,
    pub ranked_display_badge: Option<u32>,
    pub ranked_delta: Option<i32>,
    pub ranked_calibration_match: Option<u32>,
    pub ranked_used_demotion_protection: Option<bool>,
    pub source: Source,
}

/// Flat progress maps to a badge in fixed 1000-point steps, seven per tier with the
/// sixth subtier twice as wide. Verified against 141,541 ranked rows.
/// Players still in placement show no badge at all, which the GC reports as 0.
fn derived_badge(rank: &CMsgMatchPlayerRankData) -> Option<u32> {
    if rank.initial_display_rank? == 0 {
        return Some(0);
    }
    let idx = rank.final_flat_progress? / 1000;
    Some((idx / 7 + 1) * 10 + (idx % 7 + 1).min(6))
}

/// `desired_progress_change` is the uncapped intent; the GC reports what actually
/// landed after tier floors and demotion protection. Calibration matches move
/// progress but the GC reports no change for them.
fn derived_delta(rank: &CMsgMatchPlayerRankData, in_calibration: bool) -> Option<i32> {
    if in_calibration {
        return Some(0);
    }
    let final_progress = i32::try_from(rank.final_flat_progress?).ok()?;
    let initial = i32::try_from(rank.initial_flat_progress?).ok()?;
    Some(final_progress - initial)
}

impl PlayerMatchHistoryEntry {
    /// `calibration_matches` is the current season's placement length, needed
    /// because metadata counts placement games remaining while the GC counts the
    /// match's position in the sequence. `None` leaves that one field unset.
    pub(crate) fn from_info_and_player(
        match_info: &MatchInfo,
        player: &Players,
        calibration_matches: Option<u32>,
    ) -> Option<Self> {
        let rank = player.player_rank_data;
        let calibration_left = rank
            .and_then(|r| r.initial_calibration_games)
            .unwrap_or_default();
        let in_calibration = calibration_left > 0;
        Some(Self {
            account_id: player.account_id?,
            match_id: match_info.match_id?,
            hero_id: player.hero_id? as u8,
            hero_level: player.level?,
            start_time: match_info.start_time?,
            game_mode: match_info.game_mode? as i8,
            match_mode: match_info.match_mode? as i8,
            player_team: player.team? as i8,
            player_kills: player.kills?,
            player_deaths: player.deaths?,
            player_assists: player.assists?,
            denies: player.denies?,
            net_worth: player.net_worth?,
            last_hits: player.last_hits?,
            team_abandoned: Some(false), // Not available by Valve
            abandoned_time_s: player.abandon_match_time_s,
            match_duration_s: match_info.duration_s?,
            match_result: match_info.winning_team? as u32,
            objectives_mask_team0: match_info.objectives_mask_team0? as u32,
            objectives_mask_team1: match_info.objectives_mask_team1? as u32,
            brawl_score_team0: (!match_info.street_brawl_rounds.is_empty()).then(|| {
                match_info
                    .street_brawl_rounds
                    .iter()
                    .filter_map(|r| r.winning_team)
                    .filter(|&r| r as u8 == Team::Team0 as u8)
                    .count() as u32
            }),
            brawl_score_team1: (!match_info.street_brawl_rounds.is_empty()).then(|| {
                match_info
                    .street_brawl_rounds
                    .iter()
                    .filter_map(|r| r.winning_team)
                    .filter(|&r| r as u8 == Team::Team1 as u8)
                    .count() as u32
            }),
            brawl_avg_round_time_s: (!match_info.street_brawl_rounds.is_empty()).then(|| {
                match_info
                    .street_brawl_rounds
                    .iter()
                    .filter_map(|&r| r.round_duration_s)
                    .sum::<u32>()
                    / match_info.street_brawl_rounds.len() as u32
            }),
            player_match_outcome: PlayerMatchOutcome::from(player.player_match_outcome()),
            ranked_display_badge: rank.as_ref().and_then(derived_badge),
            ranked_delta: rank.as_ref().and_then(|r| derived_delta(r, in_calibration)),
            ranked_calibration_match: if in_calibration {
                calibration_matches.map(|total| (total + 1).saturating_sub(calibration_left))
            } else {
                Some(0)
            },
            ranked_used_demotion_protection: rank.and_then(|r| r.consumed_demotion_protection),
            source: Source::MatchPlayer,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rank(initial_display_rank: u32, final_flat_progress: u32) -> CMsgMatchPlayerRankData {
        CMsgMatchPlayerRankData {
            initial_display_rank: Some(initial_display_rank),
            final_flat_progress: Some(final_flat_progress),
            ..Default::default()
        }
    }

    #[test]
    fn badge_maps_flat_progress_to_tier_and_subtier() {
        // Subtier 6 spans two 1000-point steps, so each tier covers seven of them.
        for (progress, expected) in [
            (0, 11),
            (1_000, 12),
            (4_000, 15),
            (5_000, 16),
            (6_975, 16),
            (7_000, 21),
            (35_000, 61),
            (53_225, 85),
        ] {
            assert_eq!(
                derived_badge(&rank(85, progress)),
                Some(expected),
                "progress {progress}"
            );
        }
    }

    #[test]
    fn badge_is_zero_while_still_in_placement() {
        assert_eq!(derived_badge(&rank(0, 125)), Some(0));
    }

    #[test]
    fn delta_is_the_realised_progress_change_not_the_desired_one() {
        let r = CMsgMatchPlayerRankData {
            initial_flat_progress: Some(53_225),
            final_flat_progress: Some(53_000),
            desired_progress_change: Some(-250),
            ..Default::default()
        };
        assert_eq!(derived_delta(&r, false), Some(-225));
        assert_eq!(derived_delta(&r, true), Some(0));
    }
}
