//! `/v1/assets/convars` data layer — fetch + parse.
//!
//! Convar defaults aren't in any game data file; they're compiled into
//! `client.dll` / `server.dll`. The assets pipeline extracts them with
//! `scripts/extract_convars.py` into the per-version `convars.json`, which is
//! served as is. Builds published before the extractor existed have no file and
//! 404.

use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

const CONVARS_PATH: &str = "convars.json";

/// Value type of a convar (`EConVarType`).
#[derive(Debug, Serialize, Deserialize, Clone, Copy, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ConvarType {
    Bool,
    Int16,
    Uint16,
    Int32,
    Uint32,
    Int64,
    Uint64,
    Float32,
    Float64,
    String,
    Color,
    Vector2,
    Vector3,
    Vector4,
    Qangle,
}

#[derive(Debug, Serialize, Deserialize, Clone, ToSchema)]
pub(crate) struct Convar {
    #[serde(rename = "type")]
    pub value_type: ConvarType,
    /// Default value, typed by `type`: a bool, number or string, `[r, g, b, a]`
    /// for `color`, and an array of floats for vectors / `qangle`.
    #[schema(value_type = Object)]
    pub default: serde_json::Value,
    /// Raw `FCVAR_*` flag bits.
    pub flags: u64,
    /// Help text shown by the in-game console.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

pub(crate) fn build_convars(json: &str) -> Result<IndexMap<String, Convar>, AssetsError> {
    Ok(serde_json::from_str(json)?)
}

#[cached(max_size = 64, ttl_secs = 86400, convert = "{ version }", key = "u32")]
pub(crate) async fn fetch_convars(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<IndexMap<String, Convar>>, AssetsError> {
    let json = store::fetch_text(r2, version, CONVARS_PATH).await?;
    Ok(Arc::new(build_convars(&json)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_extractor_output() {
        let convars = build_convars(
            r#"{
                "citadel_corrupted_item_shop_restock_interval": {
                    "type": "int32", "default": 900, "flags": 24576,
                    "description": "Seconds between each additional corrupted item allowance after the shop opens. 0 disables restocking."
                },
                "citadel_corrupted_penalty_variance": {"type": "float32", "default": 15.0, "flags": 24576},
                "sv_skyname": {"type": "string", "default": "sky_urb01", "flags": 0}
            }"#,
        )
        .expect("parses");
        assert_eq!(convars.len(), 3);
        let restock = &convars["citadel_corrupted_item_shop_restock_interval"];
        assert!(matches!(restock.value_type, ConvarType::Int32));
        assert_eq!(restock.default, 900);
        assert!(convars["sv_skyname"].description.is_none());
    }
}
