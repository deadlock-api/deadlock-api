//! `/v1/assets/misc-entities` data layer — fetch + parse + transform.

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{
    Color, Subclass, WrapSubclass, build_from_kv3, entity_id, enum_str_serde,
};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::{localization, store};

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
    #[serde(default, rename = "m_nEnabledStateMask")]
    enabled_state_mask: Option<String>,
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
#[derive(Debug, Clone, PartialEq, Eq, EnumString, Display)]
pub(crate) enum RollType {
    #[strum(serialize = "ECitadelRandomRoll_BreakablePowerupPickup")]
    BreakablePowerupPickup,
    #[strum(serialize = "ECitadelRandomRoll_BreakableGoldPickup")]
    BreakableGoldPickup,
    #[strum(default)]
    Other(String),
}

enum_str_serde!(RollType);

// Serializes as a plain string via `Display` (the `Other` catch-all makes any
// string valid), so the schema is an open string, not a `oneOf`. A derived
// `oneOf` schema here mismatches the wire format and makes the C# openapi
// generator emit uncompilable code (deadlock-api/openapi-clients#7).
impl utoipa::PartialSchema for RollType {
    fn schema() -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
        utoipa::openapi::schema::ObjectBuilder::new()
            .schema_type(utoipa::openapi::schema::Type::String)
            .description(Some(
                "Known values for `m_eRollType`. Unknown values pass through \
                 unchanged so a newly-introduced roll type doesn't 500. Known \
                 values: `ECitadelRandomRoll_BreakablePowerupPickup`, \
                 `ECitadelRandomRoll_BreakableGoldPickup`.",
            ))
            .examples(["ECitadelRandomRoll_BreakablePowerupPickup"])
            .into()
    }
}

impl utoipa::ToSchema for RollType {
    fn name() -> std::borrow::Cow<'static, str> {
        std::borrow::Cow::Borrowed("RollType")
    }
}

#[derive(Debug, Deserialize)]
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
    #[serde(default, rename = "m_bDamagedBySlide")]
    damaged_by_slide: Option<bool>,
    #[serde(default, rename = "m_bHeavyMeleeOnly")]
    heavy_melee_only: Option<bool>,
    #[serde(default, rename = "m_nHeavyMeleeHitCount")]
    heavy_melee_hit_count: Option<i64>,
    #[serde(default, rename = "m_bIsMantleable")]
    is_mantleable: Option<bool>,
    // Removed in build 6711 (replaced by `m_flPowerupDropChance`).
    #[serde(default, rename = "m_flPrimaryDropChance")]
    primary_drop_chance: Option<f64>,
    #[serde(default, rename = "m_vecPrimaryPickups")]
    primary_pickups: Option<Vec<RawPickup>>,
    #[serde(default, rename = "m_vecPickups_lv2")]
    pickups_lv2: Option<Vec<RawPickup>>,
    #[serde(default, rename = "m_vecPickups_lv3")]
    pickups_lv3: Option<Vec<RawPickup>>,
    #[serde(default, rename = "m_flPowerupDropChance")]
    powerup_drop_chance: Option<f64>,
    /// Build 6711+: `{pickup_name: weight}`, replacing the `m_vecPickups*` lists.
    #[serde(default, rename = "m_mapPickupChances")]
    pickup_chances: Option<IndexMap<String, f64>>,
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
    #[serde(default, rename = "m_sBuffTypeLocString")]
    buff_type_loc_string: Option<String>,
    #[serde(default, rename = "m_BuffTypeGraphColor")]
    buff_type_graph_color: Option<Color>,
    #[serde(default, rename = "m_eBuffTypeValueUnit")]
    buff_type_value_unit: Option<String>,
    #[serde(default, rename = "m_bIsPermanentPickup")]
    is_permanent_pickup: Option<bool>,
    #[serde(default, rename = "m_sNameLocString")]
    name_loc_string: Option<String>,
    #[serde(default, rename = "m_eCollectionMethod")]
    collection_method: Option<String>,
    #[serde(default, rename = "m_iHitsRequired")]
    hits_required: Option<i64>,
    #[serde(default, rename = "m_strMinimapClass")]
    minimap_class: Option<String>,
    #[serde(default, rename = "m_sPickup")]
    pickup: Option<String>,
    #[serde(default, rename = "m_flSpawnDelay")]
    spawn_delay: Option<f64>,
    #[serde(default, rename = "m_sSinglePickupOverride")]
    single_pickup_override: Option<String>,
    #[serde(default, rename = "m_flRegenMaxHealthPercent")]
    regen_max_health_percent: Option<RawCurveOrFloat>,
    #[serde(default, rename = "m_flRegenDuration")]
    regen_duration: Option<f64>,
    #[serde(default, rename = "m_flRegenDurationTroopers")]
    regen_duration_troopers: Option<f64>,
    #[serde(default, rename = "m_flRegenTrooperMulti")]
    regen_trooper_multi: Option<f64>,
    #[serde(default, rename = "m_InShopModifier")]
    in_shop_modifier: Option<WrapSubclass<RawModifierDefinition>>,
    #[serde(default, rename = "m_nSpawnMusicState")]
    spawn_music_state: Option<String>,
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
    /// Modifier states the modifier enables, e.g.
    /// `MODIFIER_STATE_IN_CORRUPTED_ITEM_SHOP`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_state_mask: Option<String>,
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
    pub damaged_by_slide: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heavy_melee_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heavy_melee_hit_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_mantleable: Option<bool>,
    /// Pre-6711 builds only; see `powerup_drop_chance`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_drop_chance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_pickups: Option<Vec<Pickup>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "m_vecPickups_lv2")]
    pub pickups_lv2: Option<Vec<Pickup>>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "m_vecPickups_lv3")]
    pub pickups_lv3: Option<Vec<Pickup>>,
    /// Drop chance (percent) for build 6711+; replaces `primary_drop_chance`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub powerup_drop_chance: Option<f64>,
    /// Pickup name to relative weight (build 6711+); replaces the
    /// `primary_pickups` / `m_vecPickups_lv*` lists.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<std::collections::HashMap<String, f64>>)]
    pub pickup_chances: Option<IndexMap<String, f64>>,
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
    /// Permanent pickups: localization token of the stat the buff raises.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buff_type_loc_string: Option<String>,
    /// Permanent pickups: `buff_type_loc_string` localized into the requested
    /// language (e.g. `Fire Rate`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buff_type_name: Option<String>,
    /// Permanent pickups: color used for the buff in the stat graph.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buff_type_graph_color: Option<Color>,
    /// Permanent pickups: unit of the buff value (e.g. `Percent`, `Meters`).
    /// The modifier value itself is in game units (`Meters` values are
    /// inches, 39.37 per meter).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buff_type_value_unit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_permanent_pickup: Option<bool>,
    /// Localization token of the pickup's world label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_loc_string: Option<String>,
    /// `name_loc_string` localized into the requested language (e.g.
    /// `+1.5% Fire Rate`). Gold pickups use an ICU plural pattern
    /// (`{amount, plural, one{Soul} other{Souls}}`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// How the pickup is collected, e.g. `Punch` or `VacuumTrigger`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_method: Option<String>,
    /// Punchable pickups: hits needed to collect.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hits_required: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_class: Option<String>,
    /// Pickup spawners: class name of the spawned pickup.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pickup: Option<String>,
    /// Pickup spawners: delay (seconds) before the first spawn.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_delay: Option<f64>,
    /// Powerup spawners: class name of the only pickup spawned, overriding
    /// `pickup_chances`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub single_pickup_override: Option<String>,
    /// Health pickups: healing as percent of max health.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regen_max_health_percent: Option<CurveOrFloat>,
    /// Health pickups: seconds over which the healing is applied to heroes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regen_duration: Option<f64>,
    /// Health pickups: seconds over which the healing is applied to troopers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regen_duration_troopers: Option<f64>,
    /// Health pickups: healing multiplier for troopers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub regen_trooper_multi: Option<f64>,
    /// Corrupted item shop (Broker) trigger: modifier applied while inside.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_shop_modifier: Option<Subclass<ModifierDefinition>>,
    /// Corrupted item shop (Broker) trigger: music cue played on spawn.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_music_state: Option<String>,
}

// ----- Build -----

pub(crate) fn build_misc_entities(
    vdata: &str,
    loc: &HashMap<String, String>,
) -> Result<Vec<MiscEntity>, AssetsError> {
    build_from_kv3(
        vdata,
        "misc entity",
        |class_name, value| {
            value.is_object() && !class_name.contains("base") && !class_name.contains("dummy")
        },
        |class_name, raw| transform(class_name, raw, loc),
    )
}

fn transform(class_name: String, r: RawMiscEntity, loc: &HashMap<String, String>) -> MiscEntity {
    let id = entity_id(&class_name);
    let name_loc_string = r.name_loc_string.filter(|s| !s.is_empty());
    let name = name_loc_string
        .as_deref()
        .map(|t| localization::localize(loc, t));
    let buff_type_name = r
        .buff_type_loc_string
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|t| localization::localize(loc, t));
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
        damaged_by_slide: r.damaged_by_slide,
        heavy_melee_only: r.heavy_melee_only,
        heavy_melee_hit_count: r.heavy_melee_hit_count,
        is_mantleable: r.is_mantleable,
        primary_drop_chance: r.primary_drop_chance,
        primary_pickups: r.primary_pickups.map(pickups_out),
        pickups_lv2: r.pickups_lv2.map(pickups_out),
        pickups_lv3: r.pickups_lv3.map(pickups_out),
        powerup_drop_chance: r.powerup_drop_chance,
        pickup_chances: r.pickup_chances,
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
        buff_type_loc_string: r.buff_type_loc_string,
        buff_type_name,
        buff_type_graph_color: r.buff_type_graph_color,
        buff_type_value_unit: r.buff_type_value_unit,
        is_permanent_pickup: r.is_permanent_pickup,
        name_loc_string,
        name,
        collection_method: r.collection_method,
        hits_required: r.hits_required,
        minimap_class: r.minimap_class.filter(|s| !s.is_empty()),
        pickup: r.pickup.filter(|s| !s.is_empty()),
        spawn_delay: r.spawn_delay,
        single_pickup_override: r.single_pickup_override.filter(|s| !s.is_empty()),
        regen_max_health_percent: r.regen_max_health_percent.map(curve_or_float_out),
        regen_duration: r.regen_duration,
        regen_duration_troopers: r.regen_duration_troopers,
        regen_trooper_multi: r.regen_trooper_multi,
        in_shop_modifier: r.in_shop_modifier.map(|w| Subclass {
            subclass: modifier_out(w.subclass),
        }),
        spawn_music_state: r.spawn_music_state,
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
        enabled_state_mask: r.enabled_state_mask,
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
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)"
)]
pub(crate) async fn fetch_misc_entities(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<MiscEntity>>, AssetsError> {
    let (vdata, loc) = tokio::try_join!(
        async {
            store::fetch_text(r2, version, "scripts/misc.vdata")
                .await
                .map_err(AssetsError::from)
        },
        localization::fetch_localization(r2, version, language),
    )?;
    let entities = build_misc_entities(&vdata, &loc)?;
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
        let entities = build_misc_entities(&fixture(), &HashMap::new()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "misc_entities_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("misc_entities", entities); }
        );
    }

    fn build_6712() -> Vec<MiscEntity> {
        let manifest = env!("CARGO_MANIFEST_DIR");
        let vdata =
            std::fs::read_to_string(format!("{manifest}/src/utils/kv3_fixtures/misc_6712.vdata"))
                .expect("vdata fixture");
        let loc: HashMap<String, String> = [
            ("Citadel_Graph_PermanentBuff_MoveSpeed", "Move Speed"),
            ("movespeed_permanent_pickup_label_lv3", "+0.3m Move Speed"),
            ("souls_powerup_pickup", "Souls"),
            (
                "big_gold_pickup_label:f",
                "{amount, plural, one{Soul} other{Souls}}",
            ),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v.to_owned()))
        .collect();
        build_misc_entities(&vdata, &loc).expect("builds")
    }

    #[test]
    fn localizes_names_6712() {
        let entities = build_6712();
        let get = |name: &str| {
            entities
                .iter()
                .find(|e| e.class_name == name)
                .unwrap_or_else(|| panic!("missing {name}"))
        };
        let movespeed = get("movespeed_permanent_pickup_lv3");
        assert_eq!(movespeed.buff_type_name.as_deref(), Some("Move Speed"));
        assert_eq!(movespeed.name.as_deref(), Some("+0.3m Move Speed"));
        assert_eq!(
            get("big_gold_pickup").name.as_deref(),
            Some("{amount, plural, one{Soul} other{Souls}}")
        );
        // No translation: the token passes through.
        assert_eq!(
            get("firerate_permanent_pickup").buff_type_name.as_deref(),
            Some("#Citadel_Graph_PermanentBuff_FireRate")
        );
    }

    /// Build 6712 ("City Never Sleeps"): new permanent buffs, healing snacks,
    /// soul pickups, the Broker trigger and the Chinatown bell.
    #[test]
    fn snapshot_misc_entities_6712() {
        let entities = build_6712();
        let get = |name: &str| {
            entities
                .iter()
                .find(|e| e.class_name == name)
                .unwrap_or_else(|| panic!("missing {name}"))
        };
        let script_values = |e: &MiscEntity| -> Vec<(String, f64)> {
            e.modifier
                .as_ref()
                .and_then(|m| m.subclass.script_values.as_ref())
                .expect("script values")
                .iter()
                .map(|v| (v.value_type.clone().unwrap(), v.value.unwrap()))
                .collect()
        };

        for (prefix, unit) in [
            ("bulletresist", "Percent"),
            ("spiritresist", "Percent"),
            ("range", "Percent"),
            ("movespeed", "Meters"),
        ] {
            for suffix in ["", "_lv2", "_lv3"] {
                let e = get(&format!("{prefix}_permanent_pickup{suffix}"));
                assert_eq!(e.is_permanent_pickup, Some(true));
                assert_eq!(e.buff_type_value_unit.as_deref(), Some(unit));
                assert!(e.buff_type_loc_string.is_some());
                assert!(e.buff_type_graph_color.is_some());
                assert_ne!(script_values(e), Vec::<(String, f64)>::new());
            }
        }
        assert_eq!(
            script_values(get("movespeed_permanent_pickup_lv3")),
            [("MODIFIER_VALUE_MOVEMENT_SPEED_MAX".to_owned(), 11.811)]
        );
        assert_eq!(
            script_values(get("bulletresist_permanent_pickup")),
            [("MODIFIER_VALUE_BULLET_ARMOR_DAMAGE_RESIST".to_owned(), 0.5)]
        );

        let snack_spawner = get("citadel_pickup_floating_health");
        assert_eq!(
            snack_spawner.pickup.as_deref(),
            Some("citadel_pickup_health_float_in_world")
        );
        assert_eq!(snack_spawner.spawn_delay, Some(180.0));
        assert_eq!(snack_spawner.respawn_time, Some(180.0));
        let snack = get("citadel_pickup_health_float_in_world");
        assert!(matches!(
            snack.regen_max_health_percent,
            Some(CurveOrFloat::Curve(Curve {
                base: Some(10.0),
                ..
            }))
        ));
        assert_eq!(snack.regen_duration, Some(4.0));
        assert_eq!(snack.regen_duration_troopers, Some(8.0));
        assert_eq!(snack.collection_method.as_deref(), Some("VacuumTrigger"));

        let souls = get("souls_powerup_pickup");
        assert_eq!(souls.collection_method.as_deref(), Some("Punch"));
        assert_eq!(souls.hits_required, Some(1));
        assert_eq!(souls.minimap_class.as_deref(), Some("powerup_souls"));
        assert_eq!(
            get("citadel_item_powerup_spawner_bounty_runes")
                .single_pickup_override
                .as_deref(),
            Some("souls_powerup_pickup")
        );

        let broker = get("citadel_trigger_corrupted_item_shop");
        assert_eq!(
            broker
                .in_shop_modifier
                .as_ref()
                .and_then(|m| m.subclass.enabled_state_mask.as_deref()),
            Some("MODIFIER_STATE_IN_CORRUPTED_ITEM_SHOP")
        );
        assert_eq!(
            broker.spawn_music_state.as_deref(),
            Some("k_EMusicQueue_CorruptedItemShopAnnounce")
        );

        let bell = get("citadel_breakable_bell_chinatown");
        assert_eq!(bell.health, Some(1));
        assert_eq!(bell.respawn_time, Some(5.0));

        insta::with_settings!(
            { snapshot_path => "misc_entities_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("misc_entities_6712", entities); }
        );
    }

    #[test]
    fn skips_base_and_dummy_classes() {
        let entities = build_misc_entities(&fixture(), &HashMap::new()).expect("builds");
        for e in &entities {
            assert!(!e.class_name.contains("base"), "leaked: {}", e.class_name);
            assert!(!e.class_name.contains("dummy"), "leaked: {}", e.class_name);
        }
    }

    #[test]
    fn parses_build_6711_pickup_fields() {
        let vdata = r##"<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->
{
	citadel_breakable_prop_tough_crate =
	{
		m_flPowerupDropChance = 100.000000
		m_eRollType = "ECitadelRandomRoll_BreakableGoldPickup"
		m_bHeavyMeleeOnly = true
		m_nHeavyMeleeHitCount = 1
		m_mapPickupChances =
		{
			big_gold_pickup = 1.000000
		}
	}
	firerate_permanent_pickup =
	{
		m_sBuffTypeLocString = "#Citadel_Graph_PermanentBuff_FireRate"
		m_BuffTypeGraphColor = [ 255, 60, 60 ]
		m_eBuffTypeValueUnit = "Percent"
	}
}"##;
        let loc: HashMap<String, String> = [(
            "Citadel_Graph_PermanentBuff_FireRate".to_owned(),
            "Fire Rate".to_owned(),
        )]
        .into();
        let entities = build_misc_entities(vdata, &loc).expect("builds");
        let crate_ = &entities[0];
        assert_eq!(crate_.powerup_drop_chance, Some(100.0));
        assert_eq!(crate_.roll_type, Some(RollType::BreakableGoldPickup));
        assert_eq!(crate_.heavy_melee_only, Some(true));
        assert_eq!(crate_.heavy_melee_hit_count, Some(1));
        assert_eq!(
            crate_
                .pickup_chances
                .as_ref()
                .and_then(|m| m.get("big_gold_pickup")),
            Some(&1.0)
        );
        assert!(crate_.primary_pickups.is_none());
        let pickup = &entities[1];
        assert_eq!(
            pickup.buff_type_loc_string.as_deref(),
            Some("#Citadel_Graph_PermanentBuff_FireRate")
        );
        assert_eq!(pickup.buff_type_name.as_deref(), Some("Fire Rate"));
        assert_eq!(pickup.buff_type_graph_color.map(|c| c.red), Some(255));
        assert_eq!(pickup.buff_type_value_unit.as_deref(), Some("Percent"));
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

    #[test]
    fn roll_type_schema_is_plain_string() {
        use utoipa::PartialSchema;
        let schema = serde_json::to_value(RollType::schema()).expect("serializes");
        assert_eq!(schema["type"], "string");
        assert!(
            schema.get("oneOf").is_none(),
            "must not be a oneOf: {schema}"
        );
    }
}
