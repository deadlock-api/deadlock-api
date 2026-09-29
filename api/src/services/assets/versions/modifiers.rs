//! `/v1/assets/modifiers` data layer — fetch + parse + transform.
//!
//! `scripts/modifiers.vdata` holds modifier definitions and, since build 6711
//! ("City Never Sleeps"), the neutral ("Haunt") abilities referenced by
//! `m_vNeutralAbilities` / `m_sNeutralMelee` on NPC units. Only a compact view
//! is exposed: identity, class and every numeric property (nested ones under a
//! dotted path). The file is only uploaded for builds 6712+, so older versions
//! 404.

use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::Serialize;
use serde_json::{Map, Value};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{build_from_kv3, entity_id};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

// ===================================================== Public shape

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct Modifier {
    pub class_name: String,
    pub id: u32,
    /// Engine class (`_class`), e.g. `citadel_neutral_laser_beam`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class: Option<String>,
    /// Entry this one inherits from (`_base`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    /// Editor folder (`_editor.folder_name`), e.g. `Neutral Ability`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    /// Numeric properties keyed by their source name. Nested properties use a
    /// dotted path (`m_GroundAuraModifier.m_modifierProvidedByAura.m_flDPS`,
    /// `subclass:` wrappers are skipped); `m_vecScriptValues` entries are keyed
    /// by their `m_eModifierValue` (`MODIFIER_VALUE_GRAVITY_SCALE`).
    #[schema(value_type = std::collections::HashMap<String, f64>)]
    pub properties: IndexMap<String, f64>,
}

// ===================================================== Build

pub(crate) fn build_modifiers(vdata: &str) -> Result<Vec<Modifier>, AssetsError> {
    // `generic_data_type` (scalar) and `_include` (array) are filtered out.
    build_from_kv3(
        vdata,
        "modifier",
        |name, value| !name.starts_with('_') && value.is_object(),
        transform,
    )
}

fn transform(class_name: String, mut r: Map<String, Value>) -> Modifier {
    let mut str_field = |k: &str| match r.remove(k) {
        Some(Value::String(s)) if !s.is_empty() => Some(s),
        _ => None,
    };
    let class = str_field("_class");
    let base = str_field("_base");
    let folder = r
        .get("_editor")
        .and_then(|e| e.get("folder_name"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let mut properties = IndexMap::new();
    collect_numeric("", &r, &mut properties);
    Modifier {
        id: entity_id(&class_name),
        class,
        base,
        folder,
        properties,
        class_name,
    }
}

fn join(prefix: &str, key: &str) -> String {
    if prefix.is_empty() {
        key.to_owned()
    } else {
        format!("{prefix}.{key}")
    }
}

/// Recursively collect numeric leaves of `obj` into `out` under dotted paths.
/// Editor/meta keys (`_*`) are skipped and `subclass:` wrappers are transparent.
fn collect_numeric(prefix: &str, obj: &Map<String, Value>, out: &mut IndexMap<String, f64>) {
    for (key, value) in obj {
        if key.starts_with('_') {
            continue;
        }
        match value {
            Value::Number(n) => {
                if let Some(f) = n.as_f64() {
                    out.insert(join(prefix, key), f);
                }
            }
            Value::Object(inner) if key == "subclass" => collect_numeric(prefix, inner, out),
            Value::Object(inner) => collect_numeric(&join(prefix, key), inner, out),
            Value::Array(items) if key == "m_vecScriptValues" => {
                for item in items {
                    let name = item.get("m_eModifierValue").and_then(Value::as_str);
                    let val = item.get("m_value").and_then(Value::as_f64);
                    if let (Some(name), Some(val)) = (name, val) {
                        out.insert(join(prefix, name), val);
                    }
                }
            }
            _ => {}
        }
    }
}

// ===================================================== Cached fetch

#[cached(max_size = 64, ttl_secs = 86400, convert = "{ version }", key = "u32")]
pub(crate) async fn fetch_modifiers(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<Vec<Modifier>>, AssetsError> {
    let vdata = store::fetch_text(r2, version, "scripts/modifiers.vdata").await?;
    Ok(Arc::new(build_modifiers(&vdata)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!(
            "{manifest}/src/services/assets/versions/modifiers_fixtures/modifiers.vdata"
        ))
        .expect("vdata fixture")
    }

    #[test]
    fn snapshot_modifiers() {
        let modifiers = build_modifiers(&fixture()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "modifiers_snapshots", prepend_module_to_snapshot => false, sort_maps => true },
            { insta::assert_json_snapshot!("modifiers", modifiers); }
        );
    }

    #[test]
    fn flattens_nested_and_script_values() {
        let modifiers = build_modifiers(&fixture()).expect("builds");
        assert!(modifiers.iter().all(|m| !m.class_name.starts_with('_')));
        let sludge = modifiers
            .iter()
            .find(|m| m.class_name == "citadel_neutral_attack_sludge_strong")
            .expect("sludge");
        assert_eq!(
            sludge.class.as_deref(),
            Some("citadel_neutral_attack_sludge")
        );
        assert_eq!(
            sludge.base.as_deref(),
            Some("citadel_neutral_attack_sludge")
        );
        assert_eq!(sludge.folder.as_deref(), Some("Neutral Ability"));
        assert_eq!(sludge.properties.get("m_flDamage"), Some(&10.0));
        assert_eq!(
            sludge
                .properties
                .get("m_GroundPointModifier.m_modifierProvidedByAura.m_flDPS"),
            Some(&30.0)
        );
        assert_eq!(
            sludge.properties.get(
                "m_GroundPointModifier.m_modifierProvidedByAura.MODIFIER_VALUE_MOVEMENT_SPEED_SLOW_PERCENT"
            ),
            Some(&40.0)
        );
        let steam = modifiers
            .iter()
            .find(|m| m.class_name == "modifier_obscured_by_steam")
            .expect("steam");
        assert_eq!(
            steam.properties.get("MODIFIER_VALUE_GRAVITY_SCALE"),
            Some(&1.15)
        );
    }
}
