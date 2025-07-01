use crate::config::Config;
use crate::types::{CHMatch, Glicko2HistoryEntry};
use crate::utils;
use chrono::Duration;
use roots::SimpleConvergency;
use std::collections::HashMap;
use std::f64::consts::{E, PI};

#[tracing::instrument(skip(player_ratings_before))]
pub fn update_match(
    config: &Config,
    match_: &CHMatch,
    player_ratings_before: &HashMap<u32, Glicko2HistoryEntry>,
) -> Vec<(Glicko2HistoryEntry, f64)> {
    let mut updates = Vec::with_capacity(12);
    for p in &match_.team0_players {
        updates.push(update_glicko_rating(
            config,
            match_,
            *p,
            &match_.team0_players,
            &match_.team1_players,
            match_.winning_team == 0,
            match_.avg_badge_team0,
            match_.avg_badge_team1,
            player_ratings_before,
        ));
    }
    for p in &match_.team1_players {
        updates.push(update_glicko_rating(
            config,
            match_,
            *p,
            &match_.team1_players,
            &match_.team0_players,
            match_.winning_team == 1,
            match_.avg_badge_team1,
            match_.avg_badge_team0,
            player_ratings_before,
        ));
    }
    updates
}

#[allow(clippy::too_many_lines)]
#[allow(clippy::too_many_arguments)]
fn update_glicko_rating(
    config: &Config,
    match_: &CHMatch,
    player: u32,
    mates: &[u32],
    opponents: &[u32],
    won: bool,
    avg_badge_player: u32,
    avg_badge_opponents: u32,
    player_ratings_before: &HashMap<u32, Glicko2HistoryEntry>,
) -> (Glicko2HistoryEntry, f64) {
    let avg_mu_player = config.mu_spread * (utils::rank_to_rating(avg_badge_player) / 66. * 2. - 1.);
    let avg_mu_opponents =
        config.mu_spread * (utils::rank_to_rating(avg_badge_opponents) / 66. * 2. - 1.);

    // Get current rating mu
    let rating_mu = player_ratings_before
        .get(&player)
        .map_or(avg_mu_player, |entry| entry.rating_mu);
    let phi = match player_ratings_before.get(&player) {
        Some(entry) => new_rating_phi(
            config,
            entry.rating_phi,
            entry.rating_sigma,
            match_.start_time - entry.start_time,
        ),
        None => config.rating_phi_unrated, // If the player has no rating history, use the default rating mu
    };
    let sigma = player_ratings_before
        .get(&player)
        .map_or(config.rating_sigma_unrated, |entry| entry.rating_sigma);

    // Get opponent values
    let opponents_eg = opponents
        .iter()
        .map(move |opponent_id| {
            let opponent_mu = player_ratings_before
                .get(opponent_id)
                .map_or(avg_mu_opponents, |e| e.rating_mu);
            let opponent_phi = player_ratings_before
                .get(opponent_id)
                .map_or(config.rating_phi_unrated, |e| e.rating_phi);
            (
                e(rating_mu, opponent_mu, opponent_phi).clamp(1e-6, 1.0 - 1e-6),
                g(opponent_phi),
            )
        })
        .collect::<Vec<_>>();

    // Calculate estimated variance
    let estimated_variance = 1.
        / opponents_eg
            .iter()
            .map(|(e, g)| g.powi(2) * (e * (1.0 - e)))
            .sum::<f64>();

    // Calculate estimated improvement
    let outcome = if won { 1.0 } else { 0.0 };
    let delta = estimated_variance
        * opponents_eg
            .iter()
            .map(|(e, g)| g * (outcome - e))
            .sum::<f64>();

    let mut convergency = SimpleConvergency {
        eps: 1e-10f64,
        max_iter: 100,
    };

    let f = |x: f64| {
        let numerator_1 = x.exp() * (delta.powi(2) - phi.powi(2) - estimated_variance - x.exp());
        let denominator_1 = 2.0 * (phi.powi(2) + estimated_variance + x.exp()).powi(2);
        let ratio_1 = numerator_1 / denominator_1;
        let ratio_2 = (x - sigma.powi(2).ln()) / config.tau.powi(2);
        ratio_1 - ratio_2
    };

    let a = (sigma * sigma).ln();
    let b = if delta * delta > phi * phi + estimated_variance {
        (delta * delta - phi * phi - estimated_variance).ln()
    } else {
        let mut k = 1.0;
        loop {
            let b = a - k * config.tau;
            if f(b) < 0.0 {
                k += 1.0;
            } else {
                break b;
            }
        }
    };

    let root = roots::find_root_regula_falsi(a, b, &f, &mut convergency).unwrap();
    let new_rating_sigma = root.exp().sqrt();
    let new_rating_phi =
        1. / (1. / (phi.powi(2) + new_rating_sigma.powi(2)) + 1. / estimated_variance).sqrt();
    let glicko_mu_update = new_rating_phi.powi(2)
        * opponents_eg
            .iter()
            .map(|(e, g)| g * (outcome - e))
            .sum::<f64>();

    let sum_mu_team_pred: f64 = mates
        .iter()
        .filter(|p| *p != &player)
        .map(|p| {
            player_ratings_before
                .get(p)
                .map_or(avg_mu_player, |e| e.rating_mu)
        })
        .chain(std::iter::once(rating_mu))
        .sum();
    let avg_mu_team_pred = sum_mu_team_pred / mates.len() as f64;
    let error = (avg_mu_player - avg_mu_team_pred) / mates.len() as f64;
    let regression_mu_update = error * config.regression_rate;

    // Exclude Ethernus 6 parties as they are sometimes buggy
    let new_rating_mu = rating_mu
        + if avg_badge_player == 116 {
            glicko_mu_update
        } else {
            config.glicko_weight * glicko_mu_update
                + (1. - config.glicko_weight) * regression_mu_update
        };

    (
        Glicko2HistoryEntry {
            account_id: player,
            match_id: match_.match_id,
            rating_mu: new_rating_mu.clamp(-config.max_spread, config.max_spread),
            rating_phi: new_rating_phi.min(config.rating_phi_unrated),
            rating_sigma: new_rating_sigma.min(config.rating_sigma_unrated),
            start_time: match_.start_time,
        },
        error,
    )
}

fn new_rating_phi(
    config: &Config,
    rating_phi: f64,
    rating_sigma: f64,
    time_since_last_match: Duration,
) -> f64 {
    let rating_period_fraction =
        time_since_last_match.num_seconds() as f64 / config.rating_period_seconds as f64;
    (rating_phi.powi(2) + rating_sigma.powi(2) * rating_period_fraction).sqrt()
}

fn e(mu: f64, opponent_mu: f64, opponent_phi: f64) -> f64 {
    let denominator = 1.0 + E.powf(-g(opponent_phi) * (mu - opponent_mu));
    1.0 / denominator
}

fn g(opponent_phi: f64) -> f64 {
    let denominator = (1.0 + (3.0 / PI.powi(2)) * opponent_phi.powi(2)).sqrt();
    1.0 / denominator
}
