//! Allow-list for broadcast URLs the API fetches on behalf of a caller.

use reqwest::Url;
use reqwest::redirect::Policy;

/// Domains Valve serves match broadcasts from. The GC hands out relay URLs like
/// `http://dist1-ord1.steamcontent.com/tv/<id>`; `valve.net` covers Valve's replay hosts.
const BROADCAST_DOMAINS: [&str; 2] = ["steamcontent.com", "valve.net"];

/// Redirects followed by [`redirect_policy`] before giving up.
const MAX_REDIRECTS: usize = 5;

/// Validates a broadcast URL before the API fetches it, so callers cannot point the server at
/// internal or arbitrary hosts (SSRF). Only http(s) URLs without credentials on a subdomain of a
/// Valve broadcast domain are accepted; IP literals are rejected. Returns the reason on failure.
pub(crate) fn validate_broadcast_url(broadcast_url: &str) -> Result<(), &'static str> {
    let url = Url::parse(broadcast_url).map_err(|_| "Invalid broadcast_url")?;
    validate_url(&url)
}

fn validate_url(url: &Url) -> Result<(), &'static str> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("broadcast_url must be an http(s) URL");
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("broadcast_url must not contain credentials");
    }
    // `domain()` is `None` for IP literals.
    let Some(host) = url.domain() else {
        return Err("broadcast_url must point to a Valve broadcast host");
    };
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    // Match on a label boundary: `x.steamcontent.com` passes, `evilsteamcontent.com` and
    // `steamcontent.com.evil.com` do not.
    let is_valve_host = BROADCAST_DOMAINS.iter().any(|domain| {
        host.strip_suffix(domain)
            .is_some_and(|prefix| prefix.len() > 1 && prefix.ends_with('.'))
    });
    if !is_valve_host {
        return Err("broadcast_url must point to a Valve broadcast host");
    }
    Ok(())
}

/// Redirect policy for broadcast fetches: a redirect is only followed if its target passes the
/// same allow-list, so a relay cannot bounce the server to another host.
pub(crate) fn redirect_policy() -> Policy {
    Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            attempt.error("too many redirects")
        } else if validate_url(attempt.url()).is_ok() {
            attempt.follow()
        } else {
            attempt.stop()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valve_broadcast_hosts() {
        for url in [
            "http://dist1-ord1.steamcontent.com/tv/18895867",
            "https://dist1-fra1.steamcontent.com/tv/18895867_abc/",
            "http://DIST1-ORD1.SteamContent.com/tv/1",
            "http://dist1-ord1.steamcontent.com./tv/1",
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
            "http://[::1]/tv/1",
            "http://169.254.169.254/latest/meta-data",
            "http://steamcontent.com/tv/1",
            "http://.steamcontent.com/tv/1",
            "http://steamcontent.com.evil.com/tv/1",
            "http://evilsteamcontent.com/tv/1",
            "http://evilvalve.net/tv/1",
            "file:///etc/passwd",
            "ftp://dist1-ord1.steamcontent.com/tv/1",
            "http://user:pass@dist1-ord1.steamcontent.com/tv/1",
            "http://user@dist1-ord1.steamcontent.com/tv/1",
            "not a url",
        ] {
            assert!(validate_broadcast_url(url).is_err(), "{url}");
        }
    }
}
