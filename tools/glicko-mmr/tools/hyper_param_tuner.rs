use chrono::{DateTime, NaiveDate};
use glicko_mmr::config::Config;
use glicko_mmr::{types, update_single_rating_period};
use rand::SeedableRng;
use std::collections::HashMap;
use tpe::{TpeOptimizer, parzen_estimator, range};
use tracing::{debug, error, info};

const TARGET_AVG_RATING: f64 = 28.731226357964307;
const TARGET_STD_RATING: f64 = 11.419221962282887;

// Config { rating_unrated: 23.3910902475032, rating_deviation_unrated: 8.144845982324988, rating_deviation_typical: 11.648886693817948, rating_periods_till_full_reset: 88.21611063293939 }

async fn get_start_day(ch_client: &clickhouse::Client) -> clickhouse::error::Result<u32> {
    ch_client
        .query(
            r#"
SELECT toStartOfDay(start_time)
FROM match_info
WHERE match_mode IN ('Ranked', 'Unranked')
    AND average_badge_team0 IS NOT NULL
    AND average_badge_team1 IS NOT NULL
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
    let mut player_ratings_before_rating_period = HashMap::new();
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
        match update_single_rating_period(
            config,
            &matches,
            &player_ratings_before_rating_period,
            false,
        )
        .await
        {
            Ok(updates) if !updates.is_empty() => {
                for update in updates {
                    player_ratings_before_rating_period.insert(update.account_id, update);
                }
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
            let ratings = player_ratings_before_rating_period
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
            let error =
                (avg_rating - TARGET_AVG_RATING).abs() + (std_rating - TARGET_STD_RATING).abs();
            sum_errors += error * error;
            count += 1;
        }
    }
    (sum_errors / count as f64).sqrt()
}

#[tokio::main]
async fn main() {
    common::init_tracing();
    common::init_metrics().unwrap();

    let mut optim_rating_unrated = TpeOptimizer::new(parzen_estimator(), range(10., 40.).unwrap());
    let mut optim_rating_deviation_unrated =
        TpeOptimizer::new(parzen_estimator(), range(1., 10.).unwrap());
    let mut optim_rating_deviation_typical =
        TpeOptimizer::new(parzen_estimator(), range(1., 5.).unwrap());

    let mut best_value = f64::INFINITY;
    let mut best_config = None;
    let mut rng = rand::rngs::StdRng::from_seed(Default::default());
    for _ in 0..1000 {
        let config = Config {
            rating_unrated: optim_rating_unrated.ask(&mut rng).unwrap(),
            rating_deviation_unrated: optim_rating_deviation_unrated.ask(&mut rng).unwrap(),
            rating_deviation_typical: optim_rating_deviation_typical.ask(&mut rng).unwrap(),
            rating_periods_till_full_reset: 90.0,
        };
        debug!("Running with config: {config:?}");
        let rmse = run_data(&config).await;
        optim_rating_unrated
            .tell(config.rating_unrated, rmse)
            .unwrap();
        optim_rating_deviation_unrated
            .tell(config.rating_deviation_unrated, rmse)
            .unwrap();
        optim_rating_deviation_typical
            .tell(config.rating_deviation_typical, rmse)
            .unwrap();
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
