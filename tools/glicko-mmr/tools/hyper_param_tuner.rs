use chrono::{DateTime, NaiveDate};
use glicko_mmr::config::Config;
use glicko_mmr::{types, update_single_rating_period};
use rand::SeedableRng;
use std::collections::HashMap;
use tpe::{TpeOptimizer, parzen_estimator, range};
use tracing::{debug, error, info};

const TARGET_AVG_RATING: f64 = 28.731226357964307;
const TARGET_STD_RATING: f64 = 11.419221962282887;

async fn get_start_day(ch_client: &clickhouse::Client) -> clickhouse::error::Result<u32> {
    ch_client
        .query(
            r#"
SELECT toStartOfDay(start_time) as start
FROM match_info
WHERE match_mode IN ('Ranked', 'Unranked')
    AND start_time >= '2025-01-01'
ORDER BY match_id
LIMIT 1
"#,
        )
        .fetch_one()
        .await
}

async fn run_data(config: &Config) -> f64 {
    let ch_client = common::get_ch_client().unwrap();
    let mut player_ratings = HashMap::new();
    let mut start_time = get_start_day(&ch_client).await.unwrap();
    let mut sum_errors = 0.0;
    let mut count = 0;
    loop {
        let matches = types::query_rating_period(&ch_client, start_time, start_time + 24 * 60 * 60)
            .await
            .unwrap();
        if matches.is_empty() {
            break;
        }
        let mut all_ratings: HashMap<(u64, u32), f64> = HashMap::new();
        match update_single_rating_period(config, &matches, &player_ratings, true).await {
            Ok(updates) if !updates.is_empty() => {
                for update in updates.iter() {
                    all_ratings.insert((update.match_id, update.account_id), update.rating);
                }
                player_ratings.insert(
                    updates.last().unwrap().account_id,
                    updates.last().unwrap().clone(),
                );
            }
            Ok(_) => {
                info!("No matches to process, sleeping...");
                break;
            }
            Err(e) => {
                error!("Failed to update ratings: {}", e);
                break;
            }
        }
        start_time += 24 * 60 * 60;

        if DateTime::from_timestamp(start_time as i64, 0)
            .unwrap()
            .date_naive()
            >= NaiveDate::from_ymd_opt(2025, 5, 1).unwrap()
        {
            let ratings = player_ratings
                .values()
                .map(|entry| entry.rating)
                .collect::<Vec<_>>();
            let avg_rating = ratings.iter().sum::<f64>() / ratings.len() as f64;
            let std_rating = ratings
                .iter()
                .map(|x| (x - avg_rating).powi(2))
                .sum::<f64>()
                / (ratings.len() - 1) as f64;
            let std_rating = std_rating.sqrt();
            let dist_error =
                (avg_rating - TARGET_AVG_RATING).abs() + (std_rating - TARGET_STD_RATING).abs();

            sum_errors += dist_error.sqrt().powi(2);
            count += 1;
        }
    }
    (sum_errors / count as f64).sqrt()
}

#[tokio::main]
async fn main() {
    common::init_tracing();
    common::init_metrics().unwrap();

    let mut optim_rating_unrated =
        TpeOptimizer::new(parzen_estimator(), range(1000., 3000.).unwrap());
    let mut optim_rating_deviation_unrated =
        TpeOptimizer::new(parzen_estimator(), range(1., 20.).unwrap());
    let mut optim_c = TpeOptimizer::new(parzen_estimator(), range(0., 10.).unwrap());

    let mut best_value = f64::INFINITY;
    let mut best_config = None;
    let mut rng = rand::rngs::StdRng::from_seed(Default::default());
    for _ in 0..1000 {
        let rating_deviation_unrated = optim_rating_deviation_unrated.ask(&mut rng).unwrap();
        let config = Config {
            rating_unrated: optim_rating_unrated.ask(&mut rng).unwrap(),
            rating_deviation_unrated,
            c: optim_c.ask(&mut rng).unwrap(),
        };
        debug!("Running with config: {config:?}");
        let rmse = run_data(&config).await;
        optim_rating_unrated
            .tell(config.rating_unrated, rmse)
            .unwrap();
        optim_rating_deviation_unrated
            .tell(config.rating_deviation_unrated, rmse)
            .unwrap();
        optim_c.tell(config.c, rmse).unwrap();
        if rmse < best_value {
            best_value = rmse;
            best_config = Some(config);
            info!("RMSE: {rmse}, new best value: {best_value}, best_config: {best_config:?}");
        } else {
            info!("RMSE: {rmse}, not better than {best_value}, best_config: {best_config:?}");
        }
    }
    info!("Finished");
}
