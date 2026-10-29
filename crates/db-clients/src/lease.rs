//! Redis lease so only one replica of a service runs a background job at a time.

use core::time::Duration;

use redis::AsyncCommands as _;
use redis::aio::ConnectionManager;
use tokio::task::JoinHandle;
use tracing::warn;

/// Also takes the key back when it is gone, e.g. after Redis restarted empty, so another
/// replica can't acquire the lease while its holder is still working.
const RENEW_IF_OWNED: &str = "
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
end
if redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') then
    return 1
end
return 0";

/// Deletes `KEYS[1]` if it still holds the token `ARGV[1]`, leaving another owner's key alone.
pub const RELEASE_IF_OWNED: &str = "
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0";

fn millis(d: Duration) -> i64 {
    i64::try_from(d.as_millis()).unwrap_or(i64::MAX)
}

/// Runs one of the `*_IF_OWNED` scripts against `key`, with `ttl_ms` as its `ARGV[2]` if given.
async fn eval_if_owned(
    redis: &mut ConnectionManager,
    script: &str,
    key: &str,
    token: &str,
    ttl_ms: Option<i64>,
) -> redis::RedisResult<i64> {
    let mut cmd = redis::cmd("EVAL");
    cmd.arg(script).arg(1).arg(key).arg(token);
    if let Some(ttl_ms) = ttl_ms {
        cmd.arg(ttl_ms);
    }
    cmd.query_async(redis).await
}

/// A held lease on a Redis key, renewed in the background until released or dropped.
pub struct Lease {
    redis: ConnectionManager,
    key: String,
    token: String,
    heartbeat: JoinHandle<()>,
}

impl Lease {
    /// Returns `None` when another replica holds the lease.
    pub async fn acquire(
        mut redis: ConnectionManager,
        key: &str,
        token: &str,
        ttl: Duration,
    ) -> redis::RedisResult<Option<Self>> {
        let acquired: Option<String> = redis
            .set_options(
                key,
                token,
                redis::SetOptions::default()
                    .conditional_set(redis::ExistenceCheck::NX)
                    .with_expiration(redis::SetExpiry::PX(
                        ttl.as_millis().try_into().unwrap_or(u64::MAX),
                    )),
            )
            .await?;
        if acquired.is_none() {
            return Ok(None);
        }
        let heartbeat = tokio::spawn({
            let mut redis = redis.clone();
            let key = key.to_owned();
            let token = token.to_owned();
            let ttl_ms = millis(ttl);
            async move {
                // `interval` rejects a zero period.
                let period = ttl
                    .checked_div(3)
                    .unwrap_or_default()
                    .max(Duration::from_millis(1));
                let mut tick = tokio::time::interval(period);
                tick.tick().await;
                loop {
                    tick.tick().await;
                    match eval_if_owned(&mut redis, RENEW_IF_OWNED, &key, &token, Some(ttl_ms))
                        .await
                    {
                        Ok(1) => {}
                        Ok(_) => warn!("lease {key} was lost"),
                        Err(e) => warn!("lease {key} renewal failed: {e}"),
                    }
                }
            }
        });
        Ok(Some(Self {
            redis,
            key: key.to_owned(),
            token: token.to_owned(),
            heartbeat,
        }))
    }

    /// Deletes the key if this lease still owns it.
    pub async fn release(self) {
        self.heartbeat.abort();
        Self::release_token(self.redis.clone(), &self.key, &self.token).await;
    }

    /// Deletes `key` if it still holds `token`: ends a [`Self::hold_for`] early, e.g. when the
    /// holder shuts down and the replicas replacing it should not wait out the hold.
    pub async fn release_token(mut redis: ConnectionManager, key: &str, token: &str) {
        if let Err(e) = eval_if_owned(&mut redis, RELEASE_IF_OWNED, key, token, None).await {
            warn!("lease {key} release failed: {e}");
        }
    }

    /// Keeps the lease for `hold` more, without renewal, so other replicas skip their ticks
    /// until then. Releases it at once when `hold` is zero.
    pub async fn hold_for(mut self, hold: Duration) {
        if hold.is_zero() {
            return self.release().await;
        }
        self.heartbeat.abort();
        if let Err(e) = eval_if_owned(
            &mut self.redis,
            RENEW_IF_OWNED,
            &self.key,
            &self.token,
            Some(millis(hold)),
        )
        .await
        {
            warn!("lease {} hold failed: {e}", self.key);
        }
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        self.heartbeat.abort();
    }
}
