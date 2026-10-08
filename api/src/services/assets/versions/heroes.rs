use std::collections::HashMap as StdMap;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use async_graphql::{ComplexObject, Enum, Json, SimpleObject};
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::EnumString;
use utoipa::ToSchema;

use crate::services::assets::index::{IndexFolder, fetch_index};
use crate::services::assets::versions::common::{HeroItemType, entity_id};
use crate::services::assets::versions::css;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;
use crate::services::assets::versions::store;
use crate::utils::kv3;

const IMAGE_BASE_URL: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/images";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
#[expect(clippy::struct_field_names)]
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
    /// Added in build 6711.
    #[serde(default, rename = "EOOCHealthRegen")]
    e_ooc_health_regen: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawItemPopularity {
    #[serde(rename = "m_flPickPct")]
    pick_pct: f64,
    #[serde(rename = "m_flWinratePct")]
    winrate_pct: f64,
}

#[derive(Debug, Deserialize)]
struct RawPopularItems {
    #[serde(default, rename = "m_unTimestamp")]
    timestamp: Option<i64>,
    /// `ECitadelItemGamePhase_*` → item class name → stats; `null` on heroes
    /// without generated data.
    #[serde(default, rename = "m_mapGeneratedItemPopularity")]
    item_popularity: Option<IndexMap<String, IndexMap<String, RawItemPopularity>>>,
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
#[expect(clippy::struct_field_names)]
struct RawShopStatDisplay {
    #[serde(rename = "m_eSpiritStatsDisplay")]
    e_spirit_stats_display: RawShopSpiritStatsDisplay,
    #[serde(rename = "m_eVitalityStatsDisplay")]
    e_vitality_stats_display: RawShopVitalityStatsDisplay,
    #[serde(rename = "m_eWeaponStatsDisplay")]
    e_weapon_stats_display: RawShopWeaponStatsDisplay,
}

#[derive(Debug, Deserialize)]
#[expect(clippy::struct_field_names)]
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
#[expect(clippy::struct_excessive_bools)]
struct RawHero {
    #[serde(rename = "m_HeroID")]
    id: u32,
    /// Removed in build 6711 in favour of `m_eHeroDevelopmentState`.
    #[serde(rename = "m_bPlayerSelectable", default)]
    player_selectable: Option<bool>,
    /// Added in build 6711 (`EHeroDevState_*`); absent on dev/disabled heroes.
    #[serde(rename = "m_eHeroDevelopmentState", default)]
    development_state: Option<String>,
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
    /// Added in build 6711.
    #[serde(default, rename = "m_strHeroGender")]
    gender: Option<String>,
    /// Added in build 6711 (loc token, e.g. `#hero_inferno_search`).
    #[serde(default, rename = "m_strHeroSearchName")]
    search_name: Option<String>,
    /// Added in build 6711, only on the hero release vote candidates.
    #[serde(default, rename = "m_strVoteSticker")]
    vote_sticker: Option<String>,
    /// Added in build 6711: Valve's generated item pick/win rates per game phase.
    #[serde(default, rename = "m_PopularItems")]
    popular_items: Option<RawPopularItems>,

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
#[expect(clippy::struct_excessive_bools, clippy::struct_field_names)]
pub(crate) struct Hero {
    pub id: u32,
    pub class_name: String,
    pub name: String,
    pub description: HeroDescription,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<StdMap<String, f64>>)]
    #[graphql(skip)]
    pub item_draft_weights: Option<IndexMap<String, f64>>,
    /// Read from `m_bPlayerSelectable` on older builds; since build 6711 it is
    /// derived as `development_state == release`.
    pub player_selectable: bool,
    /// Hero development state (`m_eHeroDevelopmentState`, build 6711+). `null`
    /// on older builds and on heroes that don't declare one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub development_state: Option<HeroDevelopmentState>,
    pub disabled: bool,
    pub in_development: bool,
    pub needs_testing: bool,
    /// `m_bAssignedPlayersOnly` was removed in build 6711; always `false` since.
    pub assigned_players_only: bool,
    /// Always emitted (empty if the hero declares no `m_vecHeroTags`).
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gun_tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hideout_rich_presence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hero_type: Option<HeroType>,
    /// Hero gender (`m_strHeroGender`, build 6711+), e.g. `male` / `female`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
    /// Localized search name (`m_strHeroSearchName`, build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_name: Option<String>,
    /// Valve's generated item pick / win rates per game phase
    /// (`m_PopularItems`, build 6711+). `null` when the hero has no data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub popular_items: Option<HeroPopularItems>,
    /// Read from `m_bPrereleaseOnly` on older builds; since build 6711 it is
    /// derived as `development_state == pre_release`.
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
    /// Deprecated: `m_mapPurchaseBonuses` was removed in build 6711, so this is
    /// always empty for newer builds.
    #[schema(value_type = StdMap<ItemSlotType, Vec<PurchaseBonus>>, deprecated)]
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

impl Hero {
    /// Whether `only_active` keeps the hero. A development state means a
    /// 6711+ build, where `player_selectable` was derived from it.
    pub(crate) fn is_active(&self) -> bool {
        is_active(
            self.development_state
                .is_none()
                .then_some(self.player_selectable),
            self.development_state,
            self.disabled,
            self.in_development,
        )
    }
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
    #[graphql(deprecation = "Removed from the game in build 6711; always empty for newer builds.")]
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
    /// Hero release vote sticker (`m_strVoteSticker`, build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote_sticker: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote_sticker_webp: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroPopularItems {
    /// Unix timestamp (seconds) at which Valve generated the data.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
    pub early_game: Vec<HeroPopularItem>,
    pub mid_game: Vec<HeroPopularItem>,
    pub late_game: Vec<HeroPopularItem>,
}

#[derive(Debug, Serialize, Clone, ToSchema, SimpleObject)]
#[graphql(rename_fields = "snake_case")]
pub(crate) struct HeroPopularItem {
    /// Item id, derived from `class_name` like `/v2/items` ids.
    pub item_id: u32,
    pub class_name: String,
    /// Pick rate in percent (0-100).
    pub pick_pct: f64,
    /// Win rate in percent (0-100).
    pub winrate_pct: f64,
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
#[expect(clippy::struct_field_names)]
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
#[expect(clippy::struct_field_names)]
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
    /// Out-of-combat health regen (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ooc_health_regen: Option<StartingStat>,
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

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq, ToSchema, EnumString, Enum)]
#[serde(rename_all = "snake_case")]
#[strum(ascii_case_insensitive)]
pub(crate) enum HeroDevelopmentState {
    #[strum(serialize = "EHeroDevState_Release")]
    Release,
    #[strum(serialize = "EHeroDevState_PreRelease")]
    PreRelease,
    #[strum(serialize = "EHeroDevState_DebugOnly")]
    DebugOnly,
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
        None,
        only_active,
    ))
}

/// `known_assets`, when present, is the set of image / icon URLs published in
/// the bucket indexes; image fields pointing anywhere else are dropped so we
/// don't hand out 404 URLs (e.g. `*_card.psd` referenced by vote stub heroes
/// that doesn't exist in the game files).
fn transform_root(
    root: &IndexMap<String, serde_json::Value>,
    localization: &HashMap<String, String>,
    style_colors: &HashMap<String, String>,
    backgrounds: &HashMap<String, String>,
    known_assets: Option<&HashSet<String>>,
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
        let raw = match RawHero::deserialize(value) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Skipping {class_name}: {e}");
                continue;
            }
        };
        if only_active
            && !is_active(
                raw.player_selectable,
                parse_development_state(&raw),
                raw.disabled,
                raw.in_development,
            )
        {
            continue;
        }
        out.push(transform(
            class_name,
            raw,
            localization,
            style_colors,
            backgrounds,
            known_assets,
        ));
    }
    out
}

fn parse_development_state(r: &RawHero) -> Option<HeroDevelopmentState> {
    r.development_state.as_deref().and_then(|s| s.parse().ok())
}

/// Builds before 6711 carry `m_bPlayerSelectable`; newer ones only expose
/// `m_eHeroDevelopmentState`, where only released heroes are selectable.
fn is_player_selectable(r: &RawHero) -> bool {
    r.player_selectable
        .unwrap_or_else(|| parse_development_state(r) == Some(HeroDevelopmentState::Release))
}

/// Whether `only_active` keeps the hero. Builds before 6711 mark hero-labs and
/// test heroes only with `m_bInDevelopment`; from 6711 the development state
/// decides, and `m_bInDevelopment` no longer means unreleased (Baba shipped in
/// 6757 as `EHeroDevState_Release` with it still set).
fn is_active(
    player_selectable: Option<bool>,
    development_state: Option<HeroDevelopmentState>,
    disabled: bool,
    in_development: bool,
) -> bool {
    match player_selectable {
        Some(selectable) => selectable && !disabled && !in_development,
        None => development_state == Some(HeroDevelopmentState::Release) && !disabled,
    }
}

#[expect(clippy::too_many_lines)]
fn transform(
    class_name: &str,
    r: RawHero,
    loc: &HashMap<String, String>,
    style_colors: &HashMap<String, String>,
    backgrounds: &HashMap<String, String>,
    known_assets: Option<&HashSet<String>>,
) -> Hero {
    let name = strip_gender_markers(
        loc.get(&format!("{class_name}:n"))
            .or_else(|| loc.get(class_name))
            .or_else(|| loc.get(&format!("Steam_RP_{class_name}")))
            .map_or(class_name, String::as_str),
    );

    // `#hero_inferno_search` is stored as `hero_inferno_search:n`.
    let search_name = r.search_name.as_deref().and_then(|token| {
        let key = token.trim_start_matches('#');
        loc.get(key)
            .or_else(|| loc.get(&format!("{key}:n")))
            .map(|s| strip_gender_markers(s))
    });
    let gender = r.gender.clone().filter(|g| !g.is_empty());
    let popular_items = r.popular_items.as_ref().and_then(build_popular_items);

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

    let development_state = parse_development_state(&r);
    let player_selectable = is_player_selectable(&r);

    let images = build_images(
        &r,
        backgrounds.get(class_name).map(String::as_str),
        known_assets,
    );

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
        // Build 6711 binds `cosmetic_ability_voting_poster` to every hero;
        // cosmetics aren't part of the hero's kit.
        .filter(|(k, _)| *k != HeroItemType::EslotCosmetic1)
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
        player_selectable,
        development_state,
        disabled: r.disabled,
        in_development: r.in_development,
        needs_testing: r.needs_testing,
        assigned_players_only: r.assigned_players_only,
        tags,
        gun_tag,
        hideout_rich_presence,
        hero_type: r.hero_type.as_deref().and_then(|s| s.parse().ok()),
        gender,
        search_name,
        popular_items,
        prerelease_only: r
            .prerelease_only
            .or_else(|| development_state.map(|s| s == HeroDevelopmentState::PreRelease)),
        limited_testing: r.limited_testing,
        complexity: r.complexity,
        skin: r.skin,
        images,
        items,
        starting_stats: build_starting_stats(&r.starting_stats),
        item_slot_info,
        physics,
        colors,
        shop_stat_display: build_shop_stat_display(r.shop_stat_display, known_assets),
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

fn strip_gender_markers(s: &str) -> String {
    s.trim().replace("#|f|#", "").replace("#|m|#", "")
}

fn build_popular_items(r: &RawPopularItems) -> Option<HeroPopularItems> {
    let phases = r.item_popularity.as_ref()?;
    let phase = |key: &str| -> Vec<HeroPopularItem> {
        phases
            .get(key)
            .into_iter()
            .flatten()
            .map(|(class_name, p)| HeroPopularItem {
                item_id: entity_id(class_name),
                class_name: class_name.clone(),
                pick_pct: p.pick_pct,
                winrate_pct: p.winrate_pct,
            })
            .collect()
    };
    Some(HeroPopularItems {
        timestamp: r.timestamp,
        early_game: phase("ECitadelItemGamePhase_EarlyGame"),
        mid_game: phase("ECitadelItemGamePhase_MidGame"),
        late_game: phase("ECitadelItemGamePhase_LateGame"),
    })
}

/// Drops `url` when a published-asset index is available and doesn't list it.
fn known_url(url: Option<String>, known_assets: Option<&HashSet<String>>) -> Option<String> {
    url.filter(|u| known_assets.is_none_or(|k| k.contains(u)))
}

fn build_shop_stat_display(
    r: RawShopStatDisplay,
    known_assets: Option<&HashSet<String>>,
) -> ShopStatDisplay {
    let weapon_image = extract_image_url(r.e_weapon_stats_display.weapon_image.as_deref());
    let weapon_image_webp = known_url(weapon_image.as_deref().map(png_to_webp), known_assets);
    let weapon_image = known_url(weapon_image, known_assets);
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

#[expect(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
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
        ooc_health_regen: s
            .e_ooc_health_regen
            .map(|v| mk!(v, "EOOCHealthRegen", float)),
    }
}

fn build_images(
    r: &RawHero,
    background_raw: Option<&str>,
    known_assets: Option<&HashSet<String>>,
) -> HeroImages {
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

    // Vote stickers live under `events/`, uploaded like the other image
    // folders by their path below `panorama/images/`.
    let vote_sticker = r.vote_sticker.as_deref().and_then(parse_img_path);

    let known = |url: Option<String>| known_url(url, known_assets);
    let webp = |url: &Option<String>| known(url.as_deref().map(png_to_webp));
    HeroImages {
        icon_hero_card_webp: webp(&icon_hero_card),
        icon_hero_card: known(icon_hero_card),
        icon_image_small_webp: webp(&icon_image_small),
        icon_image_small: known(icon_image_small),
        minimap_image_webp: webp(&minimap_image),
        minimap_image: known(minimap_image),
        hero_card_critical_webp: webp(&hero_card_critical),
        hero_card_critical: known(hero_card_critical),
        hero_card_gloat_webp: webp(&hero_card_gloat),
        hero_card_gloat: known(hero_card_gloat),
        top_bar_vertical_image_webp: webp(&top_bar_vertical_image),
        top_bar_vertical_image: known(top_bar_vertical_image),
        weapon_image: None,
        weapon_image_webp: None,
        background_image_webp: webp(&background_image),
        background_image: known(background_image),
        name_image: known(parse_img_path(r.name_image.as_deref().unwrap_or(""))),
        vote_sticker_webp: webp(&vote_sticker),
        vote_sticker: known(vote_sticker),
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

    // Svg icons are uploaded nested by their full path under
    // `panorama/images/`, so they must not be cut at an anchor below.
    let is_svg = |s: &str| {
        std::path::Path::new(s.trim_end_matches('"'))
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("svg") || ext.eq_ignore_ascii_case("vsvg"))
    };
    if is_svg(v) {
        return Some(super::common::svg_icon_url(v));
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
    } else {
        // Plain relative path — no markers, not an svg.
        let cleaned = normalize_image_suffix(v).replace("images/images", "images");
        return Some(format!("{IMAGE_BASE_URL}/{cleaned}"));
    };

    Some(format!("{IMAGE_BASE_URL}/{}", normalize_image_suffix(tail)))
}

#[derive(Clone)]
struct ParsedSources {
    raw_root: Arc<IndexMap<String, serde_json::Value>>,
    style_colors: Arc<HashMap<String, String>>,
    backgrounds: Arc<HashMap<String, String>>,
    known_assets: Option<Arc<HashSet<String>>>,
}

#[cached(max_size = 8, ttl_secs = 86400, convert = "{ version }", key = "u32")]
async fn parsed_version_sources(r2: &AmazonS3, version: u32) -> Result<ParsedSources, AssetsError> {
    // CSS files are optional: a NotFound leaves the lookup empty so the
    // per-hero `background_image*` / `colors.style*` fields serialize as null.
    let (vdata, style_css, bg_css, known_assets) = tokio::join!(
        store::fetch_text(r2, version, "scripts/heroes.vdata"),
        fetch_optional_text(r2, version, "styles/citadel_base_styles.css"),
        fetch_optional_text(r2, version, "styles/hero_background_default.css"),
        fetch_known_assets(r2),
    );
    let (vdata, style_css, bg_css) = (vdata?, style_css?, bg_css?);
    let raw_root: IndexMap<String, serde_json::Value> = kv3::from_str(&vdata)?;
    Ok(ParsedSources {
        known_assets: known_assets.map(Arc::new),
        raw_root: Arc::new(raw_root),
        style_colors: Arc::new(
            style_css
                .as_deref()
                .map_or_default(css::parse_hero_style_colors),
        ),
        backgrounds: Arc::new(
            bg_css
                .as_deref()
                .map_or_default(css::parse_hero_backgrounds),
        ),
    })
}

/// All image + icon URLs listed in the bucket indexes. Best effort: `None` (no
/// URL filtering) if either index can't be loaded or parsed.
async fn fetch_known_assets(r2: &AmazonS3) -> Option<HashSet<String>> {
    fn collect(v: serde_json::Value, out: &mut HashSet<String>) {
        match v {
            serde_json::Value::String(s) => {
                out.insert(s);
            }
            serde_json::Value::Object(m) => m.into_iter().for_each(|(_, v)| collect(v, out)),
            _ => {}
        }
    }
    let (images, icons) = tokio::join!(
        fetch_index(r2, IndexFolder::Images),
        fetch_index(r2, IndexFolder::Icons),
    );
    let mut out = HashSet::new();
    for index in [images, icons] {
        let parsed = index
            .map_err(|e| e.to_string())
            .and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string()));
        match parsed {
            Ok(v) => collect(v, &mut out),
            Err(e) => {
                tracing::warn!("Hero image URLs not validated, failed to load asset index: {e}");
                return None;
            }
        }
    }
    Some(out)
}

async fn fetch_optional_text(
    r2: &AmazonS3,
    version: u32,
    rel_path: &str,
) -> Result<Option<String>, store::VersionStoreError> {
    match store::fetch_text(r2, version, rel_path).await {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.is_not_found() => {
            tracing::debug!("v{version}: optional asset {rel_path} not found, skipping");
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)"
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
        s.known_assets.as_deref(),
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::HeroDevelopmentState::{PreRelease, Release};
    use super::*;

    #[test]
    fn released_hero_is_active_despite_in_development() {
        // Build 6757: Baba shipped as released with `m_bInDevelopment` still set.
        assert!(is_active(None, Some(Release), false, true));
        assert!(is_active(None, Some(Release), false, false));
    }

    #[test]
    fn pre_release_or_disabled_hero_is_inactive() {
        assert!(!is_active(None, Some(PreRelease), false, false));
        assert!(!is_active(None, None, false, false));
        assert!(!is_active(None, Some(Release), true, false));
    }

    #[test]
    fn legacy_hero_labs_hero_is_inactive() {
        // Before 6711, hero-labs heroes were selectable but flagged in development.
        assert!(!is_active(Some(true), None, false, true));
        assert!(!is_active(Some(false), None, false, false));
        assert!(is_active(Some(true), None, false, false));
    }
}
