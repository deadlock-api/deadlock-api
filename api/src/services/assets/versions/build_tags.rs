//! `/v1/assets/build-tags` data layer.

use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;
use serde::Serialize;
use utoipa::ToSchema;

use crate::services::assets::versions::common::entity_id;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;

const SVGS_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";
const KEY_PREFIX: &str = "citadel_build_tag_";
const KEY_EXCLUDE: &str = "citadel_build_tag_label";

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct BuildTag {
    pub class_name: String,
    pub label: String,
    pub id: u32,
    pub icon: String,
}

/// Sorts by `class_name` for deterministic output — the localization map has
/// no guaranteed key order.
pub(crate) fn build_build_tags(loc: &HashMap<String, String>) -> Vec<BuildTag> {
    let mut out: Vec<BuildTag> = loc
        .iter()
        .filter(|(k, _)| k.starts_with(KEY_PREFIX) && k.as_str() != KEY_EXCLUDE)
        .map(|(k, v)| BuildTag {
            class_name: k.clone(),
            label: v.clone(),
            id: entity_id(k),
            icon: format!("{SVGS_BASE_URL}/{k}.svg"),
        })
        .collect();
    out.sort_by(|a, b| a.class_name.cmp(&b.class_name));
    out
}

const CACHE_SIZE: usize = 64;
const CACHE_TTL: Duration = Duration::from_hours(24);

#[cached(
    ty = "LruTtlCache<(u32, String), Arc<Vec<BuildTag>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_build_tags(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<BuildTag>>, AssetsError> {
    let loc = localization::fetch_localization(r2, version, language).await?;
    Ok(Arc::new(build_build_tags(&loc)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_ENGLISH: &str = include_str!("build_tags_fixtures/english.json");

    fn loc_from_fixture(src: &str) -> HashMap<String, String> {
        serde_json::from_str(src).expect("fixture parses")
    }

    #[test]
    fn snapshot_english() {
        let tags = build_build_tags(&loc_from_fixture(FIXTURE_ENGLISH));
        insta::with_settings!(
            { snapshot_path => "build_tags_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("build_tags_english", tags); }
        );
    }

    #[test]
    fn excludes_label_key_and_unrelated_keys() {
        let tags = build_build_tags(&loc_from_fixture(FIXTURE_ENGLISH));
        assert!(!tags.is_empty());
        assert!(tags.iter().all(|t| t.class_name.starts_with(KEY_PREFIX)));
        assert!(tags.iter().all(|t| t.class_name != KEY_EXCLUDE));
    }

    #[test]
    fn id_is_murmur2_of_class_name() {
        let tags = build_build_tags(&loc_from_fixture(FIXTURE_ENGLISH));
        let weapon = tags
            .iter()
            .find(|t| t.class_name == "citadel_build_tag_weapon")
            .expect("weapon tag");
        assert_eq!(weapon.id, 47_026_193);
        assert_eq!(weapon.label, "Weapon");
        assert_eq!(
            weapon.icon,
            "https://assets-bucket.deadlock-api.com/assets-api-res/icons/citadel_build_tag_weapon.svg"
        );
    }

    #[test]
    fn output_is_sorted_by_class_name() {
        let tags = build_build_tags(&loc_from_fixture(FIXTURE_ENGLISH));
        for win in tags.windows(2) {
            assert!(win[0].class_name <= win[1].class_name);
        }
    }
}
