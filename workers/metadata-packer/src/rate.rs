use core::time::Duration;

use tokio::sync::Mutex;
use tokio::time::Instant;

/// Spaces requests evenly at a fixed rate.
#[derive(Debug)]
pub(crate) struct RateLimiter {
    interval: Duration,
    next: Mutex<Instant>,
}

impl RateLimiter {
    pub(crate) fn per_second(rate: u32) -> Self {
        let interval = Duration::from_secs(1)
            .checked_div(rate.max(1))
            .unwrap_or(Duration::from_secs(1));
        Self {
            interval,
            next: Mutex::new(Instant::now()),
        }
    }

    /// Waits for the next slot.
    pub(crate) async fn acquire(&self) {
        let at = {
            let mut next = self.next.lock().await;
            let at = (*next).max(Instant::now());
            *next = at.checked_add(self.interval).unwrap_or(at);
            at
        };
        tokio::time::sleep_until(at).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn spaces_requests() {
        let limiter = RateLimiter::per_second(10);
        let start = Instant::now();
        for _ in 0..11 {
            limiter.acquire().await;
        }
        assert_eq!(start.elapsed(), Duration::from_secs(1));
    }
}
