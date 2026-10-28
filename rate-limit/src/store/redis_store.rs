use core::time::Duration;
use std::sync::LazyLock;
use std::time::SystemTime;

use redis::aio::ConnectionManager;
use redis::{ErrorKind, RedisError, RedisResult, Script};

use super::{Charge, Store, Usage};

/// Hashed once; invoking it sends the hash and only falls back to the source after a restart.
static SCRIPT: LazyLock<Script> = LazyLock::new(|| Script::new(include_str!("charge.lua")));

/// Keeps each key's requests in a Redis sorted set, so all replicas share the counts.
///
/// A charge is one atomic script call, so concurrent requests cannot interleave; the counts assume
/// the replicas' clocks agree.
#[derive(Clone)]
pub struct RedisStore {
    connection: ConnectionManager,
}

impl RedisStore {
    #[must_use]
    pub const fn new(connection: ConnectionManager) -> Self {
        Self { connection }
    }
}

fn saturating_micros(duration: Duration) -> i64 {
    i64::try_from(duration.as_micros()).unwrap_or(i64::MAX)
}

fn micros(time: SystemTime) -> i64 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map_or(0, saturating_micros)
}

fn from_micros(micros: i64) -> Option<SystemTime> {
    SystemTime::UNIX_EPOCH.checked_add(Duration::from_micros(u64::try_from(micros).ok()?))
}

impl Store for RedisStore {
    type Error = RedisError;

    async fn charge(&self, charge: Charge<'_>) -> RedisResult<Vec<Usage>> {
        let mut invocation = SCRIPT.prepare_invoke();
        invocation
            .arg(micros(charge.now))
            .arg(charge.cost.get())
            .arg(charge.always.len())
            .arg(charge.if_admitted.len());
        for log in charge.always.iter().chain(charge.if_admitted) {
            invocation
                .key(log.key)
                .arg(saturating_micros(log.retention));
        }
        for window in charge.windows {
            invocation
                .key(window.key)
                .arg(charge.now.checked_sub(window.period).map_or(0, micros))
                .arg(window.limit);
        }
        let reply: Vec<i64> = invocation
            .invoke_async(&mut self.connection.clone())
            .await?;
        if reply.len() != charge.windows.len().saturating_mul(2) {
            return Err(RedisError::from((
                ErrorKind::Client,
                "rate limit script returned the wrong number of windows",
            )));
        }
        Ok(reply
            .as_chunks()
            .0
            .iter()
            .map(|&[used, oldest]| Usage {
                used: u64::try_from(used).unwrap_or(0),
                oldest: from_micros(oldest),
            })
            .collect())
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    /// Needs a Redis server at `REDIS_URL`; skipped without one.
    #[tokio::test]
    async fn conforms() {
        let Ok(url) = std::env::var("REDIS_URL") else {
            return;
        };
        let connection = redis::Client::open(url)
            .unwrap()
            .get_connection_manager()
            .await
            .unwrap();
        let prefix = format!(
            "rate-limit-test:{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        super::super::conformance::check(&RedisStore::new(connection), &prefix).await;
    }
}
