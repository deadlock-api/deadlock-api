//! `/v1/assets/ranks` data layer — build per-version rank metadata.

use std::collections::HashMap;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;
use serde::Serialize;
use utoipa::ToSchema;

use crate::services::assets::versions::common::{DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;

const IMAGE_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/images";
const NUM_TIERS: u32 = 12;
const NUM_SUBRANKS: u32 = 6;

const RANK_COLORS: [&str; NUM_TIERS as usize] = [
    "#333333", "#6A3E1E", "#882355", "#5C6DAB", "#719C47", "#DDA326", "#EE4F57", "#B47FEB",
    "#955138", "#7C7C7C", "#C39751", "#5CE9A9",
];

/// Image URLs for a single rank tier. Field declaration order is load-bearing:
/// it sets the JSON key order, which is stable across versions of this API.
#[derive(Debug, Serialize, Clone, Default, ToSchema)]
pub(crate) struct RankImages {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank1_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank2_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank3: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank3_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank4: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank4_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank5: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank5_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank6: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub large_subrank6_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank1_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank2_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank3: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank3_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank4: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank4_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank5: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank5_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank6: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub small_subrank6_webp: Option<String>,
}

impl RankImages {
    fn from_tier(tier: u32) -> Self {
        let f = format!("{IMAGE_BASE_URL}/ranks/rank{tier}");
        let png = |p: String| format!("{f}/{p}.png");
        let webp = |p: String| format!("{f}/{p}.webp");
        let mut img = Self {
            large: Some(png("badge_lg".into())),
            large_webp: Some(webp("badge_lg".into())),
            ..Self::default()
        };
        if tier == 0 {
            img.small = Some(png("badge_sm".into()));
            img.small_webp = Some(webp("badge_sm".into()));
            return img;
        }
        let lg_slots: [(&mut Option<String>, &mut Option<String>); NUM_SUBRANKS as usize] = [
            (&mut img.large_subrank1, &mut img.large_subrank1_webp),
            (&mut img.large_subrank2, &mut img.large_subrank2_webp),
            (&mut img.large_subrank3, &mut img.large_subrank3_webp),
            (&mut img.large_subrank4, &mut img.large_subrank4_webp),
            (&mut img.large_subrank5, &mut img.large_subrank5_webp),
            (&mut img.large_subrank6, &mut img.large_subrank6_webp),
        ];
        for (i, (p, w)) in lg_slots.into_iter().enumerate() {
            let n = i + 1;
            *p = Some(png(format!("badge_lg_subrank{n}")));
            *w = Some(webp(format!("badge_lg_subrank{n}")));
        }
        let sm_slots: [(&mut Option<String>, &mut Option<String>); NUM_SUBRANKS as usize] = [
            (&mut img.small_subrank1, &mut img.small_subrank1_webp),
            (&mut img.small_subrank2, &mut img.small_subrank2_webp),
            (&mut img.small_subrank3, &mut img.small_subrank3_webp),
            (&mut img.small_subrank4, &mut img.small_subrank4_webp),
            (&mut img.small_subrank5, &mut img.small_subrank5_webp),
            (&mut img.small_subrank6, &mut img.small_subrank6_webp),
        ];
        for (i, (p, w)) in sm_slots.into_iter().enumerate() {
            let n = i + 1;
            *p = Some(png(format!("badge_sm_subrank{n}")));
            *w = Some(webp(format!("badge_sm_subrank{n}")));
        }
        img
    }
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct Rank {
    pub tier: u32,
    pub name: String,
    pub images: RankImages,
    pub color: &'static str,
}

pub(crate) fn build_ranks(loc: &HashMap<String, String>) -> Vec<Rank> {
    (0..NUM_TIERS)
        .map(|tier| Rank {
            tier,
            name: loc
                .get(&format!("Citadel_ranks_rank{tier}"))
                .map(|s| s.trim().to_owned())
                .unwrap_or_default(),
            images: RankImages::from_tier(tier),
            color: RANK_COLORS[tier as usize],
        })
        .collect()
}

#[cached(
    ty = "LruTtlCache<(u32, String), Arc<Vec<Rank>>>",
    create = "{ LruTtlCache::builder().size(DEFAULT_CACHE_SIZE).ttl(DEFAULT_CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_ranks(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<Rank>>, AssetsError> {
    let loc = localization::fetch_localization(r2, version, language).await?;
    Ok(Arc::new(build_ranks(&loc)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::localization as kv1;

    fn loc_from_fixture(file: &str) -> HashMap<String, String> {
        let manifest = env!("CARGO_MANIFEST_DIR");
        let src =
            std::fs::read_to_string(format!("{manifest}/src/utils/localization_fixtures/{file}"))
                .expect("loc fixture");
        kv1::parse(&src)
            .expect("loc parses")
            .tokens
            .into_iter()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect()
    }

    #[test]
    fn snapshot_ranks_english() {
        let ranks = build_ranks(&loc_from_fixture("citadel_main_english.txt"));
        insta::with_settings!(
            { snapshot_path => "ranks_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("ranks_english", ranks); }
        );
    }

    #[test]
    fn snapshot_ranks_russian() {
        let ranks = build_ranks(&loc_from_fixture("citadel_main_russian.txt"));
        insta::with_settings!(
            { snapshot_path => "ranks_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("ranks_russian", ranks); }
        );
    }

    #[test]
    fn tier_zero_omits_subranks() {
        let ranks = build_ranks(&loc_from_fixture("citadel_main_english.txt"));
        let r0 = &ranks[0];
        assert!(r0.images.large.is_some() && r0.images.small.is_some());
        assert!(r0.images.large_subrank1.is_none() && r0.images.small_subrank6.is_none());
    }

    #[test]
    fn non_zero_tier_has_subranks_and_no_plain_small() {
        let ranks = build_ranks(&loc_from_fixture("citadel_main_english.txt"));
        let r3 = &ranks[3];
        assert!(r3.images.large.is_some() && r3.images.small.is_none());
        assert!(r3.images.large_subrank1.is_some() && r3.images.small_subrank6.is_some());
    }
}
