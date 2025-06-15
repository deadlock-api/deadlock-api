use crate::config::Config;
use crate::types::{CHMatch, Glicko2HistoryEntry};
use rayon::prelude::*;
use std::collections::HashMap;

pub mod config;
pub mod glicko;
pub mod types;
pub mod utils;

pub async fn update_single_rating_period(
    config: &Config,
    matches: &[CHMatch],
    player_ratings_before_rating_period: &HashMap<u32, Glicko2HistoryEntry>,
    process_all_matches: bool,
) -> anyhow::Result<Vec<Glicko2HistoryEntry>> {
    let mut account_matches: HashMap<u32, Vec<&CHMatch>> = HashMap::new();
    for match_ in matches {
        for account_id in match_
            .team0_players
            .iter()
            .chain(match_.team1_players.iter())
        {
            account_matches.entry(*account_id).or_default().push(match_);
        }
    }
    Ok(account_matches
        .into_par_iter()
        .flat_map(|(account_id, matches)| {
            if process_all_matches {
                glicko::update_player_ratings_all_matches(
                    config,
                    account_id,
                    &matches,
                    player_ratings_before_rating_period,
                )
                .unwrap()
            } else {
                vec![
                    glicko::update_player_rating(
                        config,
                        account_id,
                        &matches,
                        player_ratings_before_rating_period,
                    )
                    .unwrap(),
                ]
            }
        })
        .collect::<Vec<_>>())
}
