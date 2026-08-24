//! `/v1/assets/ranked-seasons` data layer — fetch + parse + transform.

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::services::assets::versions::common::build_from_kv3;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;
use crate::services::assets::versions::store;

// ----- Raw KV3 shape -----

#[derive(Debug, Deserialize)]
struct RawRankedSeason {
    #[serde(rename = "m_strSeasonLocName")]
    name: String,
    #[serde(rename = "m_eRankedType")]
    ranked_type: String,
    #[serde(rename = "m_unMinWins")]
    min_wins: u32,
    #[serde(rename = "m_unMinHeroWins")]
    min_hero_wins: u32,
    #[serde(rename = "m_unMinHeroUnlocks")]
    min_hero_unlocks: u32,
    #[serde(rename = "m_unCalibrationMatches")]
    calibration_matches: u32,
    #[serde(default, rename = "m_vecValidPartySizes")]
    valid_party_sizes: Vec<u32>,
    #[serde(default, rename = "m_vecIntervals")]
    intervals: Vec<RawSeasonInterval>,
}

#[derive(Debug, Deserialize)]
struct RawSeasonInterval {
    #[serde(rename = "m_unInterval")]
    interval: u32,
    #[serde(rename = "m_rtIntervalStartTimestamp")]
    start_timestamp: i64,
    #[serde(rename = "m_rtIntervalEndTimestamp")]
    end_timestamp: i64,
}

// ----- Public shape -----

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct SeasonInterval {
    pub interval: u32,
    /// Unix timestamp (seconds) at which the interval starts.
    pub start_timestamp: i64,
    /// Unix timestamp (seconds) at which the interval ends.
    pub end_timestamp: i64,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct RankedSeason {
    pub class_name: String,
    pub name: String,
    pub ranked_type: String,
    pub min_wins: u32,
    pub min_hero_wins: u32,
    pub min_hero_unlocks: u32,
    pub calibration_matches: u32,
    pub valid_party_sizes: Vec<u32>,
    pub intervals: Vec<SeasonInterval>,
}

pub(crate) fn build_ranked_seasons(
    vdata: &str,
    loc: &HashMap<String, String>,
) -> Result<Vec<RankedSeason>, AssetsError> {
    build_from_kv3(
        vdata,
        "ranked season",
        // `default_ranked` is an inheritance template (pulled in via `_multibase`)
        // and carries no season name, so it isn't a season in its own right.
        |_, value| value.get("m_strSeasonLocName").is_some(),
        |class_name, raw| transform(class_name, raw, loc),
    )
}

fn transform(
    class_name: String,
    r: RawRankedSeason,
    loc: &HashMap<String, String>,
) -> RankedSeason {
    RankedSeason {
        class_name,
        name: localization::localize(loc, &r.name),
        ranked_type: map_ranked_type(&r.ranked_type),
        min_wins: r.min_wins,
        min_hero_wins: r.min_hero_wins,
        min_hero_unlocks: r.min_hero_unlocks,
        calibration_matches: r.calibration_matches,
        valid_party_sizes: r.valid_party_sizes,
        intervals: r
            .intervals
            .into_iter()
            .map(|i| SeasonInterval {
                interval: i.interval,
                start_timestamp: i.start_timestamp,
                end_timestamp: i.end_timestamp,
            })
            .collect(),
    }
}

fn map_ranked_type(raw: &str) -> String {
    match raw {
        "k_eCitadelRankedType_Normal" => "normal".to_owned(),
        other => other.to_owned(),
    }
}

/// The interval running at `now` (unix seconds), as accepted by the
/// `rank_interval` field of `CMsgClientToGCGetMatchHistory`.
pub(crate) fn interval_at(seasons: &[RankedSeason], now: i64) -> Option<u32> {
    seasons
        .iter()
        .flat_map(|s| &s.intervals)
        .find(|i| (i.start_timestamp..=i.end_timestamp).contains(&now))
        .map(|i| i.interval)
}

// ----- Cached fetch -----

#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)",
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_ranked_seasons(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<RankedSeason>>, AssetsError> {
    let (vdata, loc) = tokio::try_join!(
        async {
            Ok::<_, AssetsError>(
                store::fetch_text(r2, version, "scripts/ranked_seasons.vdata").await?,
            )
        },
        localization::fetch_localization(r2, version, language),
    )?;
    Ok(Arc::new(build_ranked_seasons(&vdata, &loc)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::localization as kv1;

    fn fixtures() -> (String, HashMap<String, String>) {
        let manifest = env!("CARGO_MANIFEST_DIR");
        let vdata = std::fs::read_to_string(format!(
            "{manifest}/src/utils/kv3_fixtures/ranked_seasons.vdata"
        ))
        .expect("vdata fixture");
        let loc_src = std::fs::read_to_string(format!(
            "{manifest}/src/utils/localization_fixtures/ranked_seasons_english.txt"
        ))
        .expect("loc fixture");
        let loc = kv1::parse(&loc_src)
            .expect("loc parses")
            .tokens
            .into_iter()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        (vdata, loc)
    }

    #[test]
    fn snapshot_english() {
        let (vdata, loc) = fixtures();
        let out = build_ranked_seasons(&vdata, &loc).expect("builds");
        insta::with_settings!(
            { snapshot_path => "ranked_seasons_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("ranked_seasons_english", out); }
        );
    }

    #[test]
    fn skips_the_inheritance_template() {
        let (vdata, loc) = fixtures();
        let out = build_ranked_seasons(&vdata, &loc).expect("builds");
        assert!(out.iter().all(|s| s.class_name != "default_ranked"));
        assert!(!out.is_empty());
    }
}
