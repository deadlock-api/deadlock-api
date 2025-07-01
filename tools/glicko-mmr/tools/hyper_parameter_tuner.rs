use chrono::Duration;
use glicko_mmr::config::Config;
use glicko_mmr::glicko;
use glicko_mmr::types::{CHMatch, query_all_matches_after_cached};
use rand::prelude::*;
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::info;

fn test_config(matches_to_process: &[CHMatch], config: &Config) -> anyhow::Result<f64> {
    let mut squared_error = 0.0;
    let mut player_ratings_before = HashMap::new();
    for match_ in matches_to_process.iter() {
        let updates = glicko::update_match(config, match_, &player_ratings_before);
        for (update, error) in updates {
            squared_error += error * error;
            player_ratings_before.insert(update.account_id, update);
        }
    }
    let mean_squared_error = squared_error / 12. / matches_to_process.len() as f64;
    Ok(mean_squared_error.sqrt())
}

fn new_random_config(rng: &mut ThreadRng) -> Config {
    Config {
        rating_phi_unrated: rng.random_range(1.0..3.0),
        rating_sigma_unrated: rng.random_range(0.01..0.1),
        rating_period_seconds: Duration::days(rng.random_range(1..=30)).num_seconds(),
        tau: rng.random_range(0.3..1.2),
        regression_rate: rng.random_range(0.8..1.2),
        mu_spread: rng.random_range(2.0..=8.6),
        max_spread: rng.random_range(8.0..=16.),
        glicko_weight: rng.random_range(0.0..=1.),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;

    let matches_to_process = query_all_matches_after_cached(&ch_client, 31247319).await?;
    if matches_to_process.is_empty() {
        return Err(anyhow::anyhow!("No matches to process"));
    }

    let min_error = RwLock::new(f64::MAX);
    let mut rng = rand::rng();
    (0..1000)
        .map(|_| new_random_config(&mut rng))
        .collect::<Vec<_>>()
        .into_par_iter()
        .map(|config| (config, test_config(&matches_to_process, &config).unwrap()))
        .for_each(|(config, error)| {
            if error < *min_error.read().unwrap() {
                *min_error.write().unwrap() = error;
                info!("NEW BEST Error: {error:.5} {:?}", config);
            } else {
                info!("Error: {error:.5} {:?}", config);
            }
        });

    Ok(())
}
