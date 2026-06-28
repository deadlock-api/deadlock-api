use std::collections::HashMap;
use std::collections::HashMap as StdMap;
use std::sync::Arc;

use async_graphql::{ComplexObject, Enum, Json, SimpleObject};
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::EnumString;
use utoipa::ToSchema;

use crate::services::assets::versions::common::HeroItemType;
use crate::services::assets::versions::css;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;
use crate::services::assets::versions::store;
use crate::utils::kv3;

const IMAGE_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/images";
const SVGS_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
#[allow(clippy::struct_field_names)]
struct RawStartingStats {
    #[serde(rename = "EMaxMoveSpeed")]
    e_max_move_speed: f64,
    #[serde(rename = "ESprintSpeed")]
    e_sprint_speed: f64,
    #[serde(rename = "ECrouchSpeed")]
    e_crouch_speed: f64,
    #[serde(rename = "EMoveAcceleration")]
    e_move_acceleration: f64,
    #[serde(rename = "ELightMeleeDamage")]
    e_light_melee_damage: f64,
    #[serde(rename = "EHeavyMeleeDamage")]
    e_heavy_melee_damage: f64,
    #[serde(rename = "EMaxHealth")]
    e_max_health: f64,
    #[serde(rename = "EWeaponPower")]
    e_weapon_power: f64,
    #[serde(rename = "EReloadSpeed")]
    e_reload_speed: f64,
    #[serde(rename = "EWeaponPowerScale")]
    e_weapon_power_scale: f64,
    #[serde(rename = "EProcBuildUpRateScale")]
    e_proc_build_up_rate_scale: f64,
    #[serde(rename = "EStamina")]
    e_stamina: f64,
    #[serde(rename = "EBaseHealthRegen")]
    e_base_health_regen: f64,
    #[serde(rename = "EStaminaRegenPerSecond")]
    e_stamina_regen_per_second: f64,
    #[serde(rename = "EAbilityResourceMax")]
    e_ability_resource_max: f64,
    #[serde(rename = "EAbilityResourceRegenPerSecond")]
    e_ability_resource_regen_per_second: f64,
    #[serde(rename = "ECritDamageReceivedScale")]
    e_crit_damage_received_scale: f64,
    #[serde(rename = "ETechDuration")]
    e_tech_duration: f64,
    #[serde(default, rename = "ETechArmorDamageReduction")]
    e_tech_armor_damage_reduction: Option<f64>,
    #[serde(rename = "ETechRange")]
    e_tech_range: f64,
    #[serde(default, rename = "EBulletArmorDamageReduction")]
    e_bullet_armor_damage_reduction: Option<f64>,
    #[serde(default, rename = "EGroundDashDistanceInMeters")]
    e_ground_dash_distance_in_meters: Option<f64>,
    #[serde(default, rename = "EGroundDashDuration")]
    e_ground_dash_duration: Option<f64>,
    #[serde(default, rename = "EAirDashDistanceInMeters")]
    e_air_dash_distance_in_meters: Option<f64>,
    #[serde(default, rename = "EAirDashDuration")]
    e_air_dash_duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawShopSpiritStatsDisplay {
    #[serde(rename = "m_vecDisplayStats", default)]
    display_stats: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RawShopVitalityStatsDisplay {
    #[serde(rename = "m_vecDisplayStats", default)]
    display_stats: Vec<String>,
    #[serde(rename = "m_vecOtherDisplayStats", default)]
    other_display_stats: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RawShopWeaponStatsDisplay {
    #[serde(rename = "m_vecDisplayStats", default)]
    display_stats: Vec<String>,
    #[serde(rename = "m_vecOtherDisplayStats", default)]
    other_display_stats: Vec<String>,
    #[serde(rename = "m_eWeaponAttributes", default)]
    weapon_attributes: Option<String>,
    #[serde(rename = "m_strWeaponImage", default)]
    weapon_image: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_field_names)]
struct RawShopStatDisplay {
    #[serde(rename = "m_eSpiritStatsDisplay")]
    e_spirit_stats_display: RawShopSpiritStatsDisplay,
    #[serde(rename = "m_eVitalityStatsDisplay")]
    e_vitality_stats_display: RawShopVitalityStatsDisplay,
    #[serde(rename = "m_eWeaponStatsDisplay")]
    e_weapon_stats_display: RawShopWeaponStatsDisplay,
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_field_names)]
struct RawHeroStatsDisplay {
    #[serde(rename = "m_vecHealthHeaderStats", default)]
    health_header_stats: Vec<String>,
    #[serde(rename = "m_vecHealthStats", default)]
    health_stats: Vec<String>,
    #[serde(rename = "m_vecMagicHeaderStats", default)]
    magic_header_stats: Vec<String>,
    #[serde(rename = "m_vecMagicStats", default)]
    magic_stats: Vec<String>,
    #[serde(rename = "m_vecWeaponHeaderStats", default)]
    weapon_header_stats: Vec<String>,
    #[serde(rename = "m_vecWeaponStats", default)]
    weapon_stats: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroStatsUIDisplay {
    #[serde(alias = "m_eStatCategory")]
    pub category: String,
    #[serde(alias = "m_eStatType")]
    pub stat_type: String,
}

#[derive(Debug, Deserialize)]
struct RawHeroStatsUI {
    #[serde(rename = "m_eWeaponStatDisplay")]
    weapon_stat_display: String,
    #[serde(rename = "m_vecDisplayStats", default)]
    display_stats: Vec<HeroStatsUIDisplay>,
}

#[derive(Debug, Deserialize)]
struct RawItemSlotInfoValue {
    #[serde(rename = "m_arMaxPurchasesForTier", default)]
    max_purchases_for_tier: Vec<i64>,
}

#[derive(Debug, Deserialize)]
struct RawLevelInfo {
    #[serde(rename = "m_bUseStandardUpgrade", default)]
    use_standard_upgrade: Option<bool>,
    #[serde(rename = "m_mapBonusCurrencies", default)]
    bonus_currencies: Option<IndexMap<String, i64>>,
    #[serde(rename = "m_unRequiredGold")]
    required_gold: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct PurchaseBonus {
    #[serde(alias = "m_ValueType")]
    pub value_type: String,
    #[serde(alias = "m_nTier")]
    pub tier: i64,
    #[serde(alias = "m_strValue")]
    pub value: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct ScalingStat {
    #[serde(alias = "eScalingStat")]
    pub scaling_stat: String,
    #[serde(alias = "flScale")]
    pub scale: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct MapModCostBonus {
    #[serde(alias = "nGoldThreshold")]
    pub gold_threshold: i64,
    #[serde(alias = "flBonus")]
    pub bonus: f64,
    #[serde(alias = "flPercentOnGraph")]
    pub percent_on_graph: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct DraftBucketing {
    #[serde(default, alias = "m_strBucket")]
    pub bucket: Option<String>,
    #[serde(default, alias = "m_flWeight")]
    pub weight: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_excessive_bools)]
struct RawHero {
    #[serde(rename = "m_HeroID")]
    id: u32,
    #[serde(rename = "m_bPlayerSelectable", default)]
    player_selectable: bool,
    #[serde(rename = "m_bDisabled", default)]
    disabled: bool,
    #[serde(rename = "m_bInDevelopment", default)]
    in_development: bool,
    #[serde(rename = "m_bNeedsTesting", default)]
    needs_testing: bool,
    #[serde(rename = "m_bAssignedPlayersOnly", default)]
    assigned_players_only: bool,
    #[serde(default, rename = "m_bAvailableInHeroLabs")]
    _available_in_hero_labs: Option<bool>,
    #[serde(default, rename = "m_bPrereleaseOnly")]
    prerelease_only: Option<bool>,
    #[serde(rename = "m_bLimitedTesting", default)]
    limited_testing: bool,
    #[serde(rename = "m_nComplexity")]
    complexity: i64,
    #[serde(rename = "m_nModelSkin", default)]
    skin: i64,
    #[serde(rename = "m_mapStartingStats")]
    starting_stats: RawStartingStats,

    #[serde(default, rename = "m_strIconHeroCard")]
    icon_hero_card: Option<String>,
    #[serde(default, rename = "m_strIconImageSmall")]
    icon_image_small: Option<String>,
    #[serde(default, rename = "m_strMinimapImage")]
    minimap_image: Option<String>,
    #[serde(default, rename = "m_strLogoImageEnglish")]
    name_image: Option<String>,
    #[serde(default, rename = "m_strIconHeroCardCritical")]
    hero_card_critical: Option<String>,
    #[serde(default, rename = "m_strIconHeroCardGloat")]
    hero_card_gloat: Option<String>,
    #[serde(default, rename = "m_strTopBarVertical")]
    top_bar_vertical_image: Option<String>,

    #[serde(default, rename = "m_vecHeroTags")]
    tags: Option<Vec<String>>,
    #[serde(default, rename = "m_strGunTag")]
    gun_tag: Option<String>,
    #[serde(default, rename = "m_strHideoutRichPresence")]
    hideout_rich_presence: Option<String>,
    #[serde(default, rename = "m_eHeroType")]
    hero_type: Option<String>,

    #[serde(rename = "m_ShopStatDisplay")]
    shop_stat_display: RawShopStatDisplay,
    #[serde(default, rename = "m_MapModCostBonuses")]
    cost_bonuses: IndexMap<String, Vec<MapModCostBonus>>,

    #[serde(rename = "m_colorUI")]
    color_ui: [u8; 3],

    #[serde(default, rename = "m_flCollisionHeight")]
    collision_height: Option<f64>,
    #[serde(default, rename = "m_flCollisionRadius")]
    collision_radius: Option<f64>,
    #[serde(default, rename = "m_flFootstepSoundTravelDistanceMeters")]
    footstep_sound_travel_distance_meters: Option<f64>,
    #[serde(rename = "m_flStealthSpeedMetersPerSecond")]
    stealth_speed_meters_per_second: f64,
    #[serde(default, rename = "m_flStepHeight")]
    step_height: Option<f64>,
    #[serde(default, rename = "m_flStepSoundTime")]
    step_sound_time: Option<f64>,
    #[serde(default, rename = "m_flStepSoundTimeSprinting")]
    step_sound_time_sprinting: Option<f64>,

    #[serde(rename = "m_heroStatsDisplay")]
    stats_display: RawHeroStatsDisplay,
    #[serde(rename = "m_heroStatsUI")]
    hero_stats_ui: RawHeroStatsUI,

    #[serde(rename = "m_mapBoundAbilities")]
    items: IndexMap<String, String>,
    #[serde(rename = "m_mapItemSlotInfo")]
    item_slot_info: IndexMap<String, RawItemSlotInfoValue>,
    #[serde(rename = "m_mapLevelInfo")]
    level_info: IndexMap<String, RawLevelInfo>,
    #[serde(default, rename = "m_mapPurchaseBonuses")]
    purchase_bonuses: IndexMap<String, Vec<PurchaseBonus>>,
    #[serde(default, rename = "m_mapScalingStats")]
    scaling_stats: IndexMap<String, ScalingStat>,
    #[serde(default, rename = "m_mapStandardLevelUpUpgrades")]
    standard_level_up_upgrades: IndexMap<String, f64>,
    #[serde(default, rename = "m_mapItemDraftWeights")]
    item_draft_weights: Option<IndexMap<String, f64>>,
    #[serde(default, rename = "m_mapItemDraftBucketing")]
    item_draft_bucketing: Option<IndexMap<String, Option<DraftBucketing>>>,
}

// ================================================================ Public model

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
#[allow(clippy::struct_excessive_bools, clippy::struct_field_names)]
pub(crate) struct Hero {
    pub id: u32,
    pub class_name: String,
    pub name: String,
    pub description: HeroDescription,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<String, f64>>)]
    #[graphql(skip)]
    pub item_draft_weights: Option<IndexMap<String, f64>>,
    pub player_selectable: bool,
    pub disabled: bool,
    pub in_development: bool,
    pub needs_testing: bool,
    pub assigned_players_only: bool,
    /// Always emitted (empty if the hero declares no `m_vecHeroTags`).
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gun_tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hideout_rich_presence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_type: Option<HeroType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prerelease_only: Option<bool>,
    pub limited_testing: bool,
    pub complexity: i64,
    pub skin: i64,
    pub images: HeroImages,
    #[schema(value_type = StdMap<HeroItemType, String>)]
    #[graphql(skip)]
    pub items: IndexMap<HeroItemType, String>,
    #[graphql(skip)]
    pub starting_stats: StartingStats,
    #[schema(value_type = StdMap<ItemSlotType, ItemSlotInfo>)]
    #[graphql(skip)]
    pub item_slot_info: IndexMap<ItemSlotType, ItemSlotInfo>,
    pub physics: HeroPhysics,
    #[graphql(skip)]
    pub colors: HeroColors,
    pub shop_stat_display: ShopStatDisplay,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<ItemSlotType, Vec<MapModCostBonus>>>)]
    #[graphql(skip)]
    pub cost_bonuses: Option<IndexMap<ItemSlotType, Vec<MapModCostBonus>>>,
    pub stats_display: StatsDisplay,
    pub hero_stats_ui: HeroStatsUI,
    #[schema(value_type = StdMap<String, LevelInfo>)]
    #[graphql(skip)]
    pub level_info: IndexMap<String, LevelInfo>,
    #[schema(value_type = StdMap<String, ScalingStat>)]
    #[graphql(skip)]
    pub scaling_stats: IndexMap<String, ScalingStat>,
    #[schema(value_type = StdMap<ItemSlotType, Vec<PurchaseBonus>>)]
    #[graphql(skip)]
    pub purchase_bonuses: IndexMap<ItemSlotType, Vec<PurchaseBonus>>,
    #[schema(value_type = StdMap<String, f64>)]
    #[graphql(skip)]
    pub standard_level_up_upgrades: IndexMap<String, f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<String, Option<DraftBucketing>>>)]
    #[graphql(skip)]
    pub item_draft_bucketing: Option<IndexMap<String, Option<DraftBucketing>>>,
}

#[ComplexObject(rename_fields = "snake_case")]
impl Hero {
    async fn item_draft_weights(&self) -> Json<Option<IndexMap<String, f64>>> {
        Json(self.item_draft_weights.clone())
    }
    async fn items(&self) -> Json<IndexMap<HeroItemType, String>> {
        Json(self.items.clone())
    }
    async fn starting_stats(&self) -> Json<StartingStats> {
        Json(self.starting_stats.clone())
    }
    async fn item_slot_info(&self) -> Json<IndexMap<ItemSlotType, ItemSlotInfo>> {
        Json(self.item_slot_info.clone())
    }
    async fn colors(&self) -> Json<HeroColors> {
        Json(self.colors.clone())
    }
    async fn cost_bonuses(&self) -> Json<Option<IndexMap<ItemSlotType, Vec<MapModCostBonus>>>> {
        Json(self.cost_bonuses.clone())
    }
    async fn level_info(&self) -> Json<IndexMap<String, LevelInfo>> {
        Json(self.level_info.clone())
    }
    async fn scaling_stats(&self) -> Json<IndexMap<String, ScalingStat>> {
        Json(self.scaling_stats.clone())
    }
    async fn purchase_bonuses(&self) -> Json<IndexMap<ItemSlotType, Vec<PurchaseBonus>>> {
        Json(self.purchase_bonuses.clone())
    }
    async fn standard_level_up_upgrades(&self) -> Json<IndexMap<String, f64>> {
        Json(self.standard_level_up_upgrades.clone())
    }
    async fn item_draft_bucketing(&self) -> Json<Option<IndexMap<String, Option<DraftBucketing>>>> {
        Json(self.item_draft_bucketing.clone())
    }
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroDescription {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lore: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playstyle: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroImages {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_hero_card: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_hero_card_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_image_small: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_image_small_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_card_critical: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_card_critical_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_card_gloat: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_card_gloat_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_bar_vertical_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_bar_vertical_image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image_webp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_image: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroPhysics {
    pub stealth_speed_meters_per_second: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collision_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collision_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footstep_sound_travel_distance_meters: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_sound_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_sound_time_sprinting: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct HeroColors {
    pub ui: [u8; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<[u8; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_hex: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
#[allow(clippy::struct_field_names)]
pub(crate) struct ShopStatDisplay {
    pub spirit_stats_display: ShopSpiritStatsDisplay,
    pub vitality_stats_display: ShopVitalityStatsDisplay,
    pub weapon_stats_display: ShopWeaponStatsDisplay,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct ShopSpiritStatsDisplay {
    pub display_stats: Vec<String>,
}
#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct ShopVitalityStatsDisplay {
    pub display_stats: Vec<String>,
    pub other_display_stats: Vec<String>,
}
#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct ShopWeaponStatsDisplay {
    pub display_stats: Vec<String>,
    pub other_display_stats: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_attributes: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_image_webp: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
#[allow(clippy::struct_field_names)]
pub(crate) struct StatsDisplay {
    pub health_header_stats: Vec<String>,
    pub health_stats: Vec<String>,
    pub magic_header_stats: Vec<String>,
    pub magic_stats: Vec<String>,
    pub weapon_header_stats: Vec<String>,
    pub weapon_stats: Vec<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroStatsUI {
    pub weapon_stat_display: String,
    pub display_stats: Vec<HeroStatsUIDisplay>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct StartingStat {
    #[schema(value_type = f64)]
    pub value: serde_json::Number,
    pub display_stat_name: &'static str,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct StartingStats {
    pub max_move_speed: StartingStat,
    pub sprint_speed: StartingStat,
    pub crouch_speed: StartingStat,
    pub move_acceleration: StartingStat,
    pub light_melee_damage: StartingStat,
    pub heavy_melee_damage: StartingStat,
    pub max_health: StartingStat,
    pub weapon_power: StartingStat,
    pub reload_speed: StartingStat,
    pub weapon_power_scale: StartingStat,
    pub proc_build_up_rate_scale: StartingStat,
    pub stamina: StartingStat,
    pub base_health_regen: StartingStat,
    pub stamina_regen_per_second: StartingStat,
    pub ability_resource_max: StartingStat,
    pub ability_resource_regen_per_second: StartingStat,
    pub crit_damage_received_scale: StartingStat,
    pub tech_duration: StartingStat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tech_armor_damage_reduction: Option<StartingStat>,
    pub tech_range: StartingStat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_armor_damage_reduction: Option<StartingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ground_dash_distance_in_meters: Option<StartingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ground_dash_duration: Option<StartingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_dash_distance_in_meters: Option<StartingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_dash_duration: Option<StartingStat>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ItemSlotInfo {
    pub max_purchases_for_tier: Vec<i64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct LevelInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_standard_upgrade: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bonus_currencies: Option<Vec<String>>,
    pub required_gold: i64,
}

// ============================================================== Enum normalization

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq, ToSchema, EnumString, Enum)]
#[serde(rename_all = "snake_case")]
#[strum(ascii_case_insensitive)]
pub(crate) enum HeroType {
    #[strum(serialize = "ECitadelHeroType_Assassin")]
    Assassin,
    #[strum(serialize = "ECitadelHeroType_Brawler")]
    Brawler,
    #[strum(serialize = "ECitadelHeroType_Marksman")]
    Marksman,
    #[strum(serialize = "ECitadelHeroType_Mystic")]
    Mystic,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, Hash, ToSchema, EnumString)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ItemSlotType {
    #[strum(serialize = "EItemSlotType_WeaponMod")]
    Weapon,
    #[strum(serialize = "EItemSlotType_Tech")]
    Spirit,
    #[strum(serialize = "EItemSlotType_Armor")]
    Vitality,
}

/// Build the public list of heroes from raw source bytes.
///
/// `localization` is the merged `<lang>.json` map already produced upstream
/// (string key → translated string). `only_active`, when true, filters out
/// heroes that aren't player-selectable or are otherwise disabled.
pub(crate) fn build_heroes(
    heroes_vdata: &str,
    localization: &HashMap<String, String>,
    style_css: &str,
    bg_css: &str,
    only_active: bool,
) -> Result<Vec<Hero>, AssetsError> {
    let root: IndexMap<String, serde_json::Value> = kv3::from_str(heroes_vdata)?;
    let style_colors = css::parse_hero_style_colors(style_css);
    let backgrounds = css::parse_hero_backgrounds(bg_css);
    Ok(transform_root(
        &root,
        localization,
        &style_colors,
        &backgrounds,
        only_active,
    ))
}

fn transform_root(
    root: &IndexMap<String, serde_json::Value>,
    localization: &HashMap<String, String>,
    style_colors: &HashMap<String, String>,
    backgrounds: &HashMap<String, String>,
    only_active: bool,
) -> Vec<Hero> {
    let mut out = Vec::with_capacity(root.len());
    for (class_name, value) in root {
        if !class_name.starts_with("hero_")
            || class_name.contains("base")
            || class_name.contains("generic")
            || class_name.contains("dummy")
        {
            continue;
        }
        let raw: RawHero = match serde_json::from_value(value.clone()) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Skipping {class_name}: {e}");
                continue;
            }
        };
        if only_active && (!raw.player_selectable || raw.disabled || raw.in_development) {
            continue;
        }
        out.push(transform(
            class_name,
            raw,
            localization,
            style_colors,
            backgrounds,
        ));
    }
    out
}

#[allow(clippy::too_many_lines)]
fn transform(
    class_name: &str,
    r: RawHero,
    loc: &HashMap<String, String>,
    style_colors: &HashMap<String, String>,
    backgrounds: &HashMap<String, String>,
) -> Hero {
    let name = loc
        .get(&format!("{class_name}:n"))
        .or_else(|| loc.get(class_name))
        .or_else(|| loc.get(&format!("Steam_RP_{class_name}")))
        .cloned()
        .unwrap_or_else(|| class_name.to_owned())
        .trim()
        .replace("#|f|#", "")
        .replace("#|m|#", "");

    let description = HeroDescription {
        lore: loc.get(&format!("{class_name}_lore")).cloned(),
        role: loc.get(&format!("{class_name}_role")).cloned(),
        playstyle: loc.get(&format!("{class_name}_playstyle")).cloned(),
    };

    let tags: Vec<String> = r
        .tags
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|t| localization::localize(loc, t))
        .collect();

    let gun_tag = r.gun_tag.as_ref().map(|g| localization::localize(loc, g));

    let hideout_rich_presence = r.hideout_rich_presence.as_ref().map(|h| {
        let key = h.trim_start_matches('#');
        let fallback_key = if h == "#Steam_Citadel_Hideout_Rant" {
            "Steam_Citadel_Hideout_Ranting"
        } else {
            key
        };
        loc.get(key)
            .or_else(|| loc.get(fallback_key))
            .cloned()
            .unwrap_or_else(|| h.clone())
    });

    let bg_raw = backgrounds.get(class_name).cloned();
    let images = build_images(&r, bg_raw.as_deref());

    let physics = HeroPhysics {
        stealth_speed_meters_per_second: r.stealth_speed_meters_per_second,
        collision_height: r.collision_height,
        collision_radius: r.collision_radius,
        step_height: r.step_height,
        footstep_sound_travel_distance_meters: r.footstep_sound_travel_distance_meters,
        step_sound_time: r.step_sound_time,
        step_sound_time_sprinting: r.step_sound_time_sprinting,
    };

    let style_hex = style_colors.get(class_name).cloned();
    let style_rgb = style_hex.as_deref().and_then(hex_to_rgb);
    let colors = HeroColors {
        ui: r.color_ui,
        style: style_rgb,
        style_hex,
    };

    let items: IndexMap<HeroItemType, String> = r
        .items
        .into_iter()
        .filter_map(|(k, v)| k.parse().ok().map(|k| (k, v)))
        .collect();

    let item_slot_info: IndexMap<ItemSlotType, ItemSlotInfo> = r
        .item_slot_info
        .into_iter()
        .filter_map(|(k, v)| {
            k.parse().ok().map(|k| {
                (
                    k,
                    ItemSlotInfo {
                        max_purchases_for_tier: v.max_purchases_for_tier,
                    },
                )
            })
        })
        .collect();

    let cost_bonuses: IndexMap<ItemSlotType, Vec<MapModCostBonus>> = r
        .cost_bonuses
        .into_iter()
        .filter_map(|(k, v)| k.parse().ok().map(|k| (k, v)))
        .collect();

    let purchase_bonuses: IndexMap<ItemSlotType, Vec<PurchaseBonus>> = r
        .purchase_bonuses
        .into_iter()
        .filter_map(|(k, v)| k.parse().ok().map(|k| (k, v)))
        .collect();

    let level_info: IndexMap<String, LevelInfo> = r
        .level_info
        .into_iter()
        .map(|(k, v)| {
            (
                k,
                LevelInfo {
                    use_standard_upgrade: v.use_standard_upgrade,
                    bonus_currencies: v
                        .bonus_currencies
                        .map(|m| m.into_iter().map(|(k, _)| k).collect()),
                    required_gold: v.required_gold,
                },
            )
        })
        .collect();

    Hero {
        id: r.id,
        class_name: class_name.to_owned(),
        name,
        description,
        item_draft_weights: r.item_draft_weights,
        player_selectable: r.player_selectable,
        disabled: r.disabled,
        in_development: r.in_development,
        needs_testing: r.needs_testing,
        assigned_players_only: r.assigned_players_only,
        tags,
        gun_tag,
        hideout_rich_presence,
        hero_type: r.hero_type.as_deref().and_then(|s| s.parse().ok()),
        prerelease_only: r.prerelease_only,
        limited_testing: r.limited_testing,
        complexity: r.complexity,
        skin: r.skin,
        images,
        items,
        starting_stats: build_starting_stats(&r.starting_stats),
        item_slot_info,
        physics,
        colors,
        shop_stat_display: build_shop_stat_display(r.shop_stat_display),
        cost_bonuses: if cost_bonuses.is_empty() {
            None
        } else {
            Some(cost_bonuses)
        },
        stats_display: StatsDisplay {
            health_header_stats: r.stats_display.health_header_stats,
            health_stats: r.stats_display.health_stats,
            magic_header_stats: r.stats_display.magic_header_stats,
            magic_stats: r.stats_display.magic_stats,
            weapon_header_stats: r.stats_display.weapon_header_stats,
            weapon_stats: r.stats_display.weapon_stats,
        },
        hero_stats_ui: HeroStatsUI {
            weapon_stat_display: r.hero_stats_ui.weapon_stat_display,
            display_stats: r.hero_stats_ui.display_stats,
        },
        level_info,
        scaling_stats: r.scaling_stats,
        purchase_bonuses,
        standard_level_up_upgrades: r.standard_level_up_upgrades,
        item_draft_bucketing: r.item_draft_bucketing,
    }
}

fn build_shop_stat_display(r: RawShopStatDisplay) -> ShopStatDisplay {
    let weapon_image = extract_image_url(r.e_weapon_stats_display.weapon_image.as_deref());
    let weapon_image_webp = weapon_image.as_deref().map(png_to_webp);
    ShopStatDisplay {
        spirit_stats_display: ShopSpiritStatsDisplay {
            display_stats: r.e_spirit_stats_display.display_stats,
        },
        vitality_stats_display: ShopVitalityStatsDisplay {
            display_stats: r.e_vitality_stats_display.display_stats,
            other_display_stats: r.e_vitality_stats_display.other_display_stats,
        },
        weapon_stats_display: ShopWeaponStatsDisplay {
            display_stats: r.e_weapon_stats_display.display_stats,
            other_display_stats: r.e_weapon_stats_display.other_display_stats,
            weapon_attributes: r
                .e_weapon_stats_display
                .weapon_attributes
                .as_deref()
                .map(|s| s.split('|').map(|p| p.trim().to_owned()).collect())
                .or(Some(Vec::new())),
            weapon_image,
            weapon_image_webp,
        },
    }
}

#[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
fn build_starting_stats(s: &RawStartingStats) -> StartingStats {
    macro_rules! mk {
        ($v:expr, $name:literal) => {
            StartingStat {
                value: serde_json::Number::from_f64($v)
                    .and_then(|n| {
                        // Use integer form when the value rounds cleanly.
                        let f = n.as_f64().unwrap_or($v);
                        if f.fract() == 0.0 && f.abs() < (i64::MAX as f64) {
                            Some(serde_json::Number::from(f as i64))
                        } else {
                            Some(n)
                        }
                    })
                    .unwrap_or_else(|| serde_json::Number::from(0)),
                display_stat_name: $name,
            }
        };
        ($v:expr, $name:literal, float) => {
            StartingStat {
                value: serde_json::Number::from_f64($v)
                    .unwrap_or_else(|| serde_json::Number::from(0)),
                display_stat_name: $name,
            }
        };
    }
    StartingStats {
        max_move_speed: mk!(s.e_max_move_speed, "EMaxMoveSpeed", float),
        sprint_speed: mk!(s.e_sprint_speed, "ESprintSpeed", float),
        crouch_speed: mk!(s.e_crouch_speed, "ECrouchSpeed", float),
        move_acceleration: mk!(s.e_move_acceleration, "EMoveAcceleration", float),
        light_melee_damage: mk!(s.e_light_melee_damage, "ELightMeleeDamage", float),
        heavy_melee_damage: mk!(s.e_heavy_melee_damage, "EHeavyMeleeDamage"),
        max_health: mk!(s.e_max_health, "EMaxHealth"),
        weapon_power: mk!(s.e_weapon_power, "EWeaponPower"),
        reload_speed: mk!(s.e_reload_speed, "EReloadSpeed"),
        weapon_power_scale: mk!(s.e_weapon_power_scale, "EWeaponPowerScale"),
        proc_build_up_rate_scale: mk!(s.e_proc_build_up_rate_scale, "EProcBuildUpRateScale"),
        stamina: mk!(s.e_stamina, "EStamina"),
        base_health_regen: mk!(s.e_base_health_regen, "EBaseHealthRegen", float),
        stamina_regen_per_second: mk!(
            s.e_stamina_regen_per_second,
            "EStaminaRegenPerSecond",
            float
        ),
        ability_resource_max: mk!(s.e_ability_resource_max, "EAbilityResourceMax"),
        ability_resource_regen_per_second: mk!(
            s.e_ability_resource_regen_per_second,
            "EAbilityResourceRegenPerSecond"
        ),
        crit_damage_received_scale: mk!(
            s.e_crit_damage_received_scale,
            "ECritDamageReceivedScale",
            float
        ),
        tech_duration: mk!(s.e_tech_duration, "ETechDuration"),
        tech_armor_damage_reduction: s
            .e_tech_armor_damage_reduction
            .map(|v| mk!(v, "ETechArmorDamageReduction", float)),
        tech_range: mk!(s.e_tech_range, "ETechRange"),
        bullet_armor_damage_reduction: s
            .e_bullet_armor_damage_reduction
            .map(|v| mk!(v, "EBulletArmorDamageReduction", float)),
        ground_dash_distance_in_meters: s
            .e_ground_dash_distance_in_meters
            .map(|v| mk!(v, "EGroundDashDistanceInMeters", float)),
        ground_dash_duration: s
            .e_ground_dash_duration
            .map(|v| mk!(v, "EGroundDashDuration", float)),
        air_dash_distance_in_meters: s
            .e_air_dash_distance_in_meters
            .map(|v| mk!(v, "EAirDashDistanceInMeters", float)),
        air_dash_duration: s
            .e_air_dash_duration
            .map(|v| mk!(v, "EAirDashDuration", float)),
    }
}

fn build_images(r: &RawHero, background_raw: Option<&str>) -> HeroImages {
    let icon_hero_card = extract_image_url(r.icon_hero_card.as_deref());
    let icon_image_small = extract_image_url(r.icon_image_small.as_deref());
    let minimap_image = extract_image_url(r.minimap_image.as_deref());
    let hero_card_critical = extract_image_url(r.hero_card_critical.as_deref());
    let hero_card_gloat = extract_image_url(r.hero_card_gloat.as_deref());
    let top_bar_vertical_image = extract_image_url(r.top_bar_vertical_image.as_deref());

    // Backgrounds come from CSS — wrap them as `panorama:"file://{images}/<path>"`
    // before running `parse_img_path` so the shared parser can handle them.
    let background_image = background_raw.and_then(|raw| {
        let trimmed = raw
            .strip_prefix('"')
            .unwrap_or(raw)
            .replace("_psd.vtex", ".psd");
        let after_images = trimmed.split_once("images/").map(|(_, t)| t.to_owned())?;
        let wrapped = format!("panorama:\"file://{{images}}/{after_images}\"");
        parse_img_path(&wrapped)
    });

    HeroImages {
        icon_hero_card_webp: icon_hero_card.as_deref().map(png_to_webp),
        icon_hero_card,
        icon_image_small_webp: icon_image_small.as_deref().map(png_to_webp),
        icon_image_small,
        minimap_image_webp: minimap_image.as_deref().map(png_to_webp),
        minimap_image,
        hero_card_critical_webp: hero_card_critical.as_deref().map(png_to_webp),
        hero_card_critical,
        hero_card_gloat_webp: hero_card_gloat.as_deref().map(png_to_webp),
        hero_card_gloat,
        top_bar_vertical_image_webp: top_bar_vertical_image.as_deref().map(png_to_webp),
        top_bar_vertical_image,
        weapon_image: None,
        weapon_image_webp: None,
        background_image_webp: background_image.as_deref().map(png_to_webp),
        background_image,
        name_image: parse_img_path(r.name_image.as_deref().unwrap_or("")),
    }
}

fn png_to_webp(s: &str) -> String {
    s.replace(".png", ".webp")
}

fn hex_to_rgb(h: &str) -> Option<[u8; 3]> {
    let h = h.trim_start_matches('#');
    if h.len() < 6 {
        return None;
    }
    let r = u8::from_str_radix(&h[0..2], 16).ok()?;
    let g = u8::from_str_radix(&h[2..4], 16).ok()?;
    let b = u8::from_str_radix(&h[4..6], 16).ok()?;
    Some([r, g, b])
}

fn extract_image_url(v: Option<&str>) -> Option<String> {
    let v = v?;
    if v.is_empty() {
        return None;
    }
    let split_index = ["abilities/", "upgrades/", "hud/", "heroes/"]
        .iter()
        .find_map(|p| v.find(p))
        .unwrap_or(0);
    Some(format!(
        "{IMAGE_BASE_URL}/{}",
        normalize_image_suffix(&v[split_index..])
    ))
}

/// Collapse Source 2's `_psd.vtex` / `_png.vtex` panorama suffixes down to the
/// `.png` extension served by the CDN. Order matters: the compound suffixes
/// must be rewritten before the bare `_psd.` / `_png.` / `.psd` rules, or
/// `_psd.vtex` becomes `.vtex` and never reaches `.png`.
fn normalize_image_suffix(s: &str) -> String {
    s.replace('"', "")
        .replace("_psd.vtex", ".png")
        .replace("_png.vtex", ".png")
        .replace("_psd.", ".")
        .replace("_png.", ".")
        .replace(".psd", ".png")
}

/// Returns `None` for empty input.
fn parse_img_path(v: &str) -> Option<String> {
    if v.is_empty() {
        return None;
    }

    // Prefer the longest meaningful tail: an `abilities/`, `upgrades/`, or
    // `hud/` prefix anywhere in the path; failing that, the segment after the
    // *last* `{images}/` placeholder.
    let tail: &str = if let Some(i) = ["abilities/", "upgrades/", "hud/"]
        .iter()
        .find_map(|p| v.find(p))
    {
        &v[i..]
    } else if let Some((_, t)) = v.rsplit_once("{images}/") {
        t
    } else if !std::path::Path::new(v)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("svg"))
    {
        // Plain relative path — no markers, not an svg.
        let cleaned = normalize_image_suffix(v)
            .replace(".vsvg", ".svg")
            .replace("images/images", "images");
        return Some(format!("{IMAGE_BASE_URL}/{cleaned}"));
    } else {
        v
    };

    let s = normalize_image_suffix(tail).replace(".vsvg", ".svg");
    if std::path::Path::new(&s)
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("svg"))
    {
        let leaf = s.rsplit('/').next().unwrap_or(&s);
        Some(format!("{SVGS_BASE_URL}/{leaf}"))
    } else {
        Some(format!("{IMAGE_BASE_URL}/{s}"))
    }
}

#[derive(Clone)]
struct ParsedSources {
    raw_root: Arc<IndexMap<String, serde_json::Value>>,
    style_colors: Arc<HashMap<String, String>>,
    backgrounds: Arc<HashMap<String, String>>,
}

#[cached(
    max_size = 8,
    ttl = 86400,
    convert = "{ version }",
    key = "u32",
    sync_writes = "by_key"
)]
async fn parsed_version_sources(r2: &AmazonS3, version: u32) -> Result<ParsedSources, AssetsError> {
    // CSS files are optional: a NotFound leaves the lookup empty so the
    // per-hero `background_image*` / `colors.style*` fields serialize as null.
    let (vdata, style_css, bg_css) = tokio::try_join!(
        store::fetch_text(r2, version, "scripts/heroes.vdata"),
        fetch_optional_text(r2, version, "styles/citadel_base_styles.css"),
        fetch_optional_text(r2, version, "styles/hero_background_default.css"),
    )?;
    let raw_root: IndexMap<String, serde_json::Value> = kv3::from_str(&vdata)?;
    Ok(ParsedSources {
        raw_root: Arc::new(raw_root),
        style_colors: Arc::new(
            style_css
                .as_deref()
                .map(css::parse_hero_style_colors)
                .unwrap_or_default(),
        ),
        backgrounds: Arc::new(
            bg_css
                .as_deref()
                .map(css::parse_hero_backgrounds)
                .unwrap_or_default(),
        ),
    })
}

async fn fetch_optional_text(
    r2: &AmazonS3,
    version: u32,
    rel_path: &str,
) -> Result<Option<String>, store::VersionStoreError> {
    match store::fetch_text(r2, version, rel_path).await {
        Ok(s) => Ok(Some(s)),
        Err(store::VersionStoreError::ObjectStore(object_store::Error::NotFound { .. })) => {
            tracing::debug!("v{version}: optional asset {rel_path} not found, skipping");
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

#[cached(
    max_size = 64,
    ttl = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)",
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_heroes(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<Hero>>, AssetsError> {
    let (sources, loc) = tokio::try_join!(
        parsed_version_sources(r2, version),
        localization::fetch_localization(r2, version, language),
    )?;
    let heroes = build_from_sources(&sources, &loc);
    Ok(Arc::new(heroes))
}

fn build_from_sources(s: &ParsedSources, localization: &HashMap<String, String>) -> Vec<Hero> {
    transform_root(
        &s.raw_root,
        localization,
        &s.style_colors,
        &s.backgrounds,
        false,
    )
}
