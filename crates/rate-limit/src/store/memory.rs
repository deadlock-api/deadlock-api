use core::convert::Infallible;
use core::future::ready;
use core::num::NonZeroU64;
use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};
use std::time::SystemTime;

use super::{Charge, Log, Store, Usage, Window};

type Requests = Vec<(SystemTime, NonZeroU64)>;

/// Keeps requests in this process: counts are per replica and lost on restart. A key's requests
/// are trimmed whenever it records another, so keys that go quiet keep their last window.
#[derive(Debug, Default)]
pub struct MemoryStore {
    logs: Mutex<HashMap<String, Requests>>,
}

impl MemoryStore {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

fn record(logs: &mut HashMap<String, Requests>, log: &Log<'_>, charge: &Charge<'_>) {
    let requests = logs.entry(log.key.to_owned()).or_default();
    if let Some(cutoff) = charge.now.checked_sub(log.retention) {
        requests.retain(|&(at, _)| at > cutoff);
    }
    requests.push((charge.now, charge.cost));
}

fn usage(logs: &HashMap<String, Requests>, now: SystemTime, window: &Window<'_>) -> Usage {
    let start = now
        .checked_sub(window.period)
        .unwrap_or(SystemTime::UNIX_EPOCH);
    logs.get(window.key)
        .into_iter()
        .flatten()
        .filter(|&&(at, _)| start < at && at <= now)
        .fold(Usage::default(), |usage, &(at, cost)| Usage {
            used: usage.used.saturating_add(cost.get()),
            oldest: Some(usage.oldest.map_or(at, |oldest| oldest.min(at))),
        })
}

impl Store for MemoryStore {
    type Error = Infallible;

    fn charge(
        &self,
        charge: Charge<'_>,
    ) -> impl Future<Output = Result<Vec<Usage>, Infallible>> + Send {
        // A panic while holding the lock cannot leave the map inconsistent, only stale.
        let mut logs = self.logs.lock().unwrap_or_else(PoisonError::into_inner);
        // Read before recording, so the request is not counted against itself.
        let usages: Vec<_> = charge
            .windows
            .iter()
            .map(|window| usage(&logs, charge.now, window))
            .collect();
        let admitted = usages
            .iter()
            .zip(charge.windows)
            .all(|(usage, window)| usage.fits(window, charge.cost));
        let logs_to_record = charge
            .always
            .iter()
            .chain(charge.if_admitted.iter().filter(|_| admitted));
        for log in logs_to_record {
            record(&mut logs, log, &charge);
        }
        drop(logs);
        ready(Ok(usages))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn conforms() {
        super::super::conformance::check(&MemoryStore::new(), "test").await;
    }
}
