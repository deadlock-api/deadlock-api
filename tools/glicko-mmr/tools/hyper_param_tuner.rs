use glicko_mmr::config::Config;
use glicko_mmr::types::Glicko2HistoryEntry;
use glicko_mmr::{types, update_single_rating_period};
use rand::SeedableRng;
use std::collections::HashMap;
use tpe::{TpeOptimizer, parzen_estimator, range};
use tracing::{debug, error, info};

const TARGET_AVG_RATING: f64 = 34.5;
const TARGET_STD_RATING: f64 = 19.05037182489273;

async fn get_start_day(ch_client: &clickhouse::Client) -> clickhouse::error::Result<u32> {
    ch_client
        .query(
            r#"
SELECT toStartOfDay(start_time)
FROM match_info
WHERE match_mode IN ('Ranked', 'Unranked')
    AND average_badge_team0 IS NOT NULL
    AND average_badge_team1 IS NOT NULL
    AND start_time >= '2025-05-01'
ORDER BY match_id
LIMIT 1
"#,
        )
        .fetch_one()
        .await
}

async fn run_data(config: &Config) -> HashMap<u32, Glicko2HistoryEntry> {
    let ch_client = common::get_ch_client().unwrap();
    let mut player_ratings_before_rating_period = HashMap::new();
    let mut start_time = get_start_day(&ch_client).await.unwrap();
    loop {
        let matches = types::query_rating_period(&ch_client, start_time, start_time + 24 * 60 * 60)
            .await
            .unwrap();
        if matches.is_empty() {
            break;
        }
        match update_single_rating_period(
            config,
            start_time,
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
    }
    player_ratings_before_rating_period
}

#[tokio::main]
async fn main() {
    common::init_tracing();
    common::init_metrics().unwrap();

    let mut optim_rating_unrated = TpeOptimizer::new(parzen_estimator(), range(10., 50.).unwrap());
    let mut optim_rating_deviation_unrated =
        TpeOptimizer::new(parzen_estimator(), range(10., 200.).unwrap());
    let mut optim_rating_deviation_typical =
        TpeOptimizer::new(parzen_estimator(), range(10., 100.).unwrap());
    let mut optim_rating_periods_till_full_reset =
        TpeOptimizer::new(parzen_estimator(), range(10., 100.).unwrap());

    let mut best_value = f64::INFINITY;
    let mut rng = rand::rngs::StdRng::from_seed(Default::default());
    for _ in 0..1000 {
        let config = Config {
            rating_unrated: optim_rating_unrated.ask(&mut rng).unwrap(),
            rating_deviation_unrated: optim_rating_deviation_unrated.ask(&mut rng).unwrap(),
            rating_deviation_typical: optim_rating_deviation_typical.ask(&mut rng).unwrap(),
            rating_periods_till_full_reset: optim_rating_periods_till_full_reset
                .ask(&mut rng)
                .unwrap(),
        };
        debug!("Running with config: {config:?}");
        let player_ratings = run_data(&config).await;
        let ratings = player_ratings
            .into_values()
            .map(|entry| entry.rating)
            .collect::<Vec<_>>();
        let avg_rating = ratings.iter().sum::<f64>() / ratings.len() as f64;
        let std_rating = ratings
            .iter()
            .map(|x| (x - avg_rating).powi(2))
            .sum::<f64>()
            / (ratings.len() - 1) as f64;
        let std_rating = std_rating.sqrt();
        info!("Average rating: {}", avg_rating);
        info!("Standard deviation: {}", std_rating);
        let error =
            ((avg_rating - TARGET_AVG_RATING).abs() + (std_rating - TARGET_STD_RATING).abs()) / 2.0;
        info!("Error: {}", error);
        optim_rating_unrated
            .tell(config.rating_unrated, error)
            .unwrap();
        optim_rating_deviation_unrated
            .tell(config.rating_deviation_unrated, error)
            .unwrap();
        optim_rating_deviation_typical
            .tell(config.rating_deviation_typical, error)
            .unwrap();
        optim_rating_periods_till_full_reset
            .tell(config.rating_periods_till_full_reset, error)
            .unwrap();
        if error < best_value {
            best_value = error;
            info!("New best value: {best_value}, config: {config:?}");
        } else {
            info!("Not better than {best_value}, config: {config:?}");
        }
    }
    info!("Finished");
}
