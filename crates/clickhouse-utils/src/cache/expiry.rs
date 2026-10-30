//! When the cached results behind a response expire.
//!
//! Inside [`track_expiry`], every [`QueryCache`](super::QueryCache) answer records its entry's
//! deadline, and [`expires_by`] lets other inputs record theirs. Until the earliest of them, the
//! same request gets the same answer again, so an HTTP cache in front may keep the response that
//! long without serving anything older than the process itself would.

use core::cell::Cell;
use core::future::Future;
use std::time::SystemTime;

tokio::task_local! {
    static EARLIEST: Cell<Option<SystemTime>>;
}

/// Runs `future` and returns its output with the earliest deadline recorded while it ran, or
/// `None` if nothing recorded one. Records made from other tasks (e.g. `tokio::spawn`) are not
/// seen.
pub async fn track_expiry<F: Future>(future: F) -> (F::Output, Option<SystemTime>) {
    EARLIEST
        .scope(Cell::new(None), async move {
            let output = future.await;
            (output, EARLIEST.try_with(Cell::get).ok().flatten())
        })
        .await
}

/// Records that the current response may change at `at`; a no-op outside [`track_expiry`].
/// Inputs that are not cached until a known deadline record [`SystemTime::now`].
pub fn expires_by(at: SystemTime) {
    // Outside `track_expiry` there is nothing to record into.
    _ = EARLIEST.try_with(|earliest| {
        earliest.set(Some(earliest.get().map_or(at, |current| current.min(at))));
    });
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use super::*;

    #[tokio::test]
    async fn keeps_the_earliest_deadline() {
        let now = SystemTime::now();
        let ((), earliest) = track_expiry(async {
            expires_by(now + Duration::from_secs(60));
            expires_by(now + Duration::from_secs(10));
            expires_by(now + Duration::from_secs(30));
        })
        .await;
        assert_eq!(earliest, Some(now + Duration::from_secs(10)));
    }

    #[tokio::test]
    async fn nothing_recorded_is_none() {
        let ((), earliest) = track_expiry(async {}).await;
        assert_eq!(earliest, None);
    }

    #[tokio::test]
    async fn outside_a_scope_is_a_no_op() {
        expires_by(SystemTime::now());
        let ((), earliest) = track_expiry(async {}).await;
        assert_eq!(earliest, None);
    }
}
