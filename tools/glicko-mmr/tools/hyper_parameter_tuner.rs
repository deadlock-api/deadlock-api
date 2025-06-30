use chrono::Duration;
use glicko_mmr::config::Config;
use glicko_mmr::glicko;
use glicko_mmr::types::{CHMatch, query_all_matches_after_cached};
use std::collections::HashMap;
use tpe::TpeOptimizer;
use tracing::info;

fn test_config(matches_to_process: &[CHMatch], config: &Config) -> anyhow::Result<f64> {
    let mut squared_error = 0.0;
    let mut player_ratings_before = HashMap::new();
    for match_ in matches_to_process.iter() {
        let updates = glicko::update_match(config, match_, &player_ratings_before);
        let mut match_error = 0.0;
        for (update, error) in updates {
            match_error += error.abs();
            player_ratings_before.insert(update.account_id, update);
        }
        squared_error += match_error * match_error / 12. / 12.;
    }
    let mean_squared_error = squared_error / matches_to_process.len() as f64;
    Ok(mean_squared_error.sqrt())
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

    let mut min_error = f64::MAX;
    let mut rng = rand::rng();
    let mut optim_tau = TpeOptimizer::new(tpe::parzen_estimator(), tpe::range(0.3, 2.)?);
    let mut optim_period_days = TpeOptimizer::new(tpe::parzen_estimator(), tpe::range(1., 30.)?);
    let mut optim_regression_rate =
        TpeOptimizer::new(tpe::parzen_estimator(), tpe::range(0.1, 1.2)?);
    for epoch in 1..=1000 {
        let config = Config {
            rating_phi_unrated: 2.,
            rating_sigma_unrated: 0.06,
            rating_period_seconds: Duration::days(optim_period_days.ask(&mut rng)? as i64)
                .num_seconds(),
            tau: optim_tau.ask(&mut rng)?,
            regression_rate: optim_regression_rate.ask(&mut rng)?,
        };
        let error = test_config(&matches_to_process, &config).unwrap_or(f64::MAX);
        optim_tau.tell(config.tau, error)?;
        optim_period_days.tell(config.rating_period_seconds as f64 / 86400., error)?;
        optim_regression_rate.tell(config.regression_rate, error)?;
        if error < min_error {
            min_error = error;
            info!("[{epoch:04}] Error: {error:.5} NEW BEST {:?}", config);
        } else {
            info!("[{epoch:04}] Error: {error:.5} {:?}", config);
        }
    }

    Ok(())
}
