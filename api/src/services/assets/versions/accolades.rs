//! `/v1/assets/accolades` data layer — fetch + parse + transform.

use core::time::Duration;
use std::collections::HashMap;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;
use crate::services::assets::versions::store;
use crate::utils::kv3;

// ----- Raw KV3 shape -----

#[derive(Debug, Deserialize)]
struct RawAccolade {
    #[serde(rename = "m_unAccoladeID")]
    id: u32,
    #[serde(rename = "m_sTrackedStatName")]
    tracked_stat_name: String,
    #[serde(rename = "m_sFlavorName")]
    flavor_name: String,
    #[serde(rename = "m_sDescription")]
    description: String,
    #[serde(rename = "m_eThresholdType")]
    threshold_type: String,
    #[serde(default, rename = "m_vecEnabledGameModes")]
    enabled_game_modes: Option<Vec<String>>,
}

// ----- Public shape -----

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct Accolade {
    pub class_name: String,
    pub id: u32,
    pub tracked_stat_name: String,
    pub flavor_name: String,
    pub description: String,
    pub threshold_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_game_modes: Option<Vec<String>>,
}

pub(crate) fn build_accolades(
    vdata: &str,
    loc: &HashMap<String, String>,
) -> Result<Vec<Accolade>, AssetsError> {
    let root: indexmap::IndexMap<String, serde_json::Value> = kv3::from_str(vdata)?;
    let mut out = Vec::with_capacity(root.len());
    for (class_name, value) in root {
        if class_name == "generic_data_type" || class_name.starts_with('_') {
            continue;
        }
        let raw: RawAccolade = match serde_json::from_value(value) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Skipping accolade {class_name}: {e}");
                continue;
            }
        };
        out.push(transform(class_name, raw, loc));
    }
    Ok(out)
}

fn transform(class_name: String, r: RawAccolade, loc: &HashMap<String, String>) -> Accolade {
    let localize = |t: &str| {
        let key = t.trim_start_matches('#');
        loc.get(key).cloned().unwrap_or_else(|| t.to_owned())
    };
    Accolade {
        class_name,
        id: r.id,
        tracked_stat_name: r.tracked_stat_name,
        flavor_name: localize(&r.flavor_name),
        description: localize(&r.description),
        threshold_type: r.threshold_type.to_lowercase(),
        enabled_game_modes: r
            .enabled_game_modes
            .map(|v| v.into_iter().map(|m| map_game_mode(&m)).collect()),
    }
}

fn map_game_mode(raw: &str) -> String {
    match raw {
        "k_ECitadelGameMode_Normal" => "normal".to_owned(),
        other => other.to_owned(),
    }
}

// ----- Cached fetch -----

const CACHE_SIZE: usize = 64;
const CACHE_TTL: Duration = Duration::from_hours(24);

#[cached(
    ty = "LruTtlCache<(u32, String), Arc<Vec<Accolade>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_accolades(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<Accolade>>, AssetsError> {
    let (vdata, loc) = tokio::try_join!(
        async {
            store::fetch_text(r2, version, "scripts/accolades.vdata")
                .await
                .map_err(AssetsError::from)
        },
        localization::fetch_localization(r2, version, language),
    )?;
    let accolades = build_accolades(&vdata, &loc)?;
    Ok(Arc::new(accolades))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::utils::localization as kv1;

    fn fixtures() -> (String, HashMap<String, String>) {
        let manifest = env!("CARGO_MANIFEST_DIR");
        let vdata =
            std::fs::read_to_string(format!("{manifest}/src/utils/kv3_fixtures/accolades.vdata"))
                .expect("vdata fixture");
        let loc_src = std::fs::read_to_string(format!(
            "{manifest}/src/utils/localization_fixtures/accolades_english.txt"
        ))
        .expect("loc fixture");
        let parsed = kv1::parse(&loc_src).expect("loc parses");
        let loc: HashMap<String, String> = parsed
            .tokens
            .into_iter()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        (vdata, loc)
    }

    #[test]
    fn snapshot_english() {
        let (vdata, loc) = fixtures();
        let out = build_accolades(&vdata, &loc).expect("builds");
        insta::with_settings!(
            { snapshot_path => "accolades_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("accolades_english", out); }
        );
    }

    #[test]
    fn snapshot_missing_localization_falls_back_to_raw_token() {
        let (vdata, _) = fixtures();
        let empty: HashMap<String, String> = HashMap::new();
        let out = build_accolades(&vdata, &empty).expect("builds");
        insta::with_settings!(
            { snapshot_path => "accolades_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("accolades_no_loc", out); }
        );
    }
}
