//! Redis lease so only one API replica runs the dump at a time. The lease is an efficiency:
//! correctness against a stale leader comes from the conditional manifest write.

use core::time::Duration;

use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use tokio::task::JoinHandle;
use tracing::warn;

use super::DumpError;

const RENEW_IF_OWNED: &str = r"
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0";

const RELEASE_IF_OWNED: &str = r"
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
end
return 0";

pub(crate) struct Lease {
    redis: MultiplexedConnection,
    key: String,
    token: String,
    heartbeat: JoinHandle<()>,
}

impl Lease {
    /// Returns `None` when another replica holds the lease.
    pub(crate) async fn acquire(
        mut redis: MultiplexedConnection,
        key: &str,
        token: &str,
        ttl: Duration,
    ) -> Result<Option<Self>, DumpError> {
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
            let ttl_ms = i64::try_from(ttl.as_millis()).unwrap_or(i64::MAX);
            async move {
                let mut tick = tokio::time::interval(ttl / 3);
                tick.tick().await;
                loop {
                    tick.tick().await;
                    match redis::cmd("EVAL")
                        .arg(RENEW_IF_OWNED)
                        .arg(1)
                        .arg(&key)
                        .arg(&token)
                        .arg(ttl_ms)
                        .query_async::<i64>(&mut redis)
                        .await
                    {
                        Ok(1) => {}
                        Ok(_) => warn!(
                            "data dump lease {key} was lost; the manifest write will refuse a stale publish"
                        ),
                        Err(e) => warn!("data dump lease renewal failed: {e}"),
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

    pub(crate) async fn release(mut self) {
        self.heartbeat.abort();
        if let Err(e) = redis::cmd("EVAL")
            .arg(RELEASE_IF_OWNED)
            .arg(1)
            .arg(&self.key)
            .arg(&self.token)
            .query_async::<i64>(&mut self.redis)
            .await
        {
            warn!("data dump lease release failed: {e}");
        }
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        self.heartbeat.abort();
    }
}
