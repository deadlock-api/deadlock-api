use core::time::Duration;
use std::collections::VecDeque;

use tokio::time::{MissedTickBehavior, interval, timeout};
use tracing::{debug, warn};

use super::Admission;
use super::limiter::DEFAULT_LIMIT;

/// `PSI_CPU_some`: microseconds within the last second (the server's asynchronous metrics
/// update period) in which some task waited for a CPU. Covers everything on the host: queries,
/// refreshes, merges and `OPTIMIZE`s.
const PRESSURE_QUERY: &str = "SELECT value FROM system.asynchronous_metrics \
    WHERE metric = 'PSI_CPU_some' SETTINGS log_comment = 'ch_admission_poll'";

/// How [`Admission::spawn_controller`] adapts the limit to `ClickHouse`'s CPU pressure.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ControllerConfig {
    /// The limit never shrinks below this.
    pub min_limit: usize,
    /// The limit never grows beyond this.
    pub max_limit: usize,
    /// Mean CPU pressure above which the limit shrinks.
    pub decrease_pressure: f64,
    /// Mean CPU pressure below which a saturated limiter may grow.
    pub increase_pressure: f64,
    /// Readings (one per poll) averaged into the pressure.
    pub pressure_window: usize,
    pub poll_interval: Duration,
    /// A poll that takes longer counts as full pressure.
    pub poll_timeout: Duration,
}

impl Default for ControllerConfig {
    /// Tuned on the API's production traffic: timeouts per minute rise from ~0.5 at 20–30 %
    /// pressure to 4 at 30–40 % and 12+ above 40 %, and single seconds spike to 60–70 % on healthy
    /// minutes, so 5 seconds are averaged.
    fn default() -> Self {
        Self {
            min_limit: DEFAULT_LIMIT,
            max_limit: DEFAULT_LIMIT.saturating_mul(2),
            decrease_pressure: 0.35,
            increase_pressure: 0.15,
            pressure_window: 5,
            poll_interval: Duration::from_secs(1),
            poll_timeout: Duration::from_millis(500),
        }
    }
}

impl ControllerConfig {
    /// The limit after a tick: shrinks by 10 % while `ClickHouse` is under pressure or queries
    /// hit timeouts or memory limits, grows by 1/8 while the limiter was full and the server has
    /// room, and stays within `min_limit..=max_limit`.
    fn next_limit(&self, limit: usize, pressure: f64, congested: bool, saturated: bool) -> usize {
        if pressure > self.decrease_pressure || congested {
            (limit.saturating_mul(9) / 10).max(self.min_limit)
        } else if pressure < self.increase_pressure && saturated {
            limit.saturating_add((limit / 8).max(1)).min(self.max_limit)
        } else {
            limit
        }
    }
}

impl Admission {
    /// Polls `ClickHouse`'s CPU pressure through `ch_client` every
    /// [`ControllerConfig::poll_interval`] and adapts the limit to it, for the lifetime of the
    /// process. Exports the `ch_admission_{limit,in_flight,waiting,pressure}` gauges.
    pub fn spawn_controller(
        &'static self,
        ch_client: clickhouse::Client,
        config: ControllerConfig,
    ) {
        tokio::spawn(async move {
            let window_len = config.pressure_window.max(1);
            let mut ticker = interval(config.poll_interval);
            ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
            let mut window = VecDeque::with_capacity(window_len);
            loop {
                ticker.tick().await;
                let query = ch_client.query(PRESSURE_QUERY).fetch_one::<f64>();
                let reading = match timeout(config.poll_timeout, query).await {
                    Ok(Ok(stalled_us)) => Some(stalled_us / 1e6),
                    Ok(Err(e)) => {
                        warn!("Failed to read ClickHouse CPU pressure: {e}");
                        None
                    }
                    Err(_) => {
                        warn!("Reading ClickHouse CPU pressure timed out");
                        None
                    }
                };
                if window.len() == window_len {
                    window.pop_front();
                }
                // A failed or timed-out poll counts as full pressure: the server is unreachable
                // or too slow to answer a trivial query.
                window.push_back(reading.unwrap_or(1.0));
                #[expect(clippy::cast_precision_loss, reason = "window length is tiny")]
                let pressure = window.iter().sum::<f64>() / window.len() as f64;

                let limit = self.limit();
                let congested = self.take_congestion_events() > 0;
                let saturated = self.take_saturated();
                let next = config.next_limit(limit, pressure, congested, saturated);
                if next != limit {
                    debug!(
                        limit,
                        next, pressure, congested, "Adjusting ClickHouse admission limit"
                    );
                    self.set_limit(next);
                }

                let load = self.load();
                #[expect(clippy::cast_precision_loss, reason = "gauges take f64")]
                {
                    metrics::gauge!("ch_admission_limit").set(next as f64);
                    metrics::gauge!("ch_admission_in_flight").set(load.in_flight as f64);
                    metrics::gauge!("ch_admission_waiting").set(load.waiting as f64);
                }
                metrics::gauge!("ch_admission_pressure").set(pressure);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;

    const MIN: usize = DEFAULT_LIMIT;
    const MAX: usize = 2 * DEFAULT_LIMIT;

    #[rstest]
    #[case::idle_and_unsaturated_holds(200, 0.01, false, false, 200)]
    #[case::grows_when_saturated_with_room(MIN, 0.05, false, true, MIN + MIN / 8)]
    #[case::growth_is_capped(MAX - 2, 0.05, false, true, MAX)]
    #[case::middle_band_holds(200, 0.25, false, true, 200)]
    #[case::shrinks_under_pressure(200, 0.5, false, false, 180)]
    #[case::shrinks_on_congestion(200, 0.01, true, true, 180)]
    #[case::never_below_floor(MIN + 1, 0.9, true, true, MIN)]
    fn next_limit_cases(
        #[case] limit: usize,
        #[case] pressure: f64,
        #[case] congested: bool,
        #[case] saturated: bool,
        #[case] expected: usize,
    ) {
        let config = ControllerConfig::default();
        assert_eq!(
            config.next_limit(limit, pressure, congested, saturated),
            expected
        );
    }
}
