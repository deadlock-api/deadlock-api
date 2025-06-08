use crate::types::{Match, PlayerMMR};
use crate::utils::rank_to_player_score;
use std::collections::HashMap;

const ERROR_MULTIPLIER: f64 = 0.9;
const ERROR_BIAS: f64 = 0.2;

#[derive(Debug, Clone, Copy, Default)]
pub struct Regression;

impl Regression {
    pub(crate) fn run_regression(
        &self,
        match_: &Match,
        all_mmrs: &mut HashMap<u32, PlayerMMR>,
    ) -> (Vec<PlayerMMR>, f64) {
        let mut updates: Vec<PlayerMMR> = Vec::with_capacity(12);
        let mut squared_error = 0.0;
        for team in match_.teams.iter() {
            let avg_team_rank_true = rank_to_player_score(team.average_badge_team);
            let avg_team_rank_pred = team
                .players
                .iter()
                .map(|p| {
                    all_mmrs
                        .entry(*p)
                        .or_insert(PlayerMMR {
                            match_id: match_.match_id,
                            account_id: *p,
                            player_score: avg_team_rank_true,
                        })
                        .player_score
                })
                .sum::<f64>()
                / 6.0;
            let error = (avg_team_rank_true - avg_team_rank_pred) / 6.0;
            let error = if team.won {
                error * ERROR_MULTIPLIER + ERROR_BIAS
            } else {
                error * ERROR_MULTIPLIER - ERROR_BIAS
            };
            squared_error += error * error;
            for p in team.players.iter() {
                let mmr = all_mmrs.get_mut(p).unwrap();
                mmr.match_id = match_.match_id;
                mmr.player_score += error;
                updates.push(*mmr);
            }
        }
        (updates, squared_error)
    }
}
