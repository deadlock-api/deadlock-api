use core::time::Duration;
use std::collections::VecDeque;

use tokio::time::{MissedTickBehavior, interval, timeout};
use tracing::{debug, warn};

use super::CH_ADMISSION;
use super::limiter::MIN_LIMIT;

/// The limit never grows beyond this.
const MAX_LIMIT: usize = 2 * MIN_LIMIT;
/// Mean CPU pressure above which the limit shrinks. In production, timeouts per minute rise
/// from ~0.5 at 20–30 % pressure to 4 at 30–40 % and 12+ above 40 %.
const DECREASE_PRESSURE: f64 = 0.35;
/// Mean CPU pressure below which a saturated limiter may grow.
const INCREASE_PRESSURE: f64 = 0.15;
/// Seconds of pressure readings averaged: single seconds spike to 60–70 % on healthy minutes.
const PRESSURE_WINDOW: usize = 5;
const POLL_INTERVAL: Duration = Duration::from_secs(1);
const POLL_TIMEOUT: Duration = Duration::from_millis(500);

/// `PSI_CPU_some`: microseconds within the last second (the server's asynchronous metrics
/// update period) in which some task waited for a CPU. Covers everything on the host: API
/// queries, refreshes, merges and `OPTIMIZE`s.
const PRESSURE_QUERY: &str = "SELECT value FROM system.asynchronous_metrics \
    WHERE metric = 'PSI_CPU_some' SETTINGS log_comment = 'ch_admission_poll'";

/// Polls `ClickHouse`'s CPU pressure every second and adapts the admission limit to it.
pub(crate) fn spawn_controller(ch_client: clickhouse::Client) {
    tokio::spawn(async move {
        let mut ticker = interval(POLL_INTERVAL);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        let mut window = VecDeque::with_capacity(PRESSURE_WINDOW);
        loop {
            ticker.tick().await;
            let reading = match timeout(
                POLL_TIMEOUT,
                ch_client.query(PRESSURE_QUERY).fetch_one::<f64>(),
            )
            .await
            {
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
            if window.len() == PRESSURE_WINDOW {
                window.pop_front();
            }
            // A failed or timed-out poll counts as full pressure: the server is unreachable or
            // too slow to answer a trivial query.
            window.push_back(reading.unwrap_or(1.0));
            #[expect(clippy::cast_precision_loss)]
            let pressure = window.iter().sum::<f64>() / window.len() as f64;

            let limit = CH_ADMISSION.limit();
            let congested = CH_ADMISSION.take_congestion_events() > 0;
            let saturated = CH_ADMISSION.take_saturated();
            let next = next_limit(limit, pressure, congested, saturated);
            if next != limit {
                debug!(
                    limit,
                    next, pressure, congested, "Adjusting ClickHouse admission limit"
                );
                CH_ADMISSION.set_limit(next);
            }

            let (in_flight, waiting) = CH_ADMISSION.load();
            #[expect(clippy::cast_precision_loss)]
            {
                metrics::gauge!("ch_admission_limit").set(next as f64);
                metrics::gauge!("ch_admission_in_flight").set(in_flight as f64);
                metrics::gauge!("ch_admission_waiting").set(waiting as f64);
            }
            metrics::gauge!("ch_admission_pressure").set(pressure);
        }
    });
}

/// The limit after a tick: shrinks by 10 % while `ClickHouse` is under pressure or queries hit
/// timeouts or memory limits, grows by 1/8 while the limiter was full and the server has room,
/// and stays within `MIN_LIMIT..=MAX_LIMIT`.
fn next_limit(limit: usize, pressure: f64, congested: bool, saturated: bool) -> usize {
    if pressure > DECREASE_PRESSURE || congested {
        (limit * 9 / 10).max(MIN_LIMIT)
    } else if pressure < INCREASE_PRESSURE && saturated {
        (limit + (limit / 8).max(1)).min(MAX_LIMIT)
    } else {
        limit
    }
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;

    #[rstest]
    #[case::idle_and_unsaturated_holds(200, 0.01, false, false, 200)]
    #[case::grows_when_saturated_with_room(MIN_LIMIT, 0.05, false, true, MIN_LIMIT + MIN_LIMIT / 8)]
    #[case::growth_is_capped(MAX_LIMIT - 2, 0.05, false, true, MAX_LIMIT)]
    #[case::middle_band_holds(200, 0.25, false, true, 200)]
    #[case::shrinks_under_pressure(200, 0.5, false, false, 180)]
    #[case::shrinks_on_congestion(200, 0.01, true, true, 180)]
    #[case::never_below_floor(MIN_LIMIT + 1, 0.9, true, true, MIN_LIMIT)]
    fn next_limit_cases(
        #[case] limit: usize,
        #[case] pressure: f64,
        #[case] congested: bool,
        #[case] saturated: bool,
        #[case] expected: usize,
    ) {
        assert_eq!(next_limit(limit, pressure, congested, saturated), expected);
    }
}
