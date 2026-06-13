//! `/v1/assets/steam-info` data layer — fetch + parse the per-version
//! `steam.inf` manifest produced by the game build.
//!
//! The file is a flat `key=value` text document (no quoting, no nesting). The
//! original `steam_info.json` shape served by the Python assets API is
//! preserved verbatim, including field order, so this endpoint can swap in
//! transparently.

use std::collections::HashMap;
use std::sync::Arc;

use bytes::Bytes;
use cached::macros::cached;
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use object_store::aws::AmazonS3;
use serde::Serialize;
use utoipa::ToSchema;

use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

/// Per-patch Steam manifest as served by the public assets API.
///
/// Field order is load-bearing — it sets the JSON key order, which matches the
/// legacy Python endpoint.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct SteamInfo {
    pub client_version: u32,
    pub server_version: u32,
    pub product_name: String,
    pub app_id: u32,
    pub server_app_id: u32,
    pub tools_app_id: u32,
    pub source_revision: u64,
    pub version_date: String,
    pub version_time: String,
    /// `version_date` + `version_time` combined into a naive ISO-8601 string
    /// (`YYYY-MM-DDTHH:MM:SS`, no timezone) — matches the Python output.
    pub version_datetime: String,
}

/// Parse a flat `key=value\n` document, ignoring lines without `=`.
fn parse_inf(text: &str) -> HashMap<&str, &str> {
    text.lines()
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim(), v.trim()))
        .collect()
}

pub(crate) fn build_steam_info(text: &str) -> Result<SteamInfo, AssetsError> {
    let raw = parse_inf(text);

    let get = |k: &str| -> Result<&str, AssetsError> {
        raw.get(k)
            .copied()
            .ok_or_else(|| AssetsError::SteamInfo(format!("missing key '{k}' in steam.inf")))
    };
    let get_int = |k: &str| -> Result<u64, AssetsError> {
        get(k)?
            .parse::<u64>()
            .map_err(|e| AssetsError::SteamInfo(format!("invalid integer for '{k}': {e}")))
    };
    let get_u32 = |k: &str| -> Result<u32, AssetsError> {
        u32::try_from(get_int(k)?)
            .map_err(|e| AssetsError::SteamInfo(format!("value for '{k}' overflows u32: {e}")))
    };

    let version_date = get("VersionDate")?.to_owned();
    let version_time = get("VersionTime")?.to_owned();
    let date = NaiveDate::parse_from_str(&version_date, "%b %d %Y").map_err(|e| {
        AssetsError::SteamInfo(format!("invalid VersionDate '{version_date}': {e}"))
    })?;
    let time = NaiveTime::parse_from_str(&version_time, "%H:%M:%S").map_err(|e| {
        AssetsError::SteamInfo(format!("invalid VersionTime '{version_time}': {e}"))
    })?;
    let version_datetime = NaiveDateTime::new(date, time)
        .format("%Y-%m-%dT%H:%M:%S")
        .to_string();

    Ok(SteamInfo {
        client_version: get_u32("ClientVersion")?,
        server_version: get_u32("ServerVersion")?,
        product_name: get("ProductName")?.to_owned(),
        app_id: get_u32("appID")?,
        server_app_id: get_u32("ServerAppID")?,
        tools_app_id: get_u32("ToolsAppID")?,
        source_revision: get_int("SourceRevision")?,
        version_date,
        version_time,
        version_datetime,
    })
}

#[cached(
    max_size = 64,
    ttl = 86400,
    convert = "{ version }",
    key = "u32",
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_steam_info(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<SteamInfo>, AssetsError> {
    let text = store::fetch_text(r2, version, "steam.inf").await?;
    Ok(Arc::new(build_steam_info(&text)?))
}

/// Bucket key for the pre-built array of every version's steam info, produced
/// by `scripts/update_r2_index.sh`.
const ALL_STEAM_INFO_KEY: &str = "assets-api-res/steam-info/all.json.zst";

/// Fetch the pre-built `[SteamInfo]` array spanning every known version.
///
/// The script collects and parses each version's `steam.inf` offline, so this
/// is served as the raw JSON bytes it produced — already in the same shape and
/// field order as [`SteamInfo`] — without re-fetching N files per request.
#[cached(ttl = 900, convert = "{ 0_u8 }", key = "u8", sync_writes = "by_key")]
pub(crate) async fn fetch_all_steam_info(r2: &AmazonS3) -> Result<Bytes, AssetsError> {
    Ok(store::fetch_zst(r2, ALL_STEAM_INFO_KEY).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!(
            "{manifest}/src/services/assets/versions/steam_info_fixtures/steam.inf"
        ))
        .expect("steam.inf fixture")
    }

    #[test]
    fn snapshot_steam_info() {
        let data = build_steam_info(&fixture()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "steam_info_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("steam_info", data); }
        );
    }

    #[test]
    fn version_datetime_is_naive_iso8601() {
        let data = build_steam_info(&fixture()).expect("builds");
        assert_eq!(data.version_datetime, "2026-05-22T14:44:16");
    }

    #[test]
    fn rejects_missing_key() {
        let err = build_steam_info("ClientVersion=1\n").expect_err("missing fields");
        assert!(matches!(err, AssetsError::SteamInfo(_)));
    }
}
