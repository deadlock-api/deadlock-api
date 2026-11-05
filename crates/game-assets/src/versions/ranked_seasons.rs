//! `/v1/assets/ranked-seasons` data layer — fetch + parse + transform.

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};

use crate::versions::common::build_from_kv3;
use crate::versions::error::AssetsError;
use crate::versions::localization;

// ----- Raw KV3 shape -----

#[derive(Debug, Deserialize)]
struct RawRankedSeason {
    #[serde(rename = "m_strSeasonLocName")]
    name: String,
    #[serde(rename = "m_eRankedType")]
    ranked_type: String,
    #[serde(rename = "m_unMinWins")]
    min_wins: u32,
    #[serde(default, rename = "m_unMinHeroWins")]
    min_hero_wins: Option<u32>,
    #[serde(default, rename = "m_unMinHeroUnlockPoints")]
    min_hero_unlock_points: Option<u32>,
    #[serde(rename = "m_unMinHeroUnlocks")]
    min_hero_unlocks: u32,
    #[serde(rename = "m_unCalibrationMatches")]
    calibration_matches: u32,
    #[serde(default, rename = "m_unCalibrationMaxRank")]
    calibration_max_rank: Option<u32>,
    #[serde(default, rename = "m_unBaseWinLossPointGrant")]
    base_win_loss_point_grant: Option<u32>,
    #[serde(default, rename = "m_vecValidPartySizes")]
    valid_party_sizes: Vec<u32>,
    #[serde(default, rename = "m_vecIntervals")]
    intervals: Vec<RawSeasonInterval>,
    #[serde(default, rename = "m_vecRankInfo")]
    rank_info: Vec<RawRankInfo>,
}

#[derive(Debug, Deserialize)]
struct RawRankInfo {
    #[serde(default, rename = "m_unRankEnd")]
    rank_end: Option<u32>,
    #[serde(default, rename = "m_vecSubRankXP")]
    sub_rank_xp: Vec<u32>,
    #[serde(default, rename = "m_nBadgeShields")]
    badge_shields: Option<i32>,
    #[serde(default, rename = "m_nSubRankShields")]
    sub_rank_shields: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct RawSeasonInterval {
    #[serde(rename = "m_unInterval")]
    interval: u32,
    #[serde(rename = "m_rtIntervalStartTimestamp")]
    start_timestamp: i64,
    #[serde(rename = "m_rtIntervalEndTimestamp")]
    end_timestamp: i64,
    #[serde(default, rename = "m_unLeaderboardID")]
    leaderboard_id: Option<u32>,
}

// ----- Public shape -----

#[derive(Debug, Serialize, Clone)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct SeasonInterval {
    pub interval: u32,
    /// Unix timestamp (seconds) at which the interval starts.
    pub start_timestamp: i64,
    /// Unix timestamp (seconds) at which the interval ends.
    pub end_timestamp: i64,
    /// Leaderboard backing this interval (build 6701+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leaderboard_id: Option<u32>,
}

/// One `m_vecRankInfo` entry of the game file (build 6857+), as listed there.
#[derive(Debug, Serialize, Clone)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct RankInfo {
    /// Rank badge (tier * 10 + subrank) the entry stops at: it covers the ranks below it. In Beta
    /// Season 2, 91 (Phantom I) gives every rank below Phantom shields and Phantom and up none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rank_end: Option<u32>,
    /// Rank points needed per subrank step, the last one being the step to the next badge
    /// (Beta Season 2: 1000 between subranks, 1500 from the final subrank).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub sub_rank_xp: Vec<u32>,
    /// Losses a player at a badge's first subrank with 0 rank points can take before dropping
    /// a badge (rank loss protection shields).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub badge_shields: Option<i32>,
    /// Losses a player can take before dropping a subrank (rank loss protection shields).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_rank_shields: Option<i32>,
}

#[derive(Debug, Serialize, Clone)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct RankedSeason {
    pub class_name: String,
    pub name: String,
    pub ranked_type: String,
    pub min_wins: u32,
    /// Wins a hero needs to count towards `min_hero_unlocks`. Absent where the season
    /// counts hero points instead, see `min_hero_unlock_points`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_hero_wins: Option<u32>,
    /// Points a hero needs to count towards `min_hero_unlocks`: 2 per win, 1 per loss
    /// (build 6857+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_hero_unlock_points: Option<u32>,
    pub min_hero_unlocks: u32,
    pub calibration_matches: u32,
    /// Highest rank badge (tier * 10 + subrank) placements put a player at (build 6857+).
    /// Valve's notes for Beta Season 2 (101, Ascendant I) allow up to Ascendant III for
    /// strong previous-season performance.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calibration_max_rank: Option<u32>,
    /// Base rank points granted per win / taken per loss (build 6701+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_win_loss_point_grant: Option<u32>,
    pub valid_party_sizes: Vec<u32>,
    pub intervals: Vec<SeasonInterval>,
    /// Rank progression settings (build 6857+).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub rank_info: Vec<RankInfo>,
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
        min_hero_unlock_points: r.min_hero_unlock_points,
        min_hero_unlocks: r.min_hero_unlocks,
        calibration_matches: r.calibration_matches,
        calibration_max_rank: r.calibration_max_rank,
        base_win_loss_point_grant: r.base_win_loss_point_grant,
        valid_party_sizes: r.valid_party_sizes,
        intervals: r
            .intervals
            .into_iter()
            .map(|i| SeasonInterval {
                interval: i.interval,
                start_timestamp: i.start_timestamp,
                end_timestamp: i.end_timestamp,
                leaderboard_id: i.leaderboard_id,
            })
            .collect(),
        rank_info: r
            .rank_info
            .into_iter()
            .map(|i| RankInfo {
                rank_end: i.rank_end,
                sub_rank_xp: i.sub_rank_xp,
                badge_shields: i.badge_shields,
                sub_rank_shields: i.sub_rank_shields,
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
///
/// Consecutive intervals share their boundary timestamp (interval 1 ends
/// exactly when interval 2 starts), so the later-starting one wins there.
#[must_use]
pub fn interval_at(seasons: &[RankedSeason], now: i64) -> Option<u32> {
    seasons
        .iter()
        .flat_map(|s| &s.intervals)
        .filter(|i| (i.start_timestamp..=i.end_timestamp).contains(&now))
        .max_by_key(|i| i.start_timestamp)
        .map(|i| i.interval)
}

/// The season running at `now` (unix seconds) with the `(start, end)` span of
/// all its intervals. At a shared boundary the later-starting season wins, as
/// in [`interval_at`].
#[must_use]
pub fn season_at(seasons: &[RankedSeason], now: i64) -> Option<(&RankedSeason, i64, i64)> {
    seasons
        .iter()
        .filter_map(|s| {
            let start = s.intervals.iter().map(|i| i.start_timestamp).min()?;
            let end = s.intervals.iter().map(|i| i.end_timestamp).max()?;
            (start..=end).contains(&now).then_some((s, start, end))
        })
        .max_by_key(|(_, start, _)| *start)
}

// ----- Cached fetch -----

#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)"
)]
pub async fn fetch_ranked_seasons(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<RankedSeason>>, AssetsError> {
    let (vdata, loc) = localization::fetch_with_localization(
        r2,
        version,
        "scripts/ranked_seasons.vdata",
        language,
    )
    .await?;
    Ok(Arc::new(build_ranked_seasons(&vdata, &loc)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use keyvalues::localization as kv1;

    fn fixtures() -> (String, HashMap<String, String>) {
        let manifest = env!("CARGO_MANIFEST_DIR");
        let vdata = std::fs::read_to_string(format!(
            "{manifest}/../keyvalues/src/kv3_fixtures/ranked_seasons.vdata"
        ))
        .expect("vdata fixture");
        let loc_src = std::fs::read_to_string(format!(
            "{manifest}/../keyvalues/src/localization_fixtures/ranked_seasons_english.txt"
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

    /// Build 6712 ("City Never Sleeps") added interval 2 and leaderboard IDs.
    #[test]
    fn snapshot_6712_second_interval() {
        let (_, loc) = fixtures();
        let manifest = env!("CARGO_MANIFEST_DIR");
        let vdata = std::fs::read_to_string(format!(
            "{manifest}/../keyvalues/src/kv3_fixtures/ranked_seasons_6712.vdata"
        ))
        .expect("vdata fixture");
        let out = build_ranked_seasons(&vdata, &loc).expect("builds");
        let season = &out[0];
        assert_eq!(season.base_win_loss_point_grant, Some(300));
        let ids: Vec<_> = season
            .intervals
            .iter()
            .map(|i| (i.interval, i.leaderboard_id))
            .collect();
        assert_eq!(ids, [(1, Some(1001)), (2, Some(1002))]);
        // 2026-10-08 → 2028-01-01
        assert_eq!(season.intervals[1].start_timestamp, 1_791_493_200);
        assert_eq!(season.intervals[1].end_timestamp, 1_830_326_400);
        assert_eq!(interval_at(&out, 1_791_493_199), Some(1));
        assert_eq!(interval_at(&out, 1_791_493_200), Some(2));
        assert_eq!(interval_at(&out, 1_800_000_000), Some(2));
        // The season spans both intervals.
        let (current, start, end) = season_at(&out, 1_800_000_000).expect("season running");
        assert_eq!(
            (current.class_name.as_str(), start, end),
            ("season_1", 1_785_430_800, 1_830_326_400)
        );
        assert!(season_at(&out, 1_785_430_799).is_none());
        insta::with_settings!(
            { snapshot_path => "ranked_seasons_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("ranked_seasons_6712", out); }
        );
    }

    /// Build 6857 moved interval 2 into `season_2`, which counts hero points instead of
    /// hero wins and carries the new calibration cap and rank info.
    #[test]
    fn snapshot_6857_second_season() {
        let (_, loc) = fixtures();
        let manifest = env!("CARGO_MANIFEST_DIR");
        let vdata = std::fs::read_to_string(format!(
            "{manifest}/../keyvalues/src/kv3_fixtures/ranked_seasons_6857.vdata"
        ))
        .expect("vdata fixture");
        let out = build_ranked_seasons(&vdata, &loc).expect("builds");
        let names: Vec<_> = out.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["Beta Season 1", "Beta Season 2"]);
        let season_2 = &out[1];
        assert_eq!(season_2.min_hero_wins, None);
        assert_eq!(season_2.min_hero_unlock_points, Some(35));
        assert_eq!(season_2.calibration_max_rank, Some(101));
        // 2026-11-05 20:00 UTC: interval 1 (season 1) hands over to interval 2 (season 2).
        assert_eq!(interval_at(&out, 1_793_908_799), Some(1));
        assert_eq!(interval_at(&out, 1_793_908_800), Some(2));
        let (current, start, end) = season_at(&out, 1_793_908_800).expect("season running");
        assert_eq!(
            (current.class_name.as_str(), start, end),
            ("season_2", 1_793_908_800, 1_804_802_400)
        );
        insta::with_settings!(
            { snapshot_path => "ranked_seasons_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("ranked_seasons_6857", out); }
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
