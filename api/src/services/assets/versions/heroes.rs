//! Build the `/v2/heroes` response from the versioned source files.
//!
//! Pipeline (per request):
//!
//! ```text
//! scripts/heroes.vdata.zst        ──► kv3::from_str   ─┐
//! localization/<lang>.json.zst    ──► serde_json      ─┤
//! styles/citadel_base_styles.css  ──► css::parse_*    ─┼─► Vec<HeroV2>
//! styles/hero_background_…css     ──► css::parse_*    ─┘
//! ```
//!
//! The legacy python implementation lives at
//! `deadlock-assets-api/scripts/standalone_heroes_v2.py`; this is a port of
//! its output, kept as close to byte-for-byte equivalent as practical.

use std::collections::HashMap;
use std::collections::HashMap as StdMap;
use std::sync::Arc;
use std::time::Duration;

use cached::LruTtlCache;
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::services::assets::versions::css;
use crate::services::assets::versions::store;
use crate::utils::kv3;

const IMAGE_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/images";
const SVGS_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

#[derive(Debug, thiserror::Error)]
pub(crate) enum HeroesError {
    #[error("KV3 parse error: {0}")]
    Kv3(#[from] kv3::Kv3Error),
    #[error("Localization parse error: {0}")]
    Localization(#[from] serde_json::Error),
    #[error("Asset fetch error: {0}")]
    Store(#[from] store::VersionStoreError),
}

// ============================================================== Raw KV3 model
//
// Only the fields needed for the public output are bound. The KV3 parser
// preserves nested-object ordering, so `IndexMap` keeps insertion order for
// the map-shaped fields.

/// All starting-stat slots are stored as `f64` so the same struct accepts
/// the kv3 source whether values were authored as `830` or `830.0` —
/// the python pipeline does the same via pydantic coercion.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
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
struct RawShopStatDisplay {
    #[serde(rename = "m_eSpiritStatsDisplay")]
    e_spirit_stats_display: RawShopSpiritStatsDisplay,
    #[serde(rename = "m_eVitalityStatsDisplay")]
    e_vitality_stats_display: RawShopVitalityStatsDisplay,
    #[serde(rename = "m_eWeaponStatsDisplay")]
    e_weapon_stats_display: RawShopWeaponStatsDisplay,
}

#[derive(Debug, Deserialize)]
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

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
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

/// Per-key serialization order matches the python `HeroV2` field order.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct HeroV2 {
    pub id: u32,
    pub class_name: String,
    pub name: String,
    pub description: HeroDescription,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<String, f64>>)]
    pub item_draft_weights: Option<IndexMap<String, f64>>,
    pub player_selectable: bool,
    pub disabled: bool,
    pub in_development: bool,
    pub needs_testing: bool,
    pub assigned_players_only: bool,
    /// Always emitted (empty if the hero declares no `m_vecHeroTags`) to match
    /// the python pipeline which coerces missing tag lists to `[]`.
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
    pub items: IndexMap<HeroItemType, String>,
    pub starting_stats: StartingStats,
    #[schema(value_type = StdMap<ItemSlotType, ItemSlotInfo>)]
    pub item_slot_info: IndexMap<ItemSlotType, ItemSlotInfo>,
    pub physics: HeroPhysics,
    pub colors: HeroColors,
    pub shop_stat_display: ShopStatDisplay,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<ItemSlotType, Vec<MapModCostBonus>>>)]
    pub cost_bonuses: Option<IndexMap<ItemSlotType, Vec<MapModCostBonus>>>,
    pub stats_display: StatsDisplay,
    pub hero_stats_ui: HeroStatsUI,
    #[schema(value_type = StdMap<String, LevelInfo>)]
    pub level_info: IndexMap<String, LevelInfo>,
    #[schema(value_type = StdMap<String, ScalingStat>)]
    pub scaling_stats: IndexMap<String, ScalingStat>,
    #[schema(value_type = StdMap<ItemSlotType, Vec<PurchaseBonus>>)]
    pub purchase_bonuses: IndexMap<ItemSlotType, Vec<PurchaseBonus>>,
    #[schema(value_type = StdMap<String, f64>)]
    pub standard_level_up_upgrades: IndexMap<String, f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<String, Option<DraftBucketing>>>)]
    pub item_draft_bucketing: Option<IndexMap<String, Option<DraftBucketing>>>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct HeroDescription {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lore: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playstyle: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
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

#[derive(Debug, Serialize, Clone, ToSchema)]
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

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ShopStatDisplay {
    pub spirit_stats_display: ShopSpiritStatsDisplay,
    pub vitality_stats_display: ShopVitalityStatsDisplay,
    pub weapon_stats_display: ShopWeaponStatsDisplay,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ShopSpiritStatsDisplay {
    pub display_stats: Vec<String>,
}
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ShopVitalityStatsDisplay {
    pub display_stats: Vec<String>,
    pub other_display_stats: Vec<String>,
}
#[derive(Debug, Serialize, Clone, ToSchema)]
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

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct StatsDisplay {
    pub health_header_stats: Vec<String>,
    pub health_stats: Vec<String>,
    pub magic_header_stats: Vec<String>,
    pub magic_stats: Vec<String>,
    pub weapon_header_stats: Vec<String>,
    pub weapon_stats: Vec<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
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

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HeroType {
    Assassin,
    Brawler,
    Marksman,
    Mystic,
}

impl HeroType {
    fn from_kv3(s: &str) -> Option<Self> {
        let s = s
            .strip_prefix("ECitadelHeroType_")
            .unwrap_or(s)
            .to_ascii_lowercase();
        Some(match s.as_str() {
            "assassin" => Self::Assassin,
            "brawler" => Self::Brawler,
            "marksman" => Self::Marksman,
            "mystic" => Self::Mystic,
            _ => return None,
        })
    }
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, Hash, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HeroItemType {
    WeaponPrimary,
    WeaponSecondary,
    WeaponMelee,
    AbilityMantle,
    AbilityJump,
    AbilitySlide,
    AbilityZipLine,
    AbilityZipLineBoost,
    AbilityClimbRope,
    #[serde(rename = "ability_innate1")]
    AbilityInnate1,
    #[serde(rename = "ability_innate2")]
    AbilityInnate2,
    #[serde(rename = "ability_innate3")]
    AbilityInnate3,
    #[serde(rename = "signature1")]
    Signature1,
    #[serde(rename = "signature2")]
    Signature2,
    #[serde(rename = "signature3")]
    Signature3,
    #[serde(rename = "signature4")]
    Signature4,
    EslotCosmetic1,
}

impl HeroItemType {
    fn from_kv3(s: &str) -> Option<Self> {
        Some(match s {
            "ESlot_Weapon_Primary" => Self::WeaponPrimary,
            "ESlot_Weapon_Secondary" => Self::WeaponSecondary,
            "ESlot_Weapon_Melee" => Self::WeaponMelee,
            "ESlot_Ability_Mantle" => Self::AbilityMantle,
            "ESlot_Ability_Jump" => Self::AbilityJump,
            "ESlot_Ability_Slide" => Self::AbilitySlide,
            "ESlot_Ability_ZipLine" => Self::AbilityZipLine,
            "ESlot_Ability_ZipLineBoost" => Self::AbilityZipLineBoost,
            "ESlot_Ability_ClimbRope" => Self::AbilityClimbRope,
            "ESlot_Ability_Innate_1" => Self::AbilityInnate1,
            "ESlot_Ability_Innate_2" => Self::AbilityInnate2,
            "ESlot_Ability_Innate_3" => Self::AbilityInnate3,
            "ESlot_Signature_1" => Self::Signature1,
            "ESlot_Signature_2" => Self::Signature2,
            "ESlot_Signature_3" => Self::Signature3,
            "ESlot_Signature_4" => Self::Signature4,
            "ESlot_Cosmetic_1" => Self::EslotCosmetic1,
            _ => return None,
        })
    }
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, Hash, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ItemSlotType {
    Weapon,
    Spirit,
    Vitality,
}

impl ItemSlotType {
    fn from_kv3(s: &str) -> Option<Self> {
        Some(match s {
            "EItemSlotType_WeaponMod" => Self::Weapon,
            "EItemSlotType_Tech" => Self::Spirit,
            "EItemSlotType_Armor" => Self::Vitality,
            _ => return None,
        })
    }
}

// ====================================================================== Pipeline

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
) -> Result<Vec<HeroV2>, HeroesError> {
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

/// Shared filter+deserialize+transform loop used by both [`build_heroes`]
/// (tests, raw inputs) and the cached production pipeline.
fn transform_root(
    root: &IndexMap<String, serde_json::Value>,
    localization: &HashMap<String, String>,
    style_colors: &HashMap<String, String>,
    backgrounds: &HashMap<String, String>,
    only_active: bool,
) -> Vec<HeroV2> {
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
            class_name.clone(),
            raw,
            localization,
            style_colors,
            backgrounds,
        ));
    }
    out
}

fn transform(
    class_name: String,
    r: RawHero,
    loc: &HashMap<String, String>,
    style_colors: &HashMap<String, String>,
    backgrounds: &HashMap<String, String>,
) -> HeroV2 {
    let name = loc
        .get(&format!("{class_name}:n"))
        .or_else(|| loc.get(&class_name))
        .or_else(|| loc.get(&format!("Steam_RP_{class_name}")))
        .cloned()
        .unwrap_or_else(|| class_name.clone())
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
        .map(|t| {
            let key = t.trim_start_matches('#');
            loc.get(key).cloned().unwrap_or_else(|| t.clone())
        })
        .collect();

    let gun_tag = r.gun_tag.as_ref().map(|g| {
        let key = g.trim_start_matches('#');
        loc.get(key).cloned().unwrap_or_else(|| g.clone())
    });

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

    let bg_raw = backgrounds.get(&class_name).cloned();
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

    let style_hex = style_colors.get(&class_name).cloned();
    let style_rgb = style_hex.as_deref().and_then(hex_to_rgb);
    let colors = HeroColors {
        ui: r.color_ui,
        style: style_rgb,
        style_hex,
    };

    let items: IndexMap<HeroItemType, String> = r
        .items
        .into_iter()
        .filter_map(|(k, v)| HeroItemType::from_kv3(&k).map(|k| (k, v)))
        .collect();

    let item_slot_info: IndexMap<ItemSlotType, ItemSlotInfo> = r
        .item_slot_info
        .into_iter()
        .filter_map(|(k, v)| {
            ItemSlotType::from_kv3(&k).map(|k| {
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
        .filter_map(|(k, v)| ItemSlotType::from_kv3(&k).map(|k| (k, v)))
        .collect();

    let purchase_bonuses: IndexMap<ItemSlotType, Vec<PurchaseBonus>> = r
        .purchase_bonuses
        .into_iter()
        .filter_map(|(k, v)| ItemSlotType::from_kv3(&k).map(|k| (k, v)))
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

    HeroV2 {
        id: r.id,
        class_name: class_name.clone(),
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
        hero_type: r.hero_type.as_deref().and_then(HeroType::from_kv3),
        prerelease_only: r.prerelease_only,
        limited_testing: r.limited_testing,
        complexity: r.complexity,
        skin: r.skin,
        images,
        items,
        starting_stats: build_starting_stats(r.starting_stats),
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

fn build_starting_stats(s: RawStartingStats) -> StartingStats {
    macro_rules! mk {
        ($v:expr, $name:literal) => {
            StartingStat {
                value: serde_json::Number::from_f64($v as f64)
                    .and_then(|n| {
                        // Use integer form when the value rounds cleanly.
                        let f = n.as_f64().unwrap_or($v as f64);
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
        heavy_melee_damage: mk!(s.e_heavy_melee_damage as f64, "EHeavyMeleeDamage"),
        max_health: mk!(s.e_max_health as f64, "EMaxHealth"),
        weapon_power: mk!(s.e_weapon_power as f64, "EWeaponPower"),
        reload_speed: mk!(s.e_reload_speed as f64, "EReloadSpeed"),
        weapon_power_scale: mk!(s.e_weapon_power_scale as f64, "EWeaponPowerScale"),
        proc_build_up_rate_scale: mk!(s.e_proc_build_up_rate_scale as f64, "EProcBuildUpRateScale"),
        stamina: mk!(s.e_stamina as f64, "EStamina"),
        base_health_regen: mk!(s.e_base_health_regen, "EBaseHealthRegen", float),
        stamina_regen_per_second: mk!(
            s.e_stamina_regen_per_second,
            "EStaminaRegenPerSecond",
            float
        ),
        ability_resource_max: mk!(s.e_ability_resource_max as f64, "EAbilityResourceMax"),
        ability_resource_regen_per_second: mk!(
            s.e_ability_resource_regen_per_second as f64,
            "EAbilityResourceRegenPerSecond"
        ),
        crit_damage_received_scale: mk!(
            s.e_crit_damage_received_scale,
            "ECritDamageReceivedScale",
            float
        ),
        tech_duration: mk!(s.e_tech_duration as f64, "ETechDuration"),
        tech_armor_damage_reduction: s
            .e_tech_armor_damage_reduction
            .map(|v| mk!(v, "ETechArmorDamageReduction", float)),
        tech_range: mk!(s.e_tech_range as f64, "ETechRange"),
        bullet_armor_damage_reduction: s
            .e_bullet_armor_damage_reduction
            .map(|v| mk!(v, "EBulletArmorDamageReduction", float)),
    }
}

fn build_images(r: &RawHero, background_raw: Option<&str>) -> HeroImages {
    // NB: `weapon_image` lives on `shop_stat_display.weapon_stats_display` —
    // it is intentionally NOT copied here. The python `HeroImagesV2.from_raw_hero`
    // only iterates top-level RawHero fields, so `images.weapon_image` is always
    // null in its output (the weapon URL surfaces solely under `shop_stat_display`).
    let icon_hero_card = extract_image_url(r.icon_hero_card.as_deref());
    let icon_image_small = extract_image_url(r.icon_image_small.as_deref());
    let minimap_image = extract_image_url(r.minimap_image.as_deref());
    let hero_card_critical = extract_image_url(r.hero_card_critical.as_deref());
    let hero_card_gloat = extract_image_url(r.hero_card_gloat.as_deref());
    let top_bar_vertical_image = extract_image_url(r.top_bar_vertical_image.as_deref());

    // Backgrounds come from CSS — the python wraps them as `panorama:"file://{images}/<path>"`
    // before running parse_img_path. We replicate that synthesized form here.
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

/// Port of the python `extract_image_url` helper.
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

/// Port of the python `parse_img_path` helper. Returns `None` for empty input.
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
    } else if !v.ends_with(".svg") {
        // Plain relative path — no markers, not an svg.
        let cleaned = normalize_image_suffix(v)
            .replace(".vsvg", ".svg")
            .replace("images/images", "images");
        return Some(format!("{IMAGE_BASE_URL}/{cleaned}"));
    } else {
        v
    };

    let s = normalize_image_suffix(tail).replace(".vsvg", ".svg");
    if s.ends_with(".svg") {
        let leaf = s.rsplit('/').next().unwrap_or(&s);
        Some(format!("{SVGS_BASE_URL}/{leaf}"))
    } else {
        Some(format!("{IMAGE_BASE_URL}/{s}"))
    }
}

// =================================================================== Caching
//
// Three cache layers, each backed by `cached::TimedSizedCache` (LRU + TTL) and
// guarded with `sync_writes = "by_key"` so a thundering-herd of concurrent
// first-misses for the same key collapses into a single fetch+parse.
//
// ```text
//                       per (version)               per (version, language)
//                       ────────────────            ───────────────────────
//   R2 raw bytes ──► parsed_version_sources ──► hero_bundle ──► Arc<Vec<HeroV2>>
//   (store.rs)       (KV3 + CSS, ~1s once)      (transform per language)
// ```
//
// Bucket sizes are deliberately small — the live API serves only a handful of
// `(version, language)` pairs in practice (latest + a few neighbours), so
// 8 versions × 16 build entries keeps steady-state memory well under 50 MB
// while still surviving a deploy with multiple in-flight versions.

const SOURCES_CACHE_SIZE: usize = 8;
const BUILT_CACHE_SIZE: usize = 64;
/// Both layers use a long TTL. Files in R2 are immutable per version — we
/// never need to invalidate within a version's lifetime — so the TTL only
/// exists to evict cold entries from idle processes.
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

/// Parsed per-version source artifacts, shared across all language builds.
#[derive(Clone)]
struct ParsedSources {
    /// `m_HeroID → raw KV3 hero blob`, keyed by `class_name`. Stored as
    /// `serde_json::Value` because the per-hero `RawHero` deserialization
    /// runs again in `build_from_sources` (small cost; keeps `RawHero` private).
    raw_root: Arc<IndexMap<String, serde_json::Value>>,
    style_colors: Arc<HashMap<String, String>>,
    backgrounds: Arc<HashMap<String, String>>,
}

/// Layer 1: per-version sources.
///
/// Caches the parsed KV3 root + both CSS lookup tables. Subsequent builds for
/// any language reuse this without re-running the heavy parsers.
#[cached(
    ty = "LruTtlCache<u32, ParsedSources>",
    create = "{ LruTtlCache::builder().size(SOURCES_CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = "{ version }",
    result = true,
    sync_writes = "by_key"
)]
async fn parsed_version_sources(r2: &AmazonS3, version: u32) -> Result<ParsedSources, HeroesError> {
    // The hero metadata is required; the two CSS files are optional decoration
    // (older patches predate `hero_background_default.css`, and a corrupted
    // styles file shouldn't take the whole endpoint down). A NotFound on
    // either CSS just leaves the corresponding lookup map empty so the per-hero
    // `background_image*` and `colors.style*` fields serialize as null.
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

/// Fetch an optional asset: returns `Ok(None)` if the object is missing in R2,
/// `Err` for any other failure (network, decompression, encoding).
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

/// Layer 2: per `(version, language)` localization map.
///
/// Each `localization/<lang>.json` in R2 is already an english-base map with
/// the target language overlaid on top, so we just fetch the one file. If the
/// requested language isn't present for this version (e.g. a newly-added
/// translation hasn't been mirrored yet), fall back to english and log it —
/// the legacy python service does the same so /v2/heroes never 500s on a
/// language gap.
#[cached(
    ty = "LruTtlCache<(u32, String), Arc<HashMap<String, String>>>",
    create = "{ LruTtlCache::builder().size(BUILT_CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
async fn cached_localization(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<HashMap<String, String>>, HeroesError> {
    match store::fetch_text(r2, version, &format!("localization/{language}.json")).await {
        Ok(json) => Ok(Arc::new(serde_json::from_str(&json)?)),
        Err(store::VersionStoreError::ObjectStore(object_store::Error::NotFound { .. }))
            if language != "english" =>
        {
            tracing::warn!(
                "localization/{language}.json missing for v{version}; falling back to english"
            );
            let json = store::fetch_text(r2, version, "localization/english.json").await?;
            Ok(Arc::new(serde_json::from_str(&json)?))
        }
        Err(e) => Err(e.into()),
    }
}

/// Layer 3: per `(version, language)` fully built hero list.
///
/// The list is always built with `only_active = false`; the route layer
/// filters at request time (O(n) over ~60 heroes, negligible).
#[cached(
    ty = "LruTtlCache<(u32, String), Arc<Vec<HeroV2>>>",
    create = "{ LruTtlCache::builder().size(BUILT_CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = r#"{ (version, language.to_owned()) }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_heroes(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<Vec<HeroV2>>, HeroesError> {
    let (sources, localization) = tokio::try_join!(
        parsed_version_sources(r2, version),
        cached_localization(r2, version, language),
    )?;
    let heroes = build_from_sources(&sources, &localization);
    Ok(Arc::new(heroes))
}

/// Build the hero list from already-parsed sources. Always emits the full
/// (unfiltered) list; the route layer filters by `only_active` per request.
fn build_from_sources(s: &ParsedSources, localization: &HashMap<String, String>) -> Vec<HeroV2> {
    transform_root(
        &s.raw_root,
        localization,
        &s.style_colors,
        &s.backgrounds,
        false,
    )
}
