use crate::MMRType;
use crate::algorithms::Algorithm;
use crate::types::{AlgorithmType, MMR, Match, PlayerHeroMMR, PlayerMMR};
use crate::utils::rank_to_player_score;
use std::collections::HashMap;

const ERROR_MULTIPLIER: f32 = 0.9;
const ERROR_BIAS: f32 = 0.2;

#[derive(Debug, Clone, Copy, Default)]
pub struct BasicAlgorithm;

impl Algorithm for BasicAlgorithm {
    fn run_regression(
        &self,
        match_: &Match,
        all_mmrs: &mut HashMap<u32, MMR>,
        mmr_type: MMRType,
    ) -> (Vec<MMR>, f32) {
        let mut updates: Vec<MMR> = Vec::with_capacity(12);
        let mut squared_error = 0.0;
        for team in match_.teams.iter() {
            let avg_team_rank_true = rank_to_player_score(team.average_badge_team);
            let avg_team_rank_pred = team
                .players
                .iter()
                .map(|p| {
                    all_mmrs
                        .entry(p.account_id)
                        .or_insert(match mmr_type {
                            MMRType::Player => MMR::Player(PlayerMMR {
                                algorithm: AlgorithmType::Basic,
                                match_id: match_.match_id,
                                account_id: p.account_id,
                                player_score: avg_team_rank_true,
                            }),
                            MMRType::Hero => MMR::Hero(PlayerHeroMMR {
                                algorithm: AlgorithmType::Basic,
                                match_id: match_.match_id,
                                account_id: p.account_id,
                                hero_id: p.hero_id as u8,
                                player_score: avg_team_rank_true,
                            }),
                        })
                        .player_score()
                })
                .sum::<f32>()
                / 6.0;
            let error = (avg_team_rank_true - avg_team_rank_pred) / 6.0;
            let error = if team.won {
                error * ERROR_MULTIPLIER + ERROR_BIAS
            } else {
                error * ERROR_MULTIPLIER - ERROR_BIAS
            };
            squared_error += error * error;
            for p in team.players.iter() {
                let mmr = all_mmrs.get_mut(&p.account_id).unwrap();
                *mmr.player_score_mut() += error;
                updates.push(mmr.clone());
            }
        }
        (updates, squared_error)
    }
}
