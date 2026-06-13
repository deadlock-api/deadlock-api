use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::services::assets::versions::common::build_map_from_kv3;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

#[derive(Debug, Deserialize)]
struct RawLootTable {
    #[serde(default, rename = "m_vecEntries")]
    entries: Vec<RawLootEntry>,
}

#[derive(Debug, Deserialize)]
struct RawLootEntry {
    #[serde(rename = "m_strItem")]
    item: String,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct LootEntry {
    pub item: String,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct LootTable {
    pub entries: Vec<LootEntry>,
}

pub(crate) type LootTables = IndexMap<String, LootTable>;

pub(crate) fn build_loot_tables(vdata: &str) -> Result<LootTables, AssetsError> {
    build_map_from_kv3(
        vdata,
        "loot table",
        |name, value| name != "all_items" && !name.starts_with("generic_") && value.is_object(),
        |_, raw: RawLootTable| LootTable {
            entries: raw
                .entries
                .into_iter()
                .map(|e| LootEntry { item: e.item })
                .collect(),
        },
    )
}

#[cached(
    max_size = 64,
    ttl = 86400,
    convert = r#"{ version }"#,
    key = "u32",
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_loot_tables(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<LootTables>, AssetsError> {
    let vdata = store::fetch_text(r2, version, "scripts/loot_tables.vdata").await?;
    Ok(Arc::new(build_loot_tables(&vdata)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!(
            "{manifest}/src/utils/kv3_fixtures/loot_tables.vdata"
        ))
        .expect("vdata fixture")
    }

    #[test]
    fn snapshot_loot_tables() {
        let out = build_loot_tables(&fixture()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "loot_tables_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("loot_tables", out); }
        );
    }

    #[test]
    fn skips_generic_and_all_items() {
        let out = build_loot_tables(&fixture()).expect("builds");
        assert!(!out.contains_key("all_items"));
        assert!(out.keys().all(|k| !k.starts_with("generic_")));
        assert!(!out.is_empty());
    }
}
