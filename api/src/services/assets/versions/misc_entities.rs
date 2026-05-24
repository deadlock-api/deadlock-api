//! `/v1/assets/misc-entities` data layer — fetch + parse + transform.

use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{Color, Subclass, WrapSubclass, entity_id};
use crate::services::assets::versions::common::{DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;
use crate::utils::kv3;

// ----- Raw KV3 shape -----

#[derive(Debug, Deserialize)]
struct RawModifierValue {
    #[serde(default, rename = "m_eModifierValue")]
    value_type: Option<String>,
    #[serde(default, rename = "m_value")]
    value: Option<f64>,
    #[serde(default, rename = "m_valueMin")]
    value_min: Option<f64>,
    #[serde(default, rename = "m_valueMax")]
    value_max: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawModifierDefinition {
    #[serde(default, rename = "_class")]
    class_name: Option<String>,
    #[serde(default, rename = "_my_subclass_name")]
    subclass_name: Option<String>,
    #[serde(default, rename = "m_flDuration")]
    duration: Option<f64>,
    #[serde(default, rename = "m_flTimeMin")]
    time_min: Option<f64>,
    #[serde(default, rename = "m_flTimeMax")]
    time_max: Option<f64>,
    #[serde(default, rename = "m_vecAlwaysShowInStatModifierUI")]
    always_show_in_ui: Option<Vec<String>>,
    #[serde(default, rename = "m_vecModifierValues")]
    modifier_values: Option<Vec<RawModifierValue>>,
    #[serde(default, rename = "m_vecScriptValues")]
    script_values: Option<Vec<RawModifierValue>>,
}

#[derive(Debug, Deserialize)]
struct RawPickup {
    #[serde(default, rename = "m_sPickup")]
    pickup_name: Option<String>,
    #[serde(default, rename = "m_flPickupWeight")]
    pickup_weight: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawCurve {
    #[serde(default, rename = "m_flBase")]
    base: Option<f64>,
    #[serde(default, rename = "m_flPerMinuteAfterStart")]
    per_minute_after_start: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RawCurveOrFloat {
    Curve(RawCurve),
    Float(f64),
}

/// Known values for `m_eRollType`. Unknown values pass through as
/// [`RollType::Other`] so a newly-introduced roll type doesn't 500.
#[derive(Debug, Clone, PartialEq, Eq, EnumString, Display, ToSchema)]
pub(crate) enum RollType {
    #[strum(serialize = "ECitadelRandomRoll_BreakablePowerupPickup")]
    BreakablePowerupPickup,
    #[strum(serialize = "ECitadelRandomRoll_BreakableGoldPickup")]
    BreakableGoldPickup,
    #[strum(default)]
    Other(String),
}

impl Serialize for RollType {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for RollType {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_excessive_bools)]
struct RawMiscEntity {
    #[serde(default, rename = "m_Color")]
    color: Option<Color>,
    #[serde(default, rename = "m_flInitialSpawnTime")]
    initial_spawn_time: Option<f64>,
    #[serde(default, rename = "m_flRespawnTime")]
    respawn_time: Option<f64>,
    #[serde(default, rename = "m_flSpawnInterval")]
    spawn_interval: Option<f64>,
    #[serde(default, rename = "m_iInitialSpawnDelayInSeconds")]
    initial_spawn_delay_in_seconds: Option<i64>,
    #[serde(default, rename = "m_iSpawnIntervalInSeconds")]
    spawn_interval_in_seconds: Option<i64>,
    #[serde(default, rename = "m_iMatchTimeMinsForLevel2Pickups")]
    match_time_mins_for_level2_pickups: Option<i64>,
    #[serde(default, rename = "m_iMatchTimeMinsForLevel3Pickups")]
    match_time_mins_for_level3_pickups: Option<i64>,
    #[serde(default, rename = "m_iLootListDeckSize")]
    loot_list_deck_size: Option<i64>,
    #[serde(default, rename = "m_iHealth")]
    health: Option<i64>,
    #[serde(default, rename = "m_bBreakOnDodgeTouch")]
    break_on_dodge_touch: Option<bool>,
    #[serde(default, rename = "m_bSolidAfterDeath")]
    solid_after_death: Option<bool>,
    #[serde(default, rename = "m_bRenderAfterDeath")]
    render_after_death: Option<bool>,
    #[serde(default, rename = "m_bDamagedByAbilities")]
    damaged_by_abilities: Option<bool>,
    #[serde(default, rename = "m_bDamagedByMelee")]
    damaged_by_melee: Option<bool>,
    #[serde(default, rename = "m_bDamagedByBullets")]
    damaged_by_bullets: Option<bool>,
    #[serde(default, rename = "m_bIsMantleable")]
    is_mantleable: Option<bool>,
    #[serde(default, rename = "m_flPrimaryDropChance")]
    primary_drop_chance: Option<f64>,
    #[serde(default, rename = "m_vecPrimaryPickups")]
    primary_pickups: Option<Vec<RawPickup>>,
    #[serde(default, rename = "m_vecPickups_lv2")]
    pickups_lv2: Option<Vec<RawPickup>>,
    #[serde(default, rename = "m_vecPickups_lv3")]
    pickups_lv3: Option<Vec<RawPickup>>,
    #[serde(default, rename = "m_eRollType")]
    roll_type: Option<RollType>,
    #[serde(default, rename = "m_flGoldAmount")]
    gold_amount: Option<f64>,
    #[serde(default, rename = "m_flGoldPerMinuteAmount")]
    gold_per_minute_amount: Option<f64>,
    // Source field name is `m_sModifer` (sic).
    #[serde(default, rename = "m_sModifer")]
    modifier: Option<WrapSubclass<RawModifierDefinition>>,
    #[serde(default, rename = "m_flPickupRadius")]
    pickup_radius: Option<RawCurveOrFloat>,
    #[serde(default, rename = "m_flPickupExpirationDuration")]
    expiration_duration: Option<RawCurveOrFloat>,
    #[serde(default, rename = "m_bShowOnMinimap")]
    show_on_minimap: Option<bool>,
    #[serde(default, rename = "m_flOrbSpawnDelayMin")]
    orb_spawn_delay_min: Option<f64>,
    #[serde(default, rename = "m_flOrbSpawnDelayMax")]
    orb_spawn_delay_max: Option<f64>,
    #[serde(default, rename = "m_flLifeTime")]
    lifetime: Option<f64>,
    #[serde(default, rename = "m_flCollisionRadius")]
    collision_radius: Option<f64>,
}

// ----- Public shape -----

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ModifierValue {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_max: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ModifierDefinition {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subclass_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub always_show_in_ui: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifier_values: Option<Vec<ModifierValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_values: Option<Vec<ModifierValue>>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct Pickup {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pickup_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pickup_weight: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct Curve {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_minute_after_start: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
#[serde(untagged)]
pub(crate) enum CurveOrFloat {
    Curve(Curve),
    Float(f64),
}

#[derive(Debug, Serialize, Clone, ToSchema)]
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct MiscEntity {
    pub class_name: String,
    pub id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_spawn_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub respawn_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_interval: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_spawn_delay_in_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_interval_in_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_time_mins_for_level2_pickups: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_time_mins_for_level3_pickups: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loot_list_deck_size: Option<i64>,
    /// Duplicate of `initial_spawn_delay_in_seconds` for shape parity.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub initial_spawn_delay_seconds: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub break_on_dodge_touch: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub solid_after_death: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub render_after_death: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damaged_by_abilities: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damaged_by_melee: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damaged_by_bullets: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_mantleable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_drop_chance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_pickups: Option<Vec<Pickup>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "m_vecPickups_lv2")]
    pub pickups_lv2: Option<Vec<Pickup>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "m_vecPickups_lv3")]
    pub pickups_lv3: Option<Vec<Pickup>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roll_type: Option<RollType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_per_minute_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifier: Option<Subclass<ModifierDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pickup_radius: Option<CurveOrFloat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_duration: Option<CurveOrFloat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_on_minimap: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orb_spawn_delay_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orb_spawn_delay_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lifetime: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collision_radius: Option<f64>,
}

// ----- Build -----

pub(crate) fn build_misc_entities(vdata: &str) -> Result<Vec<MiscEntity>, AssetsError> {
    let root: IndexMap<String, serde_json::Value> = kv3::from_str(vdata)?;
    let mut out = Vec::with_capacity(root.len());
    for (class_name, value) in root {
        if !value.is_object() || class_name.contains("base") || class_name.contains("dummy") {
            continue;
        }
        let raw: RawMiscEntity = match serde_json::from_value(value) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Skipping misc entity {class_name}: {e}");
                continue;
            }
        };
        out.push(transform(class_name, raw));
    }
    Ok(out)
}

fn transform(class_name: String, r: RawMiscEntity) -> MiscEntity {
    let id = entity_id(&class_name);
    MiscEntity {
        color: r.color,
        initial_spawn_time: r.initial_spawn_time,
        respawn_time: r.respawn_time,
        spawn_interval: r.spawn_interval,
        initial_spawn_delay_in_seconds: r.initial_spawn_delay_in_seconds,
        spawn_interval_in_seconds: r.spawn_interval_in_seconds,
        match_time_mins_for_level2_pickups: r.match_time_mins_for_level2_pickups,
        match_time_mins_for_level3_pickups: r.match_time_mins_for_level3_pickups,
        loot_list_deck_size: r.loot_list_deck_size,
        initial_spawn_delay_seconds: r.initial_spawn_delay_in_seconds,
        health: r.health,
        break_on_dodge_touch: r.break_on_dodge_touch,
        solid_after_death: r.solid_after_death,
        render_after_death: r.render_after_death,
        damaged_by_abilities: r.damaged_by_abilities,
        damaged_by_melee: r.damaged_by_melee,
        damaged_by_bullets: r.damaged_by_bullets,
        is_mantleable: r.is_mantleable,
        primary_drop_chance: r.primary_drop_chance,
        primary_pickups: r.primary_pickups.map(pickups_out),
        pickups_lv2: r.pickups_lv2.map(pickups_out),
        pickups_lv3: r.pickups_lv3.map(pickups_out),
        roll_type: r.roll_type,
        gold_amount: r.gold_amount,
        gold_per_minute_amount: r.gold_per_minute_amount,
        modifier: r.modifier.map(|w| Subclass {
            subclass: modifier_out(w.subclass),
        }),
        pickup_radius: r.pickup_radius.map(curve_or_float_out),
        expiration_duration: r.expiration_duration.map(curve_or_float_out),
        show_on_minimap: r.show_on_minimap,
        orb_spawn_delay_min: r.orb_spawn_delay_min,
        orb_spawn_delay_max: r.orb_spawn_delay_max,
        lifetime: r.lifetime,
        collision_radius: r.collision_radius,
        class_name,
        id,
    }
}

fn pickups_out(v: Vec<RawPickup>) -> Vec<Pickup> {
    v.into_iter()
        .map(|p| Pickup {
            pickup_name: p.pickup_name,
            pickup_weight: p.pickup_weight,
        })
        .collect()
}

fn modifier_out(r: RawModifierDefinition) -> ModifierDefinition {
    ModifierDefinition {
        class_name: r.class_name,
        subclass_name: r.subclass_name,
        duration: r.duration,
        time_min: r.time_min,
        time_max: r.time_max,
        always_show_in_ui: r.always_show_in_ui,
        modifier_values: r.modifier_values.map(modifier_values_out),
        script_values: r.script_values.map(modifier_values_out),
    }
}

fn modifier_values_out(v: Vec<RawModifierValue>) -> Vec<ModifierValue> {
    v.into_iter()
        .map(|x| ModifierValue {
            value_type: x.value_type,
            value: x.value,
            value_min: x.value_min,
            value_max: x.value_max,
        })
        .collect()
}

fn curve_or_float_out(r: RawCurveOrFloat) -> CurveOrFloat {
    match r {
        RawCurveOrFloat::Curve(c) => CurveOrFloat::Curve(Curve {
            base: c.base,
            per_minute_after_start: c.per_minute_after_start,
        }),
        RawCurveOrFloat::Float(f) => CurveOrFloat::Float(f),
    }
}

// ----- Cached fetch -----

#[cached(
    ty = "LruTtlCache<u32, Arc<Vec<MiscEntity>>>",
    create = "{ LruTtlCache::builder().size(DEFAULT_CACHE_SIZE).ttl(DEFAULT_CACHE_TTL).build() }",
    convert = "{ version }",
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_misc_entities(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<Vec<MiscEntity>>, AssetsError> {
    let vdata = store::fetch_text(r2, version, "scripts/misc.vdata").await?;
    let entities = build_misc_entities(&vdata)?;
    Ok(Arc::new(entities))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!("{manifest}/src/utils/kv3_fixtures/misc.vdata"))
            .expect("vdata fixture")
    }

    #[test]
    fn snapshot_misc_entities() {
        let entities = build_misc_entities(&fixture()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "misc_entities_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("misc_entities", entities); }
        );
    }

    #[test]
    fn skips_base_and_dummy_classes() {
        let entities = build_misc_entities(&fixture()).expect("builds");
        for e in &entities {
            assert!(!e.class_name.contains("base"), "leaked: {}", e.class_name);
            assert!(!e.class_name.contains("dummy"), "leaked: {}", e.class_name);
        }
    }

    #[test]
    fn roll_type_round_trips_known_and_unknown() {
        let known: RollType = "ECitadelRandomRoll_BreakablePowerupPickup".parse().unwrap();
        assert_eq!(
            known.to_string(),
            "ECitadelRandomRoll_BreakablePowerupPickup"
        );
        let other: RollType = "SomeNewRoll".parse().unwrap();
        assert_eq!(other.to_string(), "SomeNewRoll");
    }
}
