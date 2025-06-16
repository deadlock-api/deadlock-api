use clap::Parser;

#[derive(Parser, Debug, Copy, Clone, PartialEq)]
#[command(version, about, long_about = None)]
pub struct Config {
    /// Default rating deviation for unrated players.
    /// Set via --rating-deviation-unrated or RATING_DEVIATION_UNRATED.
    #[arg(long, env, default_value_t = 3.799190821685532)] // Hyper parameter tuned
    pub rating_deviation_unrated: f64,

    #[arg(long, env, default_value_t =  6.72474798474121)] // Hyper parameter tuned
    pub c: f64,

    /// Number of rating periods until a full reset occurs.
    /// Set via --rating-periods-till-full-reset or RATING_PERIODS_TILL_FULL_RESET.
    #[arg(long, env, default_value_t = 12.0)]
    pub rating_periods_till_full_reset: f64,

    #[arg(long, env, default_value_t = 0.30948790117315694)]
    pub update_error_rate: f64,
}
