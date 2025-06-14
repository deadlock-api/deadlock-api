use clap::Parser;

#[derive(Parser, Debug, Copy, Clone, PartialEq)]
#[command(version, about, long_about = None)]
pub(crate) struct Config {
    /// Default rating for unrated players.
    /// Set via --rating-unrated or RATING_UNRATED.
    #[arg(long, env, default_value_t = 1500.0)]
    pub(crate) rating_unrated: f64,

    /// Default rating deviation for unrated players.
    /// Set via --rating-deviation-unrated or RATING_DEVIATION_UNRATED.
    #[arg(long, env, default_value_t = 350.0)]
    pub(crate) rating_deviation_unrated: f64,

    /// Typical rating deviation for rated players.
    /// Set via --rating-deviation-typical or RATING_DEVIATION_TYPICAL.
    #[arg(long, env, default_value_t = 50.0)]
    pub(crate) rating_deviation_typical: f64,

    /// Number of rating periods until a full reset occurs.
    /// Set via --rating-periods-till-full-reset or RATING_PERIODS_TILL_FULL_RESET.
    #[arg(long, env, default_value_t = 100.0)]
    pub(crate) rating_periods_till_full_reset: f64,
}
