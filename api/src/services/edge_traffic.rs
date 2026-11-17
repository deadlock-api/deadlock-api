//! The requests Cloudflare answers itself, for the live request map: API cache hits, the website,
//! the asset bucket and the other subdomains. They never reach the API, so they come from
//! Cloudflare's GraphQL analytics, one minute at a time, a few minutes behind (that is when a minute
//! is complete there). The map gets the minute as a table of (kind, data center, country, count)
//! and plays every request of it out itself.

use core::time::Duration;
use std::collections::BTreeMap;

use serde::Deserialize;
use tracing::warn;

const GRAPHQL_URL: &str = "https://api.cloudflare.com/client/v4/graphql";

/// How far behind real time the minute fetched is: Cloudflare's analytics fill a minute within
/// 2-3 minutes.
const DELAY: Duration = Duration::from_mins(3);

/// The API host; only its cache hits count here, its other requests reach the API itself.
const API_HOST: &str = "api.deadlock-api.com";
const WEBSITE_HOSTS: &[&str] = &["deadlock-api.com", "www.deadlock-api.com"];
const ASSETS_PREFIX: &str = "assets";
/// The public data lake: Parquet files and the `DuckDB` catalog.
const DATA_LAKE_HOST: &str = "data.deadlock-api.com";
/// Cache statuses Cloudflare answers from its cache without asking the origin.
const CACHED: &[&str] = &["hit", "stale", "updating", "revalidated"];
/// Cache status of what Cloudflare answers without looking at its cache: preflights from the CORS
/// Snippet, firewall blocks, client aborts. On the API host these stay out of the hit rate.
const NOT_CACHEABLE: &str = "none";

/// What Cloudflare served without the API.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EdgeKind {
    ApiCache = 0,
    Website = 1,
    Assets = 2,
    Other = 3,
    DataLake = 4,
}

impl EdgeKind {
    fn of(host: &str, cache_status: &str) -> Option<Self> {
        if host == API_HOST {
            return CACHED.contains(&cache_status).then_some(Self::ApiCache);
        }
        Some(if host == DATA_LAKE_HOST {
            Self::DataLake
        } else if WEBSITE_HOSTS.contains(&host) {
            Self::Website
        } else if host.starts_with(ASSETS_PREFIX) {
            Self::Assets
        } else {
            Self::Other
        })
    }
}

/// One complete minute of Cloudflare-served traffic, encoded once for every batch that carries it.
/// `s` holds the zone's cache totals (see [`CacheTotals`]), `d` the data lake's since midnight UTC.
#[derive(Debug, Clone)]
pub(crate) struct EdgeMinute {
    /// Unix minute it covers.
    pub(crate) minute: i64,
    /// `{"m": minute, "g": [[kind, colo, country, count], ...], "s": {tr, cr, tb, cb, at, ac, lr,
    /// lb}, "d": {lr, lb}}`.
    pub(crate) json: serde_json::Value,
}

#[derive(Deserialize)]
struct Response {
    data: Option<Data>,
    #[serde(default)]
    errors: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct Data {
    viewer: Viewer,
}

#[derive(Deserialize)]
struct Viewer {
    zones: Vec<Zone>,
}

#[derive(Deserialize)]
struct Zone {
    #[serde(rename = "httpRequestsAdaptiveGroups")]
    groups: Vec<Group>,
}

#[derive(Deserialize)]
struct Group {
    count: u64,
    #[serde(default)]
    sum: Sum,
    /// Absent in a query without dimensions: one group of the whole range.
    #[serde(default)]
    dimensions: Dimensions,
}

#[derive(Deserialize, Default)]
struct Sum {
    #[serde(rename = "edgeResponseBytes", default)]
    edge_response_bytes: u64,
}

/// The zone's cache in a minute: requests and response bytes, all and from cache, for every host
/// and for the API alone (only what Cloudflare could cache, see [`NOT_CACHEABLE`]), and the data
/// lake's requests and bytes.
#[derive(Debug, Default, PartialEq, Eq)]
struct CacheTotals {
    requests: u64,
    cached_requests: u64,
    bytes: u64,
    cached_bytes: u64,
    api_requests: u64,
    api_cached_requests: u64,
    lake_requests: u64,
    lake_bytes: u64,
}

impl CacheTotals {
    fn add(&mut self, group: &Group) {
        let cached = CACHED.contains(&group.dimensions.cache_status.as_str());
        let bytes = group.sum.edge_response_bytes;
        self.requests = self.requests.saturating_add(group.count);
        self.bytes = self.bytes.saturating_add(bytes);
        if cached {
            self.cached_requests = self.cached_requests.saturating_add(group.count);
            self.cached_bytes = self.cached_bytes.saturating_add(bytes);
        }
        if group.dimensions.host == DATA_LAKE_HOST {
            self.lake_requests = self.lake_requests.saturating_add(group.count);
            self.lake_bytes = self.lake_bytes.saturating_add(bytes);
        }
        if group.dimensions.host == API_HOST && group.dimensions.cache_status != NOT_CACHEABLE {
            self.api_requests = self.api_requests.saturating_add(group.count);
            if cached {
                self.api_cached_requests = self.api_cached_requests.saturating_add(group.count);
            }
        }
    }

    fn json(&self) -> serde_json::Value {
        serde_json::json!({
            "tr": self.requests,
            "cr": self.cached_requests,
            "tb": self.bytes,
            "cb": self.cached_bytes,
            "at": self.api_requests,
            "ac": self.api_cached_requests,
            "lr": self.lake_requests,
            "lb": self.lake_bytes,
        })
    }
}

#[derive(Deserialize, Default)]
struct Dimensions {
    #[serde(rename = "clientRequestHTTPHost")]
    host: String,
    #[serde(rename = "cacheStatus")]
    cache_status: String,
    #[serde(rename = "coloCode")]
    colo: String,
    #[serde(rename = "clientCountryName")]
    country: String,
}

/// Leaves out Cloudflare's Early Hints subrequests (user agent `nginx-ssl early hints` / `bastion
/// early hints`): they are logged as requests (a quarter of the API host's rows, as `miss`/504
/// without any origin contact) but no client sent them.
const QUERY: &str = "query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: \
                     {zoneTag: $zone}) { httpRequestsAdaptiveGroups(limit: 10000, filter: \
                     {datetime_geq: $from, datetime_lt: $to, userAgent_notlike: \
                     \"%early hints%\"}) { count sum { edgeResponseBytes } \
                     dimensions { clientRequestHTTPHost cacheStatus coloCode clientCountryName } } } \
                     } }";

/// The data lake's requests and bytes over a range, as one group.
const LAKE_QUERY: &str = "query($zone: String!, $from: Time!, $to: Time!) { viewer { zones(filter: \
                          {zoneTag: $zone}) { httpRequestsAdaptiveGroups(limit: 1, filter: \
                          {datetime_geq: $from, datetime_lt: $to, clientRequestHTTPHost: \
                          \"data.deadlock-api.com\"}) { count sum { edgeResponseBytes } } } } }";

/// Groups the zone's requests of a minute by kind, data center and country, dropping the API's
/// uncached ones (the API feeds those itself).
fn table(groups: Vec<Group>) -> Vec<(u8, String, String, u64)> {
    // Several hosts and cache statuses fold into one kind.
    let mut counts: BTreeMap<(u8, String, String), u64> = BTreeMap::new();
    for group in groups {
        let d = group.dimensions;
        if let Some(kind) = EdgeKind::of(&d.host, &d.cache_status) {
            let count = counts.entry((kind as u8, d.colo, d.country)).or_default();
            *count = count.saturating_add(group.count);
        }
    }
    counts
        .into_iter()
        .map(|((kind, colo, country), count)| (kind, colo, country, count))
        .collect()
}

/// Runs one analytics query over the unix minutes `from`..`to` and returns its groups.
async fn query(
    http: &reqwest::Client,
    token: &str,
    zone: &str,
    query: &str,
    from: i64,
    to: i64,
) -> Result<Vec<Group>, String> {
    let at = |m: i64| {
        chrono::DateTime::from_timestamp(m.saturating_mul(60), 0)
            .map_or_default(|t| t.format("%Y-%m-%dT%H:%M:%SZ").to_string())
    };
    let body = serde_json::json!({
        "query": query,
        "variables": { "zone": zone, "from": at(from), "to": at(to) },
    });
    let response: Response = http
        .post(GRAPHQL_URL)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    response
        .data
        .and_then(|d| d.viewer.zones.into_iter().next())
        .map(|zone| zone.groups)
        .ok_or_else(|| format!("no data: {:?}", response.errors))
}

/// Fetches the Cloudflare-served traffic of the unix `minute` from the zone's analytics, with the
/// data lake's totals since midnight UTC.
pub(crate) async fn fetch_minute(
    http: &reqwest::Client,
    token: &str,
    zone: &str,
    minute: i64,
) -> Result<EdgeMinute, String> {
    let next = minute.saturating_add(1);
    let midnight = minute.saturating_sub(minute.rem_euclid(24 * 60));
    let (groups, lake) = tokio::join!(
        query(http, token, zone, QUERY, minute, next),
        query(http, token, zone, LAKE_QUERY, midnight, next),
    );
    let groups = groups?;
    let mut totals = CacheTotals::default();
    for group in &groups {
        totals.add(group);
    }
    // The day's total is a nice-to-have: without it the minute still goes out.
    let lake = lake
        .ok()
        .and_then(|g| g.into_iter().next())
        .map(|g| serde_json::json!({ "lr": g.count, "lb": g.sum.edge_response_bytes }));
    let json = serde_json::json!({
        "m": minute,
        "g": table(groups),
        "s": totals.json(),
        "d": lake,
    });
    Ok(EdgeMinute { minute, json })
}

/// The unix minute to fetch now: the newest one Cloudflare has complete.
pub(crate) fn target_minute() -> i64 {
    let delay = i64::try_from(DELAY.as_secs()).unwrap_or(0);
    chrono::Utc::now()
        .timestamp()
        .saturating_sub(delay)
        .div_euclid(60)
}

/// Logs a failed fetch once per distinct error, not every poll.
pub(crate) fn log_failure(last: &mut Option<String>, error: String) {
    if last.as_ref() != Some(&error) {
        warn!("Cloudflare edge traffic unavailable: {error}");
        *last = Some(error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn group(host: &str, status: &str, colo: &str, count: u64) -> Group {
        Group {
            count,
            sum: Sum {
                edge_response_bytes: count * 10,
            },
            dimensions: Dimensions {
                host: host.to_owned(),
                cache_status: status.to_owned(),
                colo: colo.to_owned(),
                country: "DE".to_owned(),
            },
        }
    }

    #[test]
    fn kinds_by_host() {
        assert_eq!(EdgeKind::of(API_HOST, "hit"), Some(EdgeKind::ApiCache));
        assert_eq!(EdgeKind::of(API_HOST, "miss"), None);
        assert_eq!(
            EdgeKind::of("deadlock-api.com", "none"),
            Some(EdgeKind::Website)
        );
        assert_eq!(
            EdgeKind::of("assets-bucket.deadlock-api.com", "hit"),
            Some(EdgeKind::Assets)
        );
        assert_eq!(
            EdgeKind::of("data.deadlock-api.com", "hit"),
            Some(EdgeKind::DataLake)
        );
        assert_eq!(
            EdgeKind::of("e.deadlock-api.com", "hit"),
            Some(EdgeKind::Other)
        );
    }

    #[test]
    fn table_folds_and_drops_uncached_api() {
        let rows = table(vec![
            group(API_HOST, "hit", "FRA", 5),
            group(API_HOST, "stale", "FRA", 2),
            group(API_HOST, "miss", "FRA", 100),
            group("data.deadlock-api.com", "hit", "FRA", 3),
            group("e.deadlock-api.com", "dynamic", "FRA", 4),
            group("demo-extracts.deadlock-api.com", "miss", "FRA", 1),
        ]);
        assert_eq!(
            rows,
            vec![
                (0, "FRA".to_owned(), "DE".to_owned(), 7),
                (3, "FRA".to_owned(), "DE".to_owned(), 5),
                (4, "FRA".to_owned(), "DE".to_owned(), 3)
            ]
        );
    }

    #[test]
    fn cache_totals() {
        let mut totals = CacheTotals::default();
        for g in [
            group(API_HOST, "hit", "FRA", 5),
            group(API_HOST, "miss", "FRA", 15),
            // Preflights answered by the Snippet: zone traffic, but not in the API's hit rate.
            group(API_HOST, "none", "FRA", 40),
            group("assets-bucket.deadlock-api.com", "hit", "FRA", 80),
        ] {
            totals.add(&g);
        }
        assert_eq!(
            totals,
            CacheTotals {
                requests: 140,
                cached_requests: 85,
                bytes: 1400,
                cached_bytes: 850,
                api_requests: 20,
                api_cached_requests: 5,
                lake_requests: 0,
                lake_bytes: 0,
            }
        );
    }
}
