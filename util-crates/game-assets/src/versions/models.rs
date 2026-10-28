//! Published 3D model GLBs, from the bucket's models index.
//!
//! The asset pipeline exports each game model as one `<pose>.glb` per pose to
//! `models/<model path>/` (see `scripts/export_hero_models.py` and
//! `scripts/export_npc_models.py`).

use std::collections::HashMap;

use indexmap::IndexMap;
use object_store::aws::AmazonS3;

use crate::index::{IndexFolder, fetch_index};

pub(crate) const MODELS_BASE_URL: &str =
    "https://assets-bucket.deadlock-api.com/assets-api-res/models";

/// Model path -> `{pose: url}`.
pub(crate) type ModelsByPath = HashMap<String, IndexMap<String, String>>;

/// `heroes_wip/abrams/abrams` from `resource_name:"models/heroes_wip/abrams/abrams.vmdl"`,
/// the folder the pipeline uploads the model's `<pose>.glb` files to.
pub(crate) fn model_path(resource: &str) -> Option<&str> {
    let path = resource.strip_prefix("resource_name:").unwrap_or(resource);
    path.trim_matches('"')
        .strip_prefix("models/")?
        .strip_suffix(".vmdl")
}

/// The published pose GLBs of the model `resource` (a `.vmdl` resource name);
/// empty when it has none.
pub(crate) fn models_of(models: &ModelsByPath, resource: Option<&str>) -> IndexMap<String, String> {
    resource
        .and_then(model_path)
        .and_then(|p| models.get(p))
        .cloned()
        .unwrap_or_default()
}

/// Group the model GLB URLs of the models index by model path:
/// `heroes_wip/abrams/abrams` -> `{"hero_select": ".../hero_select.glb"}`.
fn parse_models_index(index: serde_json::Value) -> ModelsByPath {
    fn collect(v: serde_json::Value, out: &mut ModelsByPath) {
        match v {
            serde_json::Value::String(url) => {
                let Some(rel) = url
                    .strip_prefix(MODELS_BASE_URL)
                    .and_then(|r| r.strip_prefix('/'))
                else {
                    return;
                };
                let Some((path, pose)) = rel
                    .strip_suffix(".glb")
                    .and_then(|r| r.rsplit_once('/'))
                    .map(|(p, s)| (p.to_owned(), s.to_owned()))
                else {
                    return;
                };
                out.entry(path).or_default().insert(pose, url);
            }
            serde_json::Value::Object(m) => m.into_iter().for_each(|(_, v)| collect(v, out)),
            _ => {}
        }
    }
    let mut out = HashMap::new();
    collect(index, &mut out);
    for poses in out.values_mut() {
        poses.sort_unstable_keys();
    }
    out
}

/// Published model GLBs by model path, from the models index. Best effort:
/// empty (no `models` on any entity) if the index can't be loaded.
pub(crate) async fn fetch_models(r2: &AmazonS3) -> ModelsByPath {
    let parsed = fetch_index(r2, IndexFolder::Models)
        .await
        .map_err(|e| e.to_string())
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string()));
    match parsed {
        Ok(index) => parse_models_index(index),
        Err(e) => {
            tracing::warn!("Models unavailable, failed to load models index: {e}");
            HashMap::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_path_from_resource_name() {
        assert_eq!(
            model_path(r#"resource_name:"models/heroes_wip/abrams/abrams.vmdl""#),
            Some("heroes_wip/abrams/abrams")
        );
        assert_eq!(
            model_path("models/heroes_staging/nano/nano_v2/nano.vmdl"),
            Some("heroes_staging/nano/nano_v2/nano")
        );
        assert_eq!(model_path(r#"resource_name:"particles/x.vpcf""#), None);
    }

    #[test]
    fn models_index_groups_poses_by_model_path() {
        let url = |p: &str| format!("{MODELS_BASE_URL}/{p}");
        let index = serde_json::json!({
            "heroes_wip": {
                "abrams": { "abrams": {
                    "hero_select.glb": url("heroes_wip/abrams/abrams/hero_select.glb"),
                    "a_pose.glb": url("heroes_wip/abrams/abrams/a_pose.glb"),
                }},
            },
            "stray.txt": url("stray.txt"),
        });
        let models = parse_models_index(index);
        assert_eq!(models.len(), 1);
        let abrams = &models["heroes_wip/abrams/abrams"];
        assert_eq!(abrams.keys().collect::<Vec<_>>(), ["a_pose", "hero_select"]);
        assert_eq!(
            abrams["hero_select"],
            url("heroes_wip/abrams/abrams/hero_select.glb")
        );
        assert_eq!(
            models_of(
                &models,
                Some(r#"resource_name:"models/heroes_wip/abrams/abrams.vmdl""#)
            ),
            *abrams
        );
        assert!(models_of(&models, Some("models/npc/midboss/midboss.vmdl")).is_empty());
        assert!(models_of(&models, None).is_empty());
    }
}
