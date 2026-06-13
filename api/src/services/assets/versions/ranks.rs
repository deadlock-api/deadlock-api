//! `/v1/assets/ranks` data layer — build per-version rank metadata.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::{ComplexObject, SimpleObject};
use cached::macros::cached;
use object_store::aws::AmazonS3;
use serde::Serialize;
use utoipa::ToSchema;

use crate::services::assets::versions::common::IMAGE_BASE_URL;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;

const NUM_TIERS: u32 = 12;

const RANK_COLORS: [&str; NUM_TIERS as usize] = [
    "#333333", "#6A3E1E", "#882355", "#5C6DAB", "#719C47", "#DDA326", "#EE4F57", "#B47FEB",
    "#955138", "#7C7C7C", "#C39751", "#5CE9A9",
];

/// Image URLs for a single rank tier. Field declaration order is load-bearing:
/// it sets the JSON key order, which is stable across versions of this API.
#[derive(Debug, Serialize, Clone, Default, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
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
        let prefix = format!("{IMAGE_BASE_URL}/ranks/rank{tier}");
        let url = |name: &str, ext: &str| Some(format!("{prefix}/{name}.{ext}"));

        // Tier 0 has no subranks — only a plain large + small badge.
        if tier == 0 {
            return Self {
                large: url("badge_lg", "png"),
                large_webp: url("badge_lg", "webp"),
                small: url("badge_sm", "png"),
                small_webp: url("badge_sm", "webp"),
                ..Self::default()
            };
        }

        let sub = |size: &str, ext: &str, n: u32| url(&format!("badge_{size}_subrank{n}"), ext);
        Self {
            large: url("badge_lg", "png"),
            large_webp: url("badge_lg", "webp"),
            large_subrank1: sub("lg", "png", 1),
            large_subrank1_webp: sub("lg", "webp", 1),
            large_subrank2: sub("lg", "png", 2),
            large_subrank2_webp: sub("lg", "webp", 2),
            large_subrank3: sub("lg", "png", 3),
            large_subrank3_webp: sub("lg", "webp", 3),
            large_subrank4: sub("lg", "png", 4),
            large_subrank4_webp: sub("lg", "webp", 4),
            large_subrank5: sub("lg", "png", 5),
            large_subrank5_webp: sub("lg", "webp", 5),
            large_subrank6: sub("lg", "png", 6),
            large_subrank6_webp: sub("lg", "webp", 6),
            small_subrank1: sub("sm", "png", 1),
            small_subrank1_webp: sub("sm", "webp", 1),
            small_subrank2: sub("sm", "png", 2),
            small_subrank2_webp: sub("sm", "webp", 2),
            small_subrank3: sub("sm", "png", 3),
            small_subrank3_webp: sub("sm", "webp", 3),
            small_subrank4: sub("sm", "png", 4),
            small_subrank4_webp: sub("sm", "webp", 4),
            small_subrank5: sub("sm", "png", 5),
            small_subrank5_webp: sub("sm", "webp", 5),
            small_subrank6: sub("sm", "png", 6),
            small_subrank6_webp: sub("sm", "webp", 6),
            small: None,
            small_webp: None,
        }
    }
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
pub(crate) struct Rank {
    pub tier: u32,
    pub name: String,
    pub images: RankImages,
    #[graphql(skip)]
    pub color: &'static str,
}

#[ComplexObject(rename_fields = "snake_case")]
impl Rank {
    async fn color(&self) -> &'static str {
        self.color
    }
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
    max_size = 64,
    ttl = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)",
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
