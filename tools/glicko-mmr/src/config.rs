use clap::Parser;

#[derive(Parser, Debug, Copy, Clone, PartialEq)]
#[command(version, about, long_about = None)]
pub struct Config {
    /// Default rating for unrated players.
    /// Set via --rating-unrated or RATING_UNRATED.
    #[arg(long, env, default_value_t = 1500.0)]
    pub rating_unrated: f64,

    /// Default rating deviation for unrated players.
    /// Set via --rating-deviation-unrated or RATING_DEVIATION_UNRATED.
    #[arg(long, env, default_value_t = 350.)] // Hyper parameter tuned
    pub rating_deviation_unrated: f64,

    #[arg(long, env, default_value_t = 6.)] // Hyper parameter tuned
    pub c: f64,
}
