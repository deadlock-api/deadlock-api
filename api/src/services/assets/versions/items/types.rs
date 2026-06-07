//! Public `/v1/assets/items` JSON types. Field order matches the legacy
//! `/v2/items` output so existing clients keep working.

#![allow(
    clippy::too_many_lines,
    clippy::large_enum_variant,
    clippy::struct_field_names
)]

use async_graphql::{ComplexObject, Enum, Json, SimpleObject, Union};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

use crate::services::assets::versions::items::raw::{
    DependantAbilities, RawAbilityUpgrade, RawCustomCrosshairSettings,
    RawItemPropertyScaleFunctionSubclass, RawItemWeaponInfoBulletSpeedCurve,
    RawItemWeaponInfoInner, RawWeaponInfoHorizontalRecoil, RawWeaponInfoVerticalRecoil,
};

#[derive(Debug, Clone, Copy, Serialize, EnumString, ToSchema, PartialEq, Eq, Enum)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AbilityType {
    #[strum(serialize = "EAbilityType_Innate")]
    Innate,
    #[strum(serialize = "EAbilityType_Item")]
    Item,
    #[strum(serialize = "EAbilityType_Signature")]
    Signature,
    #[strum(serialize = "EAbilityType_Ultimate")]
    Ultimate,
    #[strum(serialize = "EAbilityType_Weapon")]
    Weapon,
    #[strum(serialize = "EAbilityType_Melee")]
    Melee,
    #[strum(serialize = "EAbilityType_Cosmetic")]
    Cosmetic,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, EnumString, ToSchema, PartialEq, Eq, Enum)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ItemSlotType {
    #[strum(serialize = "EItemSlotType_WeaponMod")]
    Weapon,
    #[strum(serialize = "EItemSlotType_Tech")]
    #[serde(rename = "spirit")]
    Spirit,
    #[strum(serialize = "EItemSlotType_Armor")]
    #[serde(rename = "vitality")]
    Vitality,
}

#[derive(Debug, Clone, Copy, Serialize, EnumString, ToSchema, PartialEq, Eq, Enum)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AbilityActivation {
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_HOLD_TOGGLE")]
    HoldToggle,
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_INSTANT_CAST")]
    InstantCast,
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_ON_BUTTON_IS_DOWN")]
    OnButtonIsDown,
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_PASSIVE")]
    Passive,
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_PRESS")]
    Press,
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_PRESS_TOGGLE")]
    PressToggle,
    #[strum(serialize = "CITADEL_ABILITY_ACTIVATION_INSTANT_CAST_TOGGLE")]
    InstantCastToggle,
}

#[derive(Debug, Clone, Copy, Serialize, EnumString, ToSchema, PartialEq, Eq, Enum)]
pub(crate) enum AbilityImbue {
    #[strum(serialize = "CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_ACTIVE")]
    #[serde(rename = "imbue_active")]
    Active,
    #[strum(serialize = "CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_ACTIVE_NON_ULT")]
    #[serde(rename = "imbue_active_non_ult")]
    ActiveNonUlt,
    #[strum(serialize = "CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_MODIFIER_VALUE")]
    #[serde(rename = "imbue_modifier_value")]
    ModifierValue,
}

#[derive(Debug, Clone, Copy, Serialize, EnumString, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum AbilitySectionType {
    #[strum(serialize = "EArea_Innate")]
    Innate,
    #[strum(serialize = "EArea_Active")]
    Active,
    #[strum(serialize = "EArea_Passive")]
    Passive,
}

#[derive(Debug, Clone, Copy, Serialize, EnumString, ToSchema)]
pub(crate) enum StatsUsageFlag {
    ConditionallyApplied,
    ConditionallyEnemyApplied,
    IntrinsicallyProvidedInAbility,
    IntrinsicallyProvidedInModifier,
}

/// Discriminator for the `type` field on every item variant.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Display, ToSchema, PartialEq, Eq, Enum)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub(crate) enum ItemType {
    Ability,
    Weapon,
    Upgrade,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct ItemProperty {
    /// Raw JSON value preserves the source distinction between numeric and
    /// stringly-typed bonuses (`"14.5"` vs `14.5`).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>)]
    pub(crate) value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<String>)]
    pub(crate) street_brawl_value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) can_set_token_override: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) provided_property_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) css_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) usage_flags: Option<Vec<StatsUsageFlag>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) negative_attribute: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) disable_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) loc_token_override: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) display_units: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) scale_function: Option<RawItemPropertyScaleFunctionSubclass>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) postfix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) postvalue_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) conditional: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct UpgradeProperty {
    #[serde(flatten)]
    pub(crate) property: ItemProperty,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tooltip_section: Option<AbilitySectionType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tooltip_is_elevated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) tooltip_is_important: Option<bool>,
}

#[derive(Debug, Clone, Serialize, ToSchema, Default, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct AbilityDescription {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) quip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) t1_desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) t2_desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) t3_desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) active: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) passive: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema, Default, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct UpgradeDescription {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) desc: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) desc2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) active: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) passive: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct AbilityVideos {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) webm: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) mp4: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct TooltipDetailsBlockProperty {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) requires_ability_upgrade: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) show_property_value: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) important_property: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) status_effect_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) status_effect_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) important_property_icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct TooltipDetailsBlock {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) loc_string: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) properties: Option<Vec<TooltipDetailsBlockProperty>>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct TooltipDetailsInfoSection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) loc_string: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) property_upgrade_required: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) properties_block: Option<Vec<TooltipDetailsBlock>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) basic_properties: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct AbilityTooltipDetails {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) info_sections: Option<Vec<TooltipDetailsInfoSection>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) additional_header_properties: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct UpgradeTooltipImportantPropertyWithIcon {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) localized_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct UpgradeTooltipSectionAttribute {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) loc_string: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) properties: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) elevated_properties: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) important_properties: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) important_properties_with_icon: Option<Vec<UpgradeTooltipImportantPropertyWithIcon>>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct UpgradeTooltipSection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) section_type: Option<AbilitySectionType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) section_attributes: Option<Vec<UpgradeTooltipSectionAttribute>>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct WeaponInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) can_zoom: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_damage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_gravity_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_inherit_shooter_velocity_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_lifetime: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_radius_vs_world: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_reflect_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_reflect_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_whiz_distance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) burst_shot_cooldown: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) crit_bonus_against_npcs: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) crit_bonus_end: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) crit_bonus_end_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) crit_bonus_start: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) crit_bonus_start_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) cycle_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) spins_up: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) is_semi_auto: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) semi_auto_cycle_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) max_spin_cycle_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) spin_increase_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) spin_decay_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) build_up_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) intra_burst_cycle_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_falloff_bias: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_falloff_end_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_falloff_end_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_falloff_start_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_falloff_start_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) horizontal_punch: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) recoil_recovery_delay_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) recoil_recovery_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) recoil_shot_index_recovery_time_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) recoil_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reload_move_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) scatter_yaw_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) aiming_shot_spread_penalty: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) standing_shot_spread_penalty: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shoot_move_speed_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shoot_spread_penalty_decay: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shoot_spread_penalty_decay_delay: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shoot_spread_penalty_per_shot: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shooting_up_spread_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) vertical_punch: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) zoom_fov: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) zoom_move_speed_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullets: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reload_single_bullets_initial_delay: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reload_single_bullets: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reload_single_bullets_allow_cancel: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) burst_shot_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) clip_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) spread: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) standing_spread: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) low_ammo_indicator_threshold: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) recoil_seed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reload_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullet_speed_curve: Option<RawItemWeaponInfoBulletSpeedCurve>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) horizontal_recoil: Option<RawWeaponInfoHorizontalRecoil>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) vertical_recoil: Option<RawWeaponInfoVerticalRecoil>,
    // Computed fields, declared last to match the original serialization order.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shots_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shots_per_second_with_reload: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullets_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) bullets_per_second_with_reload: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_per_second_with_reload: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_per_shot: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) damage_per_magazine: Option<f64>,
}

#[derive(Debug, Clone, Serialize, ToSchema, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
pub(crate) struct Ability {
    pub(crate) id: u32,
    pub(crate) class_name: String,
    pub(crate) name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) start_trained: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) hero: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) heroes: Option<Vec<u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) update_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<std::collections::HashMap<String, ItemProperty>>)]
    #[graphql(skip)]
    pub(crate) properties: Option<IndexMap<String, ItemProperty>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) weapon_info: Option<RawItemWeaponInfoInner>,
    pub(crate) r#type: ItemType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) grant_ammo_on_cast: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) behaviours: Option<Vec<String>>,
    pub(crate) description: AbilityDescription,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) tooltip_details: Option<AbilityTooltipDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) upgrades: Option<Vec<RawAbilityUpgrade>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ability_type: Option<AbilityType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) boss_damage_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) dependant_abilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) videos: Option<AbilityVideos>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<std::collections::HashMap<String, DependantAbilities>>)]
    #[graphql(skip)]
    pub(crate) dependent_abilities: Option<IndexMap<String, Option<DependantAbilities>>>,
}

#[ComplexObject(rename_fields = "snake_case")]
impl Ability {
    async fn properties(&self) -> Json<Option<IndexMap<String, ItemProperty>>> {
        Json(self.properties.clone())
    }
    async fn weapon_info(&self) -> Json<Option<RawItemWeaponInfoInner>> {
        Json(self.weapon_info.clone())
    }
    async fn tooltip_details(&self) -> Json<Option<AbilityTooltipDetails>> {
        Json(self.tooltip_details.clone())
    }
    async fn upgrades(&self) -> Json<Option<Vec<RawAbilityUpgrade>>> {
        Json(self.upgrades.clone())
    }
    async fn dependent_abilities(
        &self,
    ) -> Json<Option<IndexMap<String, Option<DependantAbilities>>>> {
        Json(self.dependent_abilities.clone())
    }
}

#[derive(Debug, Clone, Serialize, ToSchema, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
pub(crate) struct Weapon {
    pub(crate) id: u32,
    pub(crate) class_name: String,
    pub(crate) name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) start_trained: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) hero: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) heroes: Option<Vec<u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) update_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<std::collections::HashMap<String, ItemProperty>>)]
    #[graphql(skip)]
    pub(crate) properties: Option<IndexMap<String, ItemProperty>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) weapon_info: Option<WeaponInfo>,
    pub(crate) r#type: ItemType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) crosshair_css_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) use_custom_crosshair_settings: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) custom_crosshair_settings: Option<RawCustomCrosshairSettings>,
}

#[ComplexObject(rename_fields = "snake_case")]
impl Weapon {
    async fn properties(&self) -> Json<Option<IndexMap<String, ItemProperty>>> {
        Json(self.properties.clone())
    }
    async fn weapon_info(&self) -> Json<Option<WeaponInfo>> {
        Json(self.weapon_info.clone())
    }
    async fn custom_crosshair_settings(&self) -> Json<Option<RawCustomCrosshairSettings>> {
        Json(self.custom_crosshair_settings.clone())
    }
}

#[derive(Debug, Clone, Serialize, ToSchema, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
pub(crate) struct Upgrade {
    pub(crate) id: u32,
    pub(crate) class_name: String,
    pub(crate) name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) start_trained: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) hero: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) heroes: Option<Vec<u32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) update_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) weapon_info: Option<RawItemWeaponInfoInner>,
    pub(crate) r#type: ItemType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shop_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shop_image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shop_image_small: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shop_image_small_webp: Option<String>,
    pub(crate) item_slot_type: ItemSlotType,
    pub(crate) item_tier: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<std::collections::HashMap<String, UpgradeProperty>>)]
    #[graphql(skip)]
    pub(crate) properties: Option<IndexMap<String, UpgradeProperty>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) disabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) description: Option<UpgradeDescription>,
    pub(crate) activation: AbilityActivation,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) imbue: Option<AbilityImbue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) component_items: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) tooltip_sections: Option<Vec<UpgradeTooltipSection>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[graphql(skip)]
    pub(crate) upgrades: Option<Vec<RawAbilityUpgrade>>,
    pub(crate) is_active_item: bool,
    pub(crate) shopable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) cost: Option<u32>,
}

#[ComplexObject(rename_fields = "snake_case")]
impl Upgrade {
    async fn weapon_info(&self) -> Json<Option<RawItemWeaponInfoInner>> {
        Json(self.weapon_info.clone())
    }
    async fn properties(&self) -> Json<Option<IndexMap<String, UpgradeProperty>>> {
        Json(self.properties.clone())
    }
    async fn tooltip_sections(&self) -> Json<Option<Vec<UpgradeTooltipSection>>> {
        Json(self.tooltip_sections.clone())
    }
    async fn upgrades(&self) -> Json<Option<Vec<RawAbilityUpgrade>>> {
        Json(self.upgrades.clone())
    }
}

#[derive(Debug, Clone, Serialize, ToSchema, Union)]
#[graphql(name = "AssetItem")]
#[serde(untagged)]
pub(crate) enum Item {
    Ability(Ability),
    Weapon(Weapon),
    Upgrade(Upgrade),
}

impl Item {
    pub(crate) fn id(&self) -> u32 {
        match self {
            Self::Ability(a) => a.id,
            Self::Weapon(w) => w.id,
            Self::Upgrade(u) => u.id,
        }
    }
    pub(crate) fn class_name(&self) -> &str {
        match self {
            Self::Ability(a) => &a.class_name,
            Self::Weapon(w) => &w.class_name,
            Self::Upgrade(u) => &u.class_name,
        }
    }
    pub(crate) fn heroes(&self) -> Option<&[u32]> {
        match self {
            Self::Ability(a) => a.heroes.as_deref(),
            Self::Weapon(w) => w.heroes.as_deref(),
            Self::Upgrade(u) => u.heroes.as_deref(),
        }
    }
    pub(crate) fn item_type(&self) -> ItemType {
        match self {
            Self::Ability(_) => ItemType::Ability,
            Self::Weapon(_) => ItemType::Weapon,
            Self::Upgrade(_) => ItemType::Upgrade,
        }
    }
}
