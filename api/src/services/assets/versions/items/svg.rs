//! SVG fetcher backed by the public assets bucket. Inlined keybind / inline-
//! attribute icons are pulled from
//! `https://assets-bucket.deadlock-api.com/assets-api-res/icons/<name>` and
//! cached in-process. Negative responses are cached too so we don't refetch.

use core::time::Duration;
use std::sync::{Arc, OnceLock};

use cached::LruTtlCache;
use cached::macros::cached;
use regex::Regex;

const ICONS_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";
const CACHE_SIZE: usize = 256;
const CACHE_TTL: Duration = Duration::from_hours(24);

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

#[cached(
    ty = "LruTtlCache<String, Arc<Option<String>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ name.to_owned() }"#,
    sync_writes = "by_key"
)]
pub(super) async fn fetch_svg(name: &str) -> Arc<Option<String>> {
    let url = format!("{ICONS_BASE_URL}/{name}");
    match http().get(&url).send().await {
        Ok(res) if res.status().is_success() => match res.text().await {
            Ok(s) => Arc::new(Some(s)),
            Err(e) => {
                tracing::warn!("svg {name} body read failed: {e}");
                Arc::new(None)
            }
        },
        Ok(_) => Arc::new(None),
        Err(e) => {
            tracing::warn!("svg {name} fetch failed: {e}");
            Arc::new(None)
        }
    }
}

/// Shortens `#RRGGBB` to `#RGB` when each channel has matching hex digits.
/// Non-matching or non-hex strings are returned unchanged.
pub(super) fn shorten_hex(s: &str) -> std::borrow::Cow<'_, str> {
    let bytes = s.as_bytes();
    if bytes.len() == 7 && bytes[0] == b'#' {
        let hex = &bytes[1..];
        if hex.iter().all(u8::is_ascii_hexdigit)
            && hex[0].eq_ignore_ascii_case(&hex[1])
            && hex[2].eq_ignore_ascii_case(&hex[3])
            && hex[4].eq_ignore_ascii_case(&hex[5])
        {
            return std::borrow::Cow::Owned(format!(
                "#{}{}{}",
                hex[0] as char, hex[2] as char, hex[4] as char
            ));
        }
    }
    std::borrow::Cow::Borrowed(s)
}

/// Rewrites every `fill="..."` attribute to `fill`, or injects `fill="..."`
/// onto the root `<svg>` tag when none exist. Hex fill values are shortened to
/// their 3-digit form when possible.
pub(super) fn add_fill_to_svg(svg: &str, fill: Option<&str>) -> String {
    if svg.is_empty() {
        return svg.to_owned();
    }
    let fill_raw = fill.unwrap_or("white");
    let fill = shorten_hex(fill_raw);
    if svg.contains("fill") {
        static FILL: OnceLock<Regex> = OnceLock::new();
        let re = FILL.get_or_init(|| Regex::new(r#"fill="[^"]+""#).expect("valid regex"));
        return re.replace_all(svg, format!("fill=\"{fill}\"")).into_owned();
    }
    svg.replacen("<svg", &format!("<svg fill=\"{fill}\""), 1)
}
