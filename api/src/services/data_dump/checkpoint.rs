//! Progress of an unfinished tick, so a restart (deploy, crash) resumes instead of redoing
//! hours of exports.
//!
//! The working manifest is saved to redis after every finished export. It is never shown
//! to readers: only the publish at the end of a tick changes `manifest.json` and the
//! catalog, so both always describe the same files. The next tick resumes from the
//! checkpoint if it was built on the manifest that is still published. Its files are safe
//! from the sweep, which only deletes objects uploaded before that manifest was published.

use redis::aio::ConnectionManager;
use tracing::{info, warn};

use super::manifest::Manifest;

const KEY: &str = "data_dump:checkpoint";
/// A checkpoint older than this belongs to a tick that is long gone.
const TTL_SECS: u64 = 7 * 24 * 3600;

/// Whether `checkpoint` continues the tick that started from `published`: a checkpoint keeps
/// the version and publish time of the manifest it was loaded from until it is published.
fn continues(checkpoint: &Manifest, published: &Manifest) -> bool {
    checkpoint.version == published.version
        && checkpoint.generated_at == published.generated_at
        && checkpoint.format_version == published.format_version
}

/// The working manifest of the tick that started from `published` and did not finish.
pub(crate) async fn load(redis: &ConnectionManager, published: &Manifest) -> Option<Manifest> {
    let raw: Option<Vec<u8>> = match redis::cmd("GET")
        .arg(KEY)
        .query_async(&mut redis.clone())
        .await
    {
        Ok(raw) => raw,
        Err(e) => {
            warn!("data dump: could not read the checkpoint: {e}");
            return None;
        }
    };
    let checkpoint: Manifest = match serde_json::from_slice(&raw?) {
        Ok(checkpoint) => checkpoint,
        Err(e) => {
            warn!("data dump: ignoring an unreadable checkpoint: {e}");
            return None;
        }
    };
    if !continues(&checkpoint, published) {
        info!(
            "data dump: ignoring a checkpoint of manifest version {}",
            checkpoint.version
        );
        return None;
    }
    Some(checkpoint)
}

/// Best effort: a failed save only costs the progress since the previous one.
pub(crate) async fn save(redis: &ConnectionManager, manifest: &Manifest) {
    let body = match serde_json::to_vec(manifest) {
        Ok(body) => body,
        Err(e) => {
            warn!("data dump: could not serialize the checkpoint: {e}");
            return;
        }
    };
    let result: redis::RedisResult<()> = redis::cmd("SET")
        .arg(KEY)
        .arg(body)
        .arg("EX")
        .arg(TTL_SECS)
        .query_async(&mut redis.clone())
        .await;
    if let Err(e) = result {
        warn!("data dump: could not save the checkpoint: {e}");
    }
}

/// Drops the checkpoint after a publish. Best effort: a leftover one no longer continues the
/// published manifest and is ignored.
pub(crate) async fn clear(redis: &ConnectionManager) {
    let result: redis::RedisResult<()> = redis::cmd("DEL")
        .arg(KEY)
        .query_async(&mut redis.clone())
        .await;
    if let Err(e) = result {
        warn!("data dump: could not clear the checkpoint: {e}");
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    #[test]
    fn only_a_checkpoint_of_the_published_manifest_continues() {
        let mut published = Manifest::empty("https://data.example.com");
        published.version = 7;
        published.generated_at = Some(Utc::now());

        let mut checkpoint = published.clone();
        checkpoint.last_fold_at = Some(Utc::now());
        assert!(continues(&checkpoint, &published));

        let mut newer = published.clone();
        newer.version = 8;
        assert!(!continues(&checkpoint, &newer));

        let mut republished = published;
        republished.generated_at = Some(Utc::now() + chrono::Duration::seconds(1));
        assert!(!continues(&checkpoint, &republished));
    }
}
