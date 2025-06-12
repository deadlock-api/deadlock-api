use crate::types::{Match, PlayerMMR};
use crate::utils;
use crate::utils::rank_to_player_score;
use std::collections::HashMap;
use tracing::info;

const ERROR_MULTIPLIER: f64 = 0.9;
const ERROR_BIAS: f64 = 0.0;

pub(crate) async fn regression(
    ch_client: &clickhouse::Client,
    all_player_mmrs: &mut HashMap<(u32, u32), PlayerMMR>,
) -> anyhow::Result<()> {
    let start_match = utils::get_regression_starting_id(ch_client).await?;
    let mut matches = utils::get_matches_starting_from(ch_client, start_match).await?;
    let mut updates = Vec::new();
    let mut processed = 0;
    let mut sum_squared_errors = 0.0;
    while let Some(match_) = matches.next().await? {
        let match_: Match = match_.into();
        let (updated_mmrs, squared_errors) = run_regression(&match_, all_player_mmrs);
        updates.extend(updated_mmrs);
        sum_squared_errors += squared_errors;

        processed += 1;
        if processed % 1000 == 0 {
            let rmse = (sum_squared_errors / processed as f64).sqrt();
            info!("Processed {processed} matches, RMSE: {rmse}");
            utils::insert_mmrs(ch_client, &updates).await?;
            updates.clear();
        }
    }
    utils::insert_mmrs(ch_client, &updates).await?;
    info!("Done!");

    Ok(())
}

fn run_regression(
    match_: &Match,
    all_mmrs: &mut HashMap<(u32, u32), PlayerMMR>,
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
                        account_id: p.0,
                        player_score: avg_team_rank_true,
                    })
                    .player_score
            })
            .sum::<f64>()
            / 6.0;
        let error = (avg_team_rank_true - avg_team_rank_pred) / 6.0;
        let error = if team.won {
            error + ERROR_BIAS
        } else {
            error - ERROR_BIAS
        } * ERROR_MULTIPLIER;
        let error = error.clamp(-0.5, 0.5);
        squared_error += error * error;
        for p in team.players.iter() {
            let mmr = PlayerMMR{
                match_id: match_.match_id,
                account_id: p.0,
                player_score: all_mmrs.get(p).unwrap().player_score + error,
            };
            all_mmrs.insert(*p, mmr);
            updates.push(mmr);
        }
    }
    (updates, squared_error)
}
