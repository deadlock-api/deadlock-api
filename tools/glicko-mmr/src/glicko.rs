use crate::config::Config;
use crate::types::{CHMatch, Glicko2HistoryEntry};
use crate::utils;
use anyhow::bail;
use cached::proc_macro::once;
use chrono::Duration;
use std::collections::HashMap;
use std::f64::consts::{E, PI};

#[once]
pub fn q() -> f64 {
    10f64.ln() / 400.0
}

#[tracing::instrument(skip(matches, before_player_ratings))]
pub fn update_player_ratings_all_matches(
    config: &Config,
    account_id: u32,
    matches: &[&CHMatch], // Assume matches are sorted by match_id
    before_player_ratings: &HashMap<u32, Glicko2HistoryEntry>,
) -> anyhow::Result<Vec<Glicko2HistoryEntry>> {
    let mut applied_matches = vec![];
    let mut out = vec![];
    for match_ in matches {
        applied_matches.push(*match_);
        out.push(update_player_rating(
            config,
            account_id,
            &applied_matches,
            before_player_ratings,
        )?);
    }
    Ok(out)
}

pub fn update_player_rating(
    config: &Config,
    account_id: u32,
    matches: &[&CHMatch], // Assume matches are sorted by match_id
    before_player_ratings: &HashMap<u32, Glicko2HistoryEntry>,
) -> anyhow::Result<Glicko2HistoryEntry> {
    if matches.is_empty() {
        bail!("No matches to update ratings for");
    }
    // Step 1: Calculate the new rating deviation (`rd`) for the player based on the time since their last match.
    let rating = before_player_ratings
        .get(&account_id)
        .map(|entry| entry.rating)
        .unwrap_or_else(|| {
            utils::rank_to_rating(if matches[0].team0_players.contains(&account_id) {
                matches[0].avg_badge_team0
            } else {
                matches[0].avg_badge_team1
            })
        });
    let rating_deviation = match before_player_ratings.get(&account_id) {
        Some(entry) => new_rd(
            config,
            entry.rating_deviation,
            matches[0].start_time - entry.start_time, // matches[0] is safe because we checked that matches is not empty
        ),
        None => config.rating_deviation_unrated, // If the player has no rating history, use the default RD_UNRATED
    };

    let opponents = matches
        .iter()
        .flat_map(|m| {
            let (opponent_team, avg_opponent_team_badge, won) =
                if m.team0_players.contains(&account_id) {
                    (&m.team1_players, m.avg_badge_team1, m.winning_team == 0)
                } else {
                    (&m.team0_players, m.avg_badge_team0, m.winning_team == 1)
                };
            opponent_team.iter().map(move |opponent_id| {
                let opponent_rating = before_player_ratings
                    .get(opponent_id)
                    .map(|entry| entry.rating)
                    .unwrap_or(utils::rank_to_rating(avg_opponent_team_badge));
                let opponent_rd = before_player_ratings
                    .get(opponent_id)
                    .map(|entry| entry.rating_deviation)
                    .unwrap_or(config.rating_deviation_unrated);
                (opponent_rating, opponent_rd, won)
            })
        })
        .collect::<Vec<_>>();
    let one_over_d_squared = q().powi(2)
        * opponents
            .iter()
            .map(|(opponent_rating, opponent_rd, _)| {
                let e = e(rating, *opponent_rating, *opponent_rd);
                g(*opponent_rd).powi(2) * e * (1.0 - e)
            })
            .sum::<f64>();
    let denominator = 1.0 / rating_deviation.powi(2) + one_over_d_squared;
    let new_rating_deviation = (1.0 / denominator).sqrt();
    if new_rating_deviation.is_nan() {
        bail!("New rating deviation is NaN");
    }
    let new_rating = rating
        + q() / denominator
            * opponents
                .into_iter()
                .map(|(opponent_rating, opponent_rd, won)| {
                    g(opponent_rd) * (won as u8 as f64 - e(rating, opponent_rating, opponent_rd))
                })
                .sum::<f64>();
    // Calculate the error from our rating to the avg badge of the match
    let error = matches
        .iter()
        .map(|m| {
            let team_players = if m.team0_players.contains(&account_id) {
                &m.team0_players
            } else {
                &m.team1_players
            };
            let team_rating = team_players
                .iter()
                .map(|p| {
                    before_player_ratings
                        .get(p)
                        .map(|entry| entry.rating)
                        .unwrap_or_else(|| {
                            utils::rank_to_rating(if m.team0_players.contains(p) {
                                m.avg_badge_team0
                            } else {
                                m.avg_badge_team1
                            })
                        })
                })
                .sum::<f64>()
                / team_players.len() as f64;
            let avg_badge = if m.team0_players.contains(&account_id) {
                m.avg_badge_team0
            } else {
                m.avg_badge_team1
            };
            (avg_badge as f64 - utils::rating_to_rank(team_rating) as f64).abs()
                / team_players.len() as f64
        })
        .sum::<f64>()
        / matches.len() as f64;
    Ok(Glicko2HistoryEntry {
        account_id,
        match_id: matches.last().unwrap().match_id, // unwrap is safe because we checked that matches is not empty
        rating: new_rating + config.update_error_rate * error,
        rating_deviation: new_rating_deviation,
        start_time: matches.last().unwrap().start_time, // unwrap is safe because we checked that matches is not empty
    })
}

/// Calculates the new rating deviation (`rd`) for a player based on the time since their last match.
///
/// # Formula
/// RD = min(sqrt(RD₀² + c² * t), RD_UNRATED)
///
/// # Arguments
/// * `old_rd` - The player's previous rating deviation.
/// * `time_since_last_match` - The duration since the player's last match, represented as a `Duration`.
///
/// # Returns
/// * The updated rating deviation (`rd`) for the player, capped at `RD_UNRATED`.
fn new_rd(config: &Config, old_rd: f64, time_since_last_match: Duration) -> f64 {
    (old_rd.powi(2) + config.c.powi(2) * (time_since_last_match.num_days() / 7) as f64)
        .sqrt()
        .min(config.rating_deviation_unrated)
}

/// Calculates the g(RD) value used in the Glicko-2 rating system.
///
/// # Formula
/// g(RD) = 1 / sqrt(1 + 3 * q² * RD² / π²)
///
/// # Arguments
/// * `rd` - The player's rating deviation.
///
/// # Returns
/// * The g(RD) value.
fn g(rd: f64) -> f64 {
    1.0 / (1.0 + (3.0 / PI.powi(2)) * q().powi(2) * rd.powi(2)).sqrt()
}

/// Calculates the expected score (E) for a player against an opponent.
///
/// # Formula
/// E = 1 / (1 + e^(-g(RD) * Q * (R - R')))
///
/// # Arguments
/// * `rating` - The player's rating.
/// * `rating_opponent` - The opponent's rating.
/// * `rd_opponent` - The opponent's rating deviation.
///
/// # Returns
/// * The expected score (E) for the player against the opponent.
fn e(rating: f64, rating_opponent: f64, rd_opponent: f64) -> f64 {
    1.0 / (1.0 + E.powf(-g(rd_opponent) * q() * (rating - rating_opponent)))
}
