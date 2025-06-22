use chrono::Duration;
use clap::Parser;

#[derive(Parser, Debug, Copy, Clone, PartialEq)]
#[command(version, about, long_about = None)]
pub struct Config {
    #[arg(long, env, default_value_t = 2.)] // Hyper parameter tuned
    pub rating_phi_unrated: f64,

    #[arg(long, env, default_value_t = 0.06)]
    pub rating_sigma_unrated: f64,

    #[arg(long, env, default_value_t = Duration::days(7).num_seconds())]
    pub rating_period_seconds: i64,

    #[arg(long, env, default_value_t = 0.5)]
    pub tau: f64,
}
