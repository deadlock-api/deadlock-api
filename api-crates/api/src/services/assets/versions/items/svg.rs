//! SVG fetcher backed by the public assets bucket. Inlined keybind / inline-
//! attribute icons are pulled from
//! `https://assets-bucket.deadlock-api.com/assets-api-res/icons/<path>` (the
//! nested path under `panorama/images/`, e.g. `glyphs/mouse1.svg`) and
//! cached in-process. Negative responses are cached too so we don't refetch.

use core::time::Duration;
use std::sync::{Arc, LazyLock, OnceLock};

use cached::macros::cached;
use regex::Regex;

const ICONS_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

/// Timeouts match the shared API client, so a stalled bucket can't hang an item build.
fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default()
    })
}

#[cached(
    max_size = 256,
    ttl_secs = 86400,
    convert = r#"{ name.to_owned() }"#,
    key = "String"
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
    if let [b'#', hex @ ..] = s.as_bytes()
        && let [r1, r2, g1, g2, b1, b2] = *hex
        && hex.iter().all(u8::is_ascii_hexdigit)
        && r1.eq_ignore_ascii_case(&r2)
        && g1.eq_ignore_ascii_case(&g2)
        && b1.eq_ignore_ascii_case(&b2)
    {
        return std::borrow::Cow::Owned(format!("#{}{}{}", r1 as char, g1 as char, b1 as char));
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
        /// `None` only if the pattern fails to compile, which the tests below rule out.
        static FILL: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r#"fill="[^"]+""#).ok());
        let Some(re) = FILL.as_ref() else {
            tracing::error!("svg fill regex failed to compile; leaving fills unchanged");
            return svg.to_owned();
        };
        return re.replace_all(svg, format!("fill=\"{fill}\"")).into_owned();
    }
    svg.replacen("<svg", &format!("<svg fill=\"{fill}\""), 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_fill_and_shortens_hex() {
        assert_eq!(
            add_fill_to_svg(r##"<svg><path fill="#000"/></svg>"##, Some("#aabbcc")),
            r##"<svg><path fill="#abc"/></svg>"##
        );
        assert_eq!(shorten_hex("#aabbcd"), "#aabbcd");
    }
}
