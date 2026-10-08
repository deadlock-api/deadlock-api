use core::num::TryFromIntError;
use core::str::FromStr;
use core::time::Duration;

use reqwest::{Response, StatusCode, Url};
use serde::{Deserialize, Deserializer};
use tracing::info;

use crate::error::{APIError, APIResult};
use crate::state::AppState;

// Query Parameter Parsing
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum CommaSeparated<T>
where
    T: core::fmt::Debug + FromStr,
{
    /// A List of numbers in a single comma separated string, e.g. "1,2,3"
    CommaStringList(String),
    /// A List of numbers in a string array, e.g. `["1", "2", "3"]`
    StringList(Vec<String>),
    /// A single number, e.g. 1
    Single(T),
    /// A list of numbers, e.g. [1, 2, 3]
    List(Vec<T>),
}

pub(crate) fn comma_separated_deserialize_option<'de, D, T>(
    deserializer: D,
) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr + Deserialize<'de> + core::fmt::Debug,
{
    let parsed: CommaSeparated<T> = match Option::deserialize(deserializer)? {
        Some(v) => v,
        None => return Ok(None),
    };

    Ok(match parsed {
        CommaSeparated::List(vec) => Some(vec),
        CommaSeparated::Single(val) => Some(vec![val]),
        CommaSeparated::StringList(val) => {
            let out = val
                .iter()
                .map(|s| s.parse())
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| serde::de::Error::custom("Failed to parse list item"))?;
            (!out.is_empty()).then_some(out)
        }
        CommaSeparated::CommaStringList(str) => {
            let str = str.replace(['[', ']'], "");

            // If the string is empty, return None
            if str.is_empty() {
                return Ok(None);
            }

            // `split` yields at least one item, so the list is never empty.
            Some(
                str.split(',')
                    .map(|s| s.trim().parse())
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|_| {
                        serde::de::Error::custom("Failed to parse comma separated list")
                    })?,
            )
        }
    })
}

const STEAM_ID_64_IDENT: u64 = 76561197960265728;

pub(crate) fn steamid64_to_steamid3(steam_id: u64) -> Result<u32, TryFromIntError> {
    // If steam id is smaller than the Steam ID 64 identifier, it's a Steam ID 3
    u32::try_from(steam_id.checked_sub(STEAM_ID_64_IDENT).unwrap_or(steam_id))
}

#[derive(Deserialize, Debug)]
pub(crate) struct SpectateMatchResponse {
    pub broadcast_url: String,
}

pub(crate) async fn spectate_match(
    http_client: &reqwest::Client,
    match_id: u64,
    api_key: Option<&str>,
) -> reqwest::Result<SpectateMatchResponse> {
    http_client
        .get(format!(
            "https://api.deadlock-api.com/v1/matches/{match_id}/live/url"
        ))
        .header("X-API-Key", api_key.unwrap_or_default())
        .send()
        .await?
        .error_for_status()?
        .json()
        .await
}

pub(crate) async fn live_demo_exists(
    http_client: &reqwest::Client,
    broadcast_url: &str,
) -> reqwest::Result<()> {
    let broadcast_url = broadcast_url.strip_suffix('/').unwrap_or(broadcast_url);
    http_client
        .head(format!("{broadcast_url}/sync"))
        .send()
        .await
        .and_then(Response::error_for_status)
        .map(drop)
}

/// Resolves a match's broadcast URL through the API, checks it and waits for its demo to
/// go live.
pub(crate) async fn match_broadcast_url(state: &AppState, match_id: u64) -> APIResult<String> {
    info!("Spectating match {match_id}");
    let response = tryhard::retry_fn(|| {
        spectate_match(
            &state.http_client,
            match_id,
            state.config.deadlock_api_key.as_deref(),
        )
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(200))
    .await?;

    validate_upstream_broadcast_url(&response.broadcast_url)?;
    wait_for_live_demo(&state.http_client, &response.broadcast_url).await?;
    Ok(response.broadcast_url)
}

pub(crate) async fn wait_for_live_demo(
    http_client: &reqwest::Client,
    broadcast_url: &str,
) -> Result<(), APIError> {
    tryhard::retry_fn(|| live_demo_exists(http_client, broadcast_url))
        .retries(60)
        .fixed_backoff(Duration::from_millis(500))
        .await
        .map_err(|e| APIError::internal(format!("Demo not available: {e}")))
}

/// Host suffixes Valve serves match broadcasts from. The GC hands out relay URLs like
/// `http://dist1-ord1.steamcontent.com/tv/<id>`; `valve.net` covers Valve's replay hosts.
const BROADCAST_HOST_SUFFIXES: [&str; 2] = [".steamcontent.com", ".valve.net"];

/// Validates a user-supplied broadcast URL, so the `?broadcast_url=` endpoints cannot be
/// pointed at arbitrary hosts: only http(s) URLs on Valve broadcast hosts, without
/// credentials, are accepted.
pub(crate) fn validate_broadcast_url(broadcast_url: &str) -> Result<(), APIError> {
    let bad_request = |message: &str| APIError::StatusMsg {
        status: StatusCode::BAD_REQUEST,
        message: message.to_owned(),
    };
    let url = Url::parse(broadcast_url).map_err(|_| bad_request("Invalid broadcast_url"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(bad_request("broadcast_url must be an http(s) URL"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(bad_request("broadcast_url must not contain credentials"));
    }
    let is_valve_host = url.domain().is_some_and(|host| {
        let host = host.to_ascii_lowercase();
        BROADCAST_HOST_SUFFIXES
            .iter()
            .any(|suffix| host.ends_with(suffix))
    });
    if !is_valve_host {
        return Err(bad_request(
            "broadcast_url must point to a Valve broadcast host",
        ));
    }
    Ok(())
}

/// Checks a broadcast URL that came from the API's `/live/url` endpoint rather than from the
/// caller. It is still checked, since the API's cached value is outside this service's control;
/// a URL that fails is the upstream's fault, hence a 500 rather than a 400.
pub(crate) fn validate_upstream_broadcast_url(broadcast_url: &str) -> Result<(), APIError> {
    validate_broadcast_url(broadcast_url).map_err(|_| {
        APIError::internal("The API returned a broadcast URL outside Valve's broadcast hosts")
    })
}

/// Redirect hops a request may take.
const MAX_REDIRECTS: usize = 5;

#[derive(Debug, PartialEq, Eq)]
enum RedirectDecision {
    Follow,
    /// Fail the request: handing back the 3xx itself would pass `error_for_status` and
    /// be read as broadcast data.
    Stop,
    TooMany,
}

/// `previous` holds every URL requested so far, the initial one first. A request that
/// started at a broadcast host may only be redirected to broadcast hosts, so a redirect
/// cannot turn a validated `broadcast_url` into a request to an arbitrary host.
fn redirect_decision(previous: &[Url], next: &Url) -> RedirectDecision {
    if previous.len() > MAX_REDIRECTS {
        return RedirectDecision::TooMany;
    }
    let started_at_broadcast_host = previous
        .first()
        .is_some_and(|initial| validate_broadcast_url(initial.as_str()).is_ok());
    if started_at_broadcast_host && validate_broadcast_url(next.as_str()).is_err() {
        return RedirectDecision::Stop;
    }
    RedirectDecision::Follow
}

/// Redirect policy for the shared HTTP client, see [`redirect_decision`].
pub(crate) fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        match redirect_decision(attempt.previous(), attempt.url()) {
            RedirectDecision::Follow => attempt.follow(),
            RedirectDecision::Stop => attempt.error("redirect outside Valve broadcast hosts"),
            RedirectDecision::TooMany => attempt.error("too many redirects"),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn urls(urls: &[&str]) -> Vec<Url> {
        urls.iter().map(|u| Url::parse(u).unwrap()).collect()
    }

    #[test]
    fn broadcast_requests_only_redirect_to_broadcast_hosts() {
        let start = urls(&["http://dist1-ord1.steamcontent.com/tv/1/sync"]);
        let valve = Url::parse("http://dist1-fra1.steamcontent.com/tv/1/sync").unwrap();
        let internal = Url::parse("http://169.254.169.254/latest/meta-data").unwrap();
        assert_eq!(redirect_decision(&start, &valve), RedirectDecision::Follow);
        assert_eq!(redirect_decision(&start, &internal), RedirectDecision::Stop);
    }

    #[test]
    fn other_requests_follow_redirects_up_to_the_limit() {
        let start = urls(&["https://api.deadlock-api.com/v1/matches/1/live/url"]);
        let next = Url::parse("https://example.com/").unwrap();
        assert_eq!(redirect_decision(&start, &next), RedirectDecision::Follow);

        let hops = vec![start[0].clone(); MAX_REDIRECTS + 1];
        assert_eq!(redirect_decision(&hops, &next), RedirectDecision::TooMany);
        let hops = vec![start[0].clone(); MAX_REDIRECTS];
        assert_eq!(redirect_decision(&hops, &next), RedirectDecision::Follow);
    }

    #[test]
    fn accepts_valve_broadcast_hosts() {
        for url in [
            "http://dist1-ord1.steamcontent.com/tv/18895867",
            "https://dist1-fra1.steamcontent.com/tv/18895867_abc/",
            "http://replay3.valve.net/tv/1",
        ] {
            assert!(validate_broadcast_url(url).is_ok(), "{url}");
        }
    }

    #[test]
    fn rejects_other_hosts_and_schemes() {
        for url in [
            "http://localhost:3000/tv/1",
            "http://127.0.0.1/tv/1",
            "http://169.254.169.254/latest/meta-data",
            "http://steamcontent.com.evil.example/tv/1",
            "http://evilsteamcontent.com/tv/1",
            "file:///etc/passwd",
            "ftp://dist1-ord1.steamcontent.com/tv/1",
            "http://user:pass@dist1-ord1.steamcontent.com/tv/1",
            "not a url",
        ] {
            assert!(validate_broadcast_url(url).is_err(), "{url}");
        }
    }
}
