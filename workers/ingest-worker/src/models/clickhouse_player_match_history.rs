use assets_client::RankLadder;
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use valveprotos::deadlock::CMsgMatchPlayerRankData;
use valveprotos::deadlock::c_msg_match_meta_data_contents::{MatchInfo, Players};

use crate::models::enums::{PlayerMatchOutcome, Team};

/// Mirrors `player_match_history.source Enum8('history_fetcher' = 1, 'match_player' = 2)`;
/// `HistoryFetcher` is the column default, so it stays even though this crate only writes
/// `MatchPlayer`.
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
    pub low_pri_pool: Option<bool>,
    pub source: Source,
}

/// The badge the final flat progress falls in on the ladder of the match's ranked interval
/// (Season 1: 7000 per tier, Season 2: 6500), in Eternus the division of the display rank.
/// Players still in placement show no badge at all, which the GC reports as 0.
fn derived_badge(rank: &CMsgMatchPlayerRankData, ladder: &RankLadder) -> Option<u32> {
    let display_rank = rank.initial_display_rank?;
    if display_rank == 0 {
        return Some(0);
    }
    Some(ladder.badge(rank.final_flat_progress?, display_rank))
}

/// The GC (and the in-game history screen) reports `desired_progress_change` on the
/// loss that triggers demotion protection (`initial_demotion_protection_games == 0`),
/// even though the realised change is clamped at the tier floor; while protection
/// games remain it reports the realised flat diff. Verified against 12,556
/// history-fetcher rows with zero exceptions. Calibration matches move progress but
/// the GC reports no change for them.
fn derived_delta(rank: &CMsgMatchPlayerRankData, in_calibration: bool) -> Option<i32> {
    if in_calibration {
        return Some(0);
    }
    if rank.initial_demotion_protection_games? == 0 {
        return rank.desired_progress_change;
    }
    let final_progress = i32::try_from(rank.final_flat_progress?).ok()?;
    let initial = i32::try_from(rank.initial_flat_progress?).ok()?;
    final_progress.checked_sub(initial)
}

/// The GC only flags demotion protection while protection games remain; on the
/// trigger loss it reports `consumed_demotion_protection` as false.
fn derived_used_demotion_protection(rank: &CMsgMatchPlayerRankData) -> Option<bool> {
    let consumed = rank.consumed_demotion_protection?;
    Some(consumed && rank.initial_demotion_protection_games.unwrap_or(0) > 0)
}

impl PlayerMatchHistoryEntry {
    /// `ladder` is the rank ladder of the match's ranked interval, which the badge is read on.
    /// `calibration_matches` is the current season's placement length, needed
    /// because metadata counts placement games remaining while the GC counts the
    /// match's position in the sequence. `None` leaves that one field unset.
    pub(crate) fn from_info_and_player(
        match_info: &MatchInfo,
        player: &Players,
        calibration_matches: Option<u32>,
        ladder: &RankLadder,
    ) -> Option<Self> {
        let rank = player.player_rank_data;
        let calibration_left = rank
            .and_then(|r| r.initial_calibration_games)
            .unwrap_or_default();
        let in_calibration = calibration_left > 0;
        let rounds = &match_info.street_brawl_rounds;
        let brawl_score = |team: Team| {
            let team = i32::from(team as i8);
            if rounds.is_empty() {
                return None;
            }
            let won = rounds
                .iter()
                .filter_map(|r| r.winning_team)
                .filter(|&r| r == team)
                .count();
            u32::try_from(won).ok()
        };
        Some(Self {
            account_id: player.account_id?,
            match_id: match_info.match_id?,
            hero_id: u8::try_from(player.hero_id?).ok()?,
            hero_level: player.level?,
            start_time: match_info.start_time?,
            game_mode: i8::try_from(match_info.game_mode?).ok()?,
            match_mode: i8::try_from(match_info.match_mode?).ok()?,
            player_team: i8::try_from(player.team?).ok()?,
            player_kills: player.kills?,
            player_deaths: player.deaths?,
            player_assists: player.assists?,
            denies: player.denies?,
            net_worth: player.net_worth?,
            last_hits: player.last_hits?,
            abandoned_time_s: player.abandon_match_time_s,
            match_duration_s: match_info.duration_s?,
            match_result: match_info.winning_team?.cast_unsigned(),
            objectives_mask_team0: u32::try_from(match_info.objectives_mask_team0?).ok()?,
            objectives_mask_team1: u32::try_from(match_info.objectives_mask_team1?).ok()?,
            brawl_score_team0: brawl_score(Team::Team0),
            brawl_score_team1: brawl_score(Team::Team1),
            // `None` without rounds
            brawl_avg_round_time_s: u32::try_from(rounds.len()).ok().and_then(|n| {
                rounds
                    .iter()
                    .filter_map(|r| r.round_duration_s)
                    .fold(0, u32::saturating_add)
                    .checked_div(n)
            }),
            player_match_outcome: PlayerMatchOutcome::from(player.player_match_outcome()),
            ranked_display_badge: rank.as_ref().and_then(|r| derived_badge(r, ladder)),
            ranked_delta: rank.as_ref().and_then(|r| derived_delta(r, in_calibration)),
            ranked_calibration_match: if in_calibration {
                calibration_matches
                    .map(|total| total.saturating_add(1).saturating_sub(calibration_left))
            } else {
                Some(0)
            },
            ranked_used_demotion_protection: rank
                .as_ref()
                .and_then(derived_used_demotion_protection),
            low_pri_pool: match_info.low_pri_pool,
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
    fn badge_is_read_on_the_ladder_of_the_interval() {
        // Season 1: subtier 6 spans two 1000-point steps, so each tier covers seven of them.
        for (progress, expected) in [(0, 11), (5_000, 16), (6_975, 16), (7_000, 21), (53_225, 85)] {
            assert_eq!(
                derived_badge(&rank(85, progress), &RankLadder::SEASON_1),
                Some(expected),
                "progress {progress}"
            );
        }
        // #675: match 131960662 of account 76343519 ended on 49_900, Oracle V in Season 2.
        assert_eq!(
            derived_badge(&rank(85, 49_900), &RankLadder::SEASON_2),
            Some(85)
        );
        assert_eq!(
            derived_badge(&rank(105, 64_000), &RankLadder::SEASON_2),
            Some(106)
        );
    }

    #[test]
    fn badge_is_zero_while_still_in_placement() {
        assert_eq!(derived_badge(&rank(0, 125), &RankLadder::SEASON_2), Some(0));
    }

    #[test]
    fn delta_is_the_desired_change_on_the_protection_trigger_loss() {
        let r = CMsgMatchPlayerRankData {
            initial_flat_progress: Some(53_225),
            final_flat_progress: Some(53_000),
            desired_progress_change: Some(-250),
            initial_demotion_protection_games: Some(0),
            consumed_demotion_protection: Some(true),
            ..Default::default()
        };
        assert_eq!(derived_delta(&r, false), Some(-250));
        assert_eq!(derived_delta(&r, true), Some(0));
        assert_eq!(derived_used_demotion_protection(&r), Some(false));
    }

    #[test]
    fn delta_is_the_realised_progress_change_while_in_protection() {
        let r = CMsgMatchPlayerRankData {
            initial_flat_progress: Some(53_000),
            final_flat_progress: Some(53_000),
            desired_progress_change: Some(-250),
            initial_demotion_protection_games: Some(2),
            consumed_demotion_protection: Some(true),
            ..Default::default()
        };
        assert_eq!(derived_delta(&r, false), Some(0));
        assert_eq!(derived_used_demotion_protection(&r), Some(true));
    }
}
