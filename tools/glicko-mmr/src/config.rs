use chrono::Duration;
use clap::Parser;

#[derive(Parser, Debug, Copy, Clone, PartialEq)]
#[command(version, about, long_about = None)]
pub struct Config {
    #[arg(long, env, default_value_t = 2.)] // Hyper parameter tuned
    pub rating_phi_unrated: f64,

    #[arg(long, env, default_value_t = 0.06)]
    pub rating_sigma_unrated: f64,

    #[arg(long, env, default_value_t = Duration::days(14).num_seconds())]
    pub rating_period_seconds: i64,

    #[arg(long, env, default_value_t = 0.53)]
    pub tau: f64,

    #[arg(long, env, default_value_t = 1.17)]
    pub regression_rate: f64,

    #[arg(long, env, default_value_t = 0.77)]
    pub mu_spread: f64,

    #[arg(long, env, default_value_t = 13.7)]
    pub max_spread: f64,
}
