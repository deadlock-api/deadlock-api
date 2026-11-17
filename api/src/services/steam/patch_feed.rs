//! The forum changelog and Steam news RSS feeds behind `/v1/patches`, `/v2/patches`, the MCP
//! `list_patches` tool and the patch-notes command variables.
//!
//! Each feed's body is served stale-while-revalidate: a request gets the last good body at once,
//! and once that is older than [`FRESH_FOR`] one background fetch replaces it. The last good body
//! is also kept in the query caches' disk tier (shared by the instances, kept across restarts) for
//! [`KEEP_FOR`], so a restarted instance starts from it instead of the upstream.
//!
//! The forum sits behind a bot wall that can fail every fetch for hours. On 2026-11-17 a restart
//! emptied the in-memory caches during such an outage, and for 1.5 h every patches request waited
//! 30 s for the forum and returned 500.
//!
//! Only an instance without any body waits for the upstream; concurrent requests share that fetch,
//! and after it fails they fail fast for [`RETRY_AFTER`]. A failed background refresh is retried
//! after [`RETRY_AFTER`] too.

use core::time::Duration;
use std::sync::{Arc, OnceLock};
use std::time::{Instant, SystemTime};

use arc_swap::ArcSwapOption;
use clickhouse_utils::cache::{DiskTier, Tiers, query_key};
use futures::future::BoxFuture;
use reqwest::StatusCode;
use tokio::sync::{Mutex, OnceCell};
use tracing::{debug, info, warn};
use url::Url;
use wreq::redirect;
use wreq_util::Emulation;

use crate::error::{APIError, APIResult};
use crate::services::steam::types::{FeedItem, ForumRssV2, Patch, Rss, SteamRss};

const FORUM_ENDPOINT: &str = "https://forums.playdeadlock.com/forums/changelog.10/index.rss";
// Without `l`, Steam localizes titles and notes by the caller's location (Ukrainian from production, 2026-10).
const STEAM_NEWS_ENDPOINT: &str =
    "https://store.steampowered.com/feeds/news/app/1422450/?l=english";

/// How long a fetched body is served before a request triggers a refresh.
const FRESH_FOR: Duration = Duration::from_mins(30);
/// How long the last good body is kept on disk.
const KEEP_FOR: Duration = Duration::from_hours(30 * 24);
/// How long after a failed fetch the next one may start.
const RETRY_AFTER: Duration = Duration::from_mins(1);
/// The disk tier entries' cache name, stable across releases.
const DISK_CACHE: &str = "api.services.steam.patch_feed";

/// Fetches a feed's body.
type Fetch = Arc<dyn Fn() -> BoxFuture<'static, APIResult<String>> + Send + Sync>;

/// The patch feeds, see the module docs.
pub(crate) struct PatchFeeds {
    forum: Arc<Feed>,
    steam: Arc<Feed>,
    patch_notes: Parsed<Vec<Patch>>,
    combined: Parsed<Vec<FeedItem>>,
}

impl PatchFeeds {
    pub(crate) fn new() -> Self {
        // One client for both feeds: it keeps the forum's clearance cookie across fetches.
        let client = build_forum_client();
        let feed = |url: &'static str| {
            let client = client.clone();
            let fetch: Fetch = Arc::new(move || {
                let client = client.clone();
                Box::pin(async move { fetch_rss_text(&client, url).await })
            });
            Arc::new(Feed::new(url, fetch))
        };
        Self {
            forum: feed(FORUM_ENDPOINT),
            steam: feed(STEAM_NEWS_ENDPOINT),
            patch_notes: Parsed::default(),
            combined: Parsed::default(),
        }
    }

    /// The forum changelog (`/v1/patches`).
    pub(crate) async fn patch_notes(&self) -> APIResult<Arc<Vec<Patch>>> {
        let forum = self.forum.get().await?;
        self.patch_notes.get(&[Arc::clone(&forum)], || {
            parse_rss::<Rss>(&forum, "patch notes").map(|rss| rss.channel.patch_notes)
        })
    }

    /// The forum changelog and the Steam news, newest first (`/v2/patches`).
    pub(crate) async fn combined(&self) -> APIResult<Arc<Vec<FeedItem>>> {
        let (forum, steam) = tokio::try_join!(self.forum.get(), self.steam.get())?;
        self.combined
            .get(&[Arc::clone(&forum), Arc::clone(&steam)], || {
                combine(&forum, &steam)
            })
    }
}

/// One feed's last good body, see the module docs.
struct Feed {
    url: &'static str,
    fetch: Fetch,
    /// The process-wide disk tier, looked up on first use: the feeds are built before
    /// [`Tiers::install`], and looking it up then would install a tier set without disk.
    disk: OnceLock<Option<Arc<DiskTier>>>,
    body: ArcSwapOption<Body>,
    /// Held while a fetch runs; the last failed fetch since the last good one.
    fetching: Arc<Mutex<Option<Failure>>>,
    /// Set once the disk tier was read for a body.
    restored: OnceCell<()>,
}

struct Body {
    text: Arc<str>,
    fresh_until: Instant,
}

struct Failure {
    at: Instant,
    message: String,
}

impl Feed {
    fn new(url: &'static str, fetch: Fetch) -> Self {
        Self {
            url,
            fetch,
            disk: OnceLock::new(),
            body: ArcSwapOption::empty(),
            fetching: Arc::new(Mutex::new(None)),
            restored: OnceCell::new(),
        }
    }

    fn disk(&self) -> Option<&Arc<DiskTier>> {
        self.disk
            .get_or_init(|| Tiers::global().disk.clone())
            .as_ref()
    }

    async fn get(self: &Arc<Self>) -> APIResult<Arc<str>> {
        self.restored.get_or_init(|| self.restore()).await;
        if let Some(body) = self.body.load_full() {
            if body.fresh_until <= Instant::now() {
                self.spawn_refresh();
            }
            return Ok(Arc::clone(&body.text));
        }
        // Nothing to serve: wait for a fetch, shared with the other requests waiting here.
        let mut failure = self.fetching.lock().await;
        if let Some(body) = self.body.load_full() {
            return Ok(Arc::clone(&body.text));
        }
        if let Some(failure) = failure.as_ref().filter(|f| f.at.elapsed() < RETRY_AFTER) {
            return Err(upstream_error(&failure.message));
        }
        self.refresh(&mut failure).await
    }

    /// Reads the last good body from the disk tier; it counts as stale, so the first request
    /// refreshes it.
    async fn restore(&self) {
        let Some(disk) = self.disk() else {
            return;
        };
        if let Some((text, ..)) = disk.load::<String>(DISK_CACHE, query_key(self.url)).await {
            info!("Restored the last good {} from disk", self.url);
            self.body.store(Some(Arc::new(Body {
                text: text.into(),
                fresh_until: Instant::now(),
            })));
        }
    }

    /// Refreshes the body in the background, unless a fetch is running or one failed less than
    /// [`RETRY_AFTER`] ago.
    fn spawn_refresh(self: &Arc<Self>) {
        let Ok(mut failure) = Arc::clone(&self.fetching).try_lock_owned() else {
            return;
        };
        if failure
            .as_ref()
            .is_some_and(|f| f.at.elapsed() < RETRY_AFTER)
        {
            return;
        }
        let feed = Arc::clone(self);
        tokio::spawn(async move {
            if let Err(e) = feed.refresh(&mut failure).await {
                warn!(
                    "Refreshing {} failed, serving the last good body: {e}",
                    feed.url
                );
            }
        });
    }

    /// Fetches the body; call with [`Self::fetching`] held.
    async fn refresh(&self, failure: &mut Option<Failure>) -> APIResult<Arc<str>> {
        match (self.fetch)().await {
            Ok(text) => {
                let text: Arc<str> = text.into();
                self.body.store(Some(Arc::new(Body {
                    text: Arc::clone(&text),
                    fresh_until: Instant::now()
                        .checked_add(FRESH_FOR)
                        .unwrap_or_else(Instant::now),
                })));
                *failure = None;
                if let Some(disk) = self.disk()
                    && let Some(expires_at) = SystemTime::now().checked_add(KEEP_FOR)
                {
                    disk.store_value(DISK_CACHE, query_key(self.url), expires_at, &*text);
                }
                Ok(text)
            }
            Err(e) => {
                *failure = Some(Failure {
                    at: Instant::now(),
                    message: e.to_string(),
                });
                Err(e)
            }
        }
    }
}

/// The last value parsed from a set of bodies, reused while the bodies are the same.
struct Parsed<T> {
    last: ArcSwapOption<(Vec<Arc<str>>, Arc<T>)>,
}

impl<T> Default for Parsed<T> {
    fn default() -> Self {
        Self {
            last: ArcSwapOption::empty(),
        }
    }
}

impl<T> Parsed<T> {
    fn get(&self, bodies: &[Arc<str>], parse: impl FnOnce() -> APIResult<T>) -> APIResult<Arc<T>> {
        if let Some(last) = self.last.load_full()
            && last.0.len() == bodies.len()
            && last.0.iter().zip(bodies).all(|(a, b)| Arc::ptr_eq(a, b))
        {
            return Ok(Arc::clone(&last.1));
        }
        let parsed = Arc::new(parse()?);
        self.last
            .store(Some(Arc::new((bodies.to_vec(), Arc::clone(&parsed)))));
        Ok(parsed)
    }
}

fn combine(forum: &str, steam: &str) -> APIResult<Vec<FeedItem>> {
    let forum_items = parse_rss::<ForumRssV2>(forum, "forum patch notes")?
        .channel
        .patch_notes;
    let steam_items = parse_rss::<SteamRss>(steam, "steam patch notes")?
        .channel
        .patch_notes;
    let mut items: Vec<FeedItem> = forum_items
        .into_iter()
        .map(FeedItem::Forum)
        .chain(steam_items.into_iter().map(FeedItem::Steam))
        .collect();
    items.sort_by_key(|i| core::cmp::Reverse(i.pub_date()));
    Ok(items)
}

fn parse_rss<T: serde::de::DeserializeOwned>(rss: &str, what: &str) -> APIResult<T> {
    quick_xml::de::from_str(rss).map_err(|e| {
        APIError::status_msg(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse {what}: {e}"),
        )
    })
}

/// An upstream that could not be fetched: a 502, not a 500, which stands for bugs.
fn upstream_error(e: impl core::fmt::Display) -> APIError {
    APIError::status_msg(
        StatusCode::BAD_GATEWAY,
        format!("Failed to fetch patch notes: {e}"),
    )
}

/// Build the Chrome-emulating client used for the forum RSS feed. The feed is behind the `stile`
/// bot challenge, which redirects any request it deems suspect to an HTML challenge page (breaking
/// XML parsing). A Chrome `ClientHello` no longer clears the wall on its own, so the client also
/// needs to follow redirects into the challenge and keep the cookies it hands out. wreq has no
/// timeout by default, so a stalled hop hung the fetch; a hop takes about a second.
fn build_forum_client() -> wreq::Client {
    wreq::Client::builder()
        .emulation(Emulation::Chrome137)
        .cookie_store(true)
        .redirect(redirect::Policy::limited(10))
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_else(|e| {
            warn!("Failed to build forum emulation client, using default: {e}");
            wreq::Client::new()
        })
}

/// Number of attempts for a forum/steam RSS fetch. The forum sits behind a bot challenge that
/// occasionally resets the connection mid-handshake, so a couple of retries smooth over transient
/// `SendRequest` errors.
const RSS_FETCH_ATTEMPTS: u32 = 3;

async fn fetch_rss_text(http_client: &wreq::Client, url: &str) -> APIResult<String> {
    let mut attempt = 1;
    loop {
        match fetch_through_stile(http_client, url).await {
            Ok(text) => return Ok(text),
            Err(e) if attempt < RSS_FETCH_ATTEMPTS => {
                warn!(
                    "RSS fetch from {url} failed (attempt {attempt}/{RSS_FETCH_ATTEMPTS}): {e}; retrying"
                );
                tokio::time::sleep(Duration::from_millis(200 * u64::from(attempt))).await;
                attempt = attempt.saturating_add(1);
            }
            Err(e) => return Err(e),
        }
    }
}

/// Hops to follow before giving up on the `stile` bot wall. Its no-JS ladder chains
/// `<meta http-equiv="refresh">` pages (challenge -> verify -> the original URL) and ends by setting
/// a clearance cookie, so walking that chain clears the wall without running its JavaScript rung.
const STILE_MAX_HOPS: u32 = 6;

/// The feed at `url`, walking the `stile` challenge if one is in the way. Fails on anything but
/// an XML document, so a challenge page never becomes a feed's last good body.
async fn fetch_through_stile(http_client: &wreq::Client, url: &str) -> APIResult<String> {
    let mut next = Url::parse(url).map_err(upstream_error)?;
    for _ in 0..STILE_MAX_HOPS {
        let response = http_client
            .get(next.as_str())
            .send()
            .await
            .map_err(upstream_error)?;
        let status = response.status();
        let current = Url::parse(&response.uri().to_string()).map_err(upstream_error)?;
        let body = response.text().await.map_err(upstream_error)?;
        if body.trim_start().starts_with("<?xml") {
            return Ok(body);
        }
        let Some(hop) = meta_refresh_target(&body).and_then(|t| current.join(&t).ok()) else {
            return Err(upstream_error(format_args!(
                "{current} returned HTTP {status} without an XML document"
            )));
        };
        debug!("Following stile challenge hop to {hop}");
        next = hop;
    }
    Err(upstream_error(format_args!(
        "stile challenge unsolved after {STILE_MAX_HOPS} hops"
    )))
}

fn meta_refresh_target(body: &str) -> Option<String> {
    let tag = body.split_once(r#"http-equiv="refresh""#)?.1;
    let content = tag.split_once(r#"content=""#)?.1.split_once('"')?.0;
    let target = content.split_once("url=")?.1.trim();
    Some(target.replace("&amp;", "&"))
}

#[cfg(test)]
mod tests {
    use core::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    #[test]
    fn test_meta_refresh_target() {
        let body = r#"<meta http-equiv="refresh" content="20;url=?rung=nojs&amp;band=suspect">"#;
        assert_eq!(
            meta_refresh_target(body).as_deref(),
            Some("?rung=nojs&band=suspect")
        );
        assert_eq!(meta_refresh_target("<rss><item/></rss>"), None);
    }

    /// A feed whose fetches count into `calls` and return the next of `results`, then fail.
    fn feed(
        disk: Option<Arc<DiskTier>>,
        calls: &Arc<AtomicUsize>,
        results: Vec<APIResult<String>>,
    ) -> Arc<Feed> {
        let calls = Arc::clone(calls);
        let results = Arc::new(std::sync::Mutex::new(results.into_iter()));
        let fetch: Fetch = Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            let next = results.lock().unwrap().next();
            Box::pin(async move {
                tokio::time::sleep(Duration::from_millis(20)).await;
                next.unwrap_or_else(|| Err(upstream_error("no more results")))
            })
        });
        let feed = Feed::new("https://example.com/feed", fetch);
        feed.disk.set(disk).ok().unwrap();
        Arc::new(feed)
    }

    /// Lets spawned refreshes run to completion.
    async fn settle() {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    /// Makes `feed`'s body stale.
    fn expire(feed: &Feed) {
        let text = Arc::clone(&feed.body.load_full().unwrap().text);
        feed.body.store(Some(Arc::new(Body {
            text,
            fresh_until: Instant::now(),
        })));
    }

    #[tokio::test]
    async fn cold_requests_share_one_fetch_and_then_hit() {
        let calls = Arc::new(AtomicUsize::new(0));
        let feed = feed(None, &calls, vec![Ok("a".to_owned())]);
        let (a, b) = tokio::join!(feed.get(), feed.get());
        assert_eq!(&*a.unwrap(), "a");
        assert_eq!(&*b.unwrap(), "a");
        assert_eq!(&*feed.get().await.unwrap(), "a");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn cold_failure_fails_fast_until_retry_after() {
        let calls = Arc::new(AtomicUsize::new(0));
        let feed = feed(None, &calls, vec![Err(upstream_error("down"))]);
        let (a, b) = tokio::join!(feed.get(), feed.get());
        a.unwrap_err();
        assert!(b.unwrap_err().to_string().contains("down"));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        // Backoff over: the next request fetches again.
        feed.fetching.lock().await.as_mut().unwrap().at =
            Instant::now().checked_sub(RETRY_AFTER).unwrap();
        feed.get().await.unwrap_err();
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn stale_body_is_served_while_refreshing() {
        let calls = Arc::new(AtomicUsize::new(0));
        let feed = feed(None, &calls, vec![Ok("a".to_owned()), Ok("b".to_owned())]);
        assert_eq!(&*feed.get().await.unwrap(), "a");
        expire(&feed);
        // Served stale at once; one refresh in the background.
        let (a, b) = tokio::join!(feed.get(), feed.get());
        assert_eq!(&*a.unwrap(), "a");
        assert_eq!(&*b.unwrap(), "a");
        settle().await;
        assert_eq!(&*feed.get().await.unwrap(), "b");
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn failed_refresh_keeps_the_body_and_backs_off() {
        let calls = Arc::new(AtomicUsize::new(0));
        let feed = feed(
            None,
            &calls,
            vec![Ok("a".to_owned()), Err(upstream_error("down"))],
        );
        assert_eq!(&*feed.get().await.unwrap(), "a");
        expire(&feed);
        assert_eq!(&*feed.get().await.unwrap(), "a");
        settle().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // Still stale, but the failed refresh holds off the next one.
        assert_eq!(&*feed.get().await.unwrap(), "a");
        settle().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn restart_restores_the_last_good_body_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let disk = Arc::new(DiskTier::open(dir.path()).unwrap());
        let calls = Arc::new(AtomicUsize::new(0));
        let first = feed(Some(Arc::clone(&disk)), &calls, vec![Ok("a".to_owned())]);
        assert_eq!(&*first.get().await.unwrap(), "a");
        disk.flush().await;

        // A new instance while the upstream is down serves the stored body.
        let restarted = feed(Some(disk), &calls, vec![Err(upstream_error("down"))]);
        assert_eq!(&*restarted.get().await.unwrap(), "a");
        settle().await;
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(&*restarted.get().await.unwrap(), "a");
    }

    #[test]
    fn parsed_is_reused_while_the_bodies_are_the_same() {
        let parsed = Parsed::<usize>::default();
        let a: Arc<str> = "a".into();
        let parse_calls = AtomicUsize::new(0);
        let parse = |body: &Arc<str>| {
            parse_calls.fetch_add(1, Ordering::SeqCst);
            Ok(body.len())
        };
        parsed.get(&[Arc::clone(&a)], || parse(&a)).unwrap();
        parsed.get(&[Arc::clone(&a)], || parse(&a)).unwrap();
        assert_eq!(parse_calls.load(Ordering::SeqCst), 1);
        let b: Arc<str> = "a".into();
        parsed.get(&[Arc::clone(&b)], || parse(&b)).unwrap();
        assert_eq!(parse_calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_patches() {
        let patches = PatchFeeds::new().patch_notes().await.unwrap();
        assert!(patches.len() > 7);
    }

    #[tokio::test]
    async fn test_combined_patch_feed() {
        let items = PatchFeeds::new().combined().await.unwrap();
        let from_forum = items
            .iter()
            .filter(|i| matches!(i, FeedItem::Forum(_)))
            .count();
        let from_steam = items
            .iter()
            .filter(|i| matches!(i, FeedItem::Steam(_)))
            .count();
        assert!(
            from_forum >= 2,
            "expected at least 2 forum entries, got {from_forum}",
        );
        assert!(
            from_steam >= 2,
            "expected at least 2 steam entries, got {from_steam}",
        );
    }
}
