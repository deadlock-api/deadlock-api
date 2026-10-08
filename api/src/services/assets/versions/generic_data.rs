//! `/v1/assets/generic-data` data layer — fetch + parse + transform.

#![expect(clippy::struct_field_names, clippy::needless_pass_by_value)]

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString, FromRepr};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{Color, IMAGE_BASE_URL};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::localization;
use crate::utils::kv3;

#[derive(Debug, Deserialize)]
struct RawColorGradientStop {
    #[serde(rename = "m_flPosition")]
    position: f64,
    #[serde(rename = "m_Color")]
    color: Color,
}

#[derive(Debug, Deserialize)]
struct RawColorGradient {
    #[serde(default, rename = "m_Stops")]
    stops: Vec<RawColorGradientStop>,
}

/// Up to build 6701 every flash type carried a flat `m_Color` plus
/// coverage/hardness/brightness scalars; from 6711 on the color is an
/// `m_ColorGradient` and most of the scalars are gone.
#[derive(Debug, Deserialize)]
struct RawFlashData {
    #[serde(rename = "m_flDuration")]
    duration: f64,
    #[serde(default, rename = "m_flCoverage")]
    coverage: Option<f64>,
    #[serde(default, rename = "m_flHardness")]
    hardness: Option<f64>,
    #[serde(default, rename = "m_flBrightness")]
    brightness: Option<f64>,
    #[serde(default, rename = "m_Color")]
    color: Option<Color>,
    #[serde(default, rename = "m_ColorGradient")]
    color_gradient: Option<RawColorGradient>,
    #[serde(default, rename = "m_flBrightnessInLightSensitivityMode")]
    brightness_in_light_sensitivity_mode: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawDamageFlash {
    #[serde(rename = "EFlashType_BulletDamage")]
    bullet_damage: RawFlashData,
    #[serde(rename = "EFlashType_TechDamage")]
    tech_damage: RawFlashData,
    #[serde(rename = "EFlashType_Healing")]
    healing_damage: RawFlashData,
    #[serde(rename = "EFlashType_CritDamage")]
    crit_damage: RawFlashData,
    #[serde(rename = "EFlashType_MeleeActivate")]
    melee_damage: RawFlashData,
    #[serde(default, rename = "EFlashType_GenericDamage")]
    generic_damage: Option<RawFlashData>,
}

#[derive(Debug, Deserialize)]
struct RawGlitchSettings {
    #[serde(rename = "m_flStrength")]
    strength: f64,
    #[serde(rename = "m_nQuantizeType")]
    uantize_type: f64,
    #[serde(rename = "m_flQuantizeScale")]
    quantize_scale: f64,
    #[serde(rename = "m_flQuantizeStrength")]
    quantize_strength: f64,
    #[serde(rename = "m_flFrameRate")]
    frame_rate: f64,
    #[serde(rename = "m_flSpeed")]
    speed: f64,
    #[serde(rename = "m_flJumpStrength")]
    jump_strength: f64,
    #[serde(rename = "m_flDistortStrength")]
    distort_strength: f64,
    #[serde(rename = "m_flWhiteNoiseStrength")]
    white_noise_strength: f64,
    #[serde(rename = "m_flScanlineStrength")]
    scanline_strength: f64,
    #[serde(rename = "m_flBreakupStrength")]
    breakup_strength: f64,
}

/// Since build 6711 unused lane slots are bare `{ m_strLaneName = "Unused" }`
/// entries (kept so `assigned_lane` still indexes the list) and lane names
/// are localization tokens (`#Citadel_LaneNameYellow`).
#[derive(Debug, Deserialize)]
struct RawLaneInfo {
    #[serde(rename = "m_strLaneName")]
    lane_name: String,
    #[serde(default, rename = "m_strCSSClass")]
    css_class: Option<String>,
    #[serde(default, rename = "m_Color")]
    color: Option<Color>,
    #[serde(default, rename = "m_MinimapZiplineColorOverride")]
    minimap_zipline_color_override: Option<Color>,
    #[serde(default, rename = "m_ObjectiveColor")]
    objective_color: Option<Color>,
    #[serde(default, rename = "m_MinimapColor")]
    minimap_color: Option<Color>,
    #[serde(default, rename = "m_bIsEnemyLane")]
    is_enemy_lane: bool,
}

#[derive(Debug, Deserialize)]
struct RawNewPlayerMetrics {
    #[serde(rename = "m_strSkillTierName")]
    skill_tier_name: String,
    #[serde(rename = "m_NetWorth")]
    net_worth: i64,
    #[serde(rename = "m_DamageTaken")]
    damage_taken: i64,
    #[serde(rename = "m_BossDamage")]
    boss_damage: i64,
    #[serde(rename = "m_PlayerDamage")]
    player_damage: i64,
    #[serde(rename = "m_LastHits")]
    last_hits: i64,
    #[serde(rename = "m_OrbsSecured")]
    orbs_secured: i64,
    #[serde(rename = "m_OrbsDenied")]
    orbs_denied: i64,
    #[serde(rename = "m_AbilitiesUpgraded")]
    abilities_upgraded: i64,
    #[serde(rename = "m_ModsPurchased")]
    mods_purchased: i64,
}

#[derive(Debug, Deserialize)]
struct RawObjectiveParams {
    #[serde(rename = "m_GoldPerOrb")]
    gold_per_orb: i64,
    #[serde(rename = "m_NearPlayerSplitPct")]
    near_player_split_pct: f64,
    #[serde(rename = "m_nTier1GoldKill")]
    tier1_gold_kill: i64,
    #[serde(rename = "m_nTier1GoldOrbs")]
    tier1_gold_orbs: i64,
    #[serde(rename = "m_nTier2GoldKill")]
    tier2_gold_kill: i64,
    #[serde(rename = "m_nTier2GoldOrbs")]
    tier2_gold_orbs: i64,
    #[serde(rename = "m_nBaseGuardiansGoldKill")]
    base_guardians_gold_kill: i64,
    #[serde(rename = "m_nBaseGuardiansGoldOrbs")]
    base_guardians_gold_orbs: i64,
    #[serde(rename = "m_nShrinesGoldKill")]
    shrines_gold_kill: i64,
    #[serde(rename = "m_nShrinesGoldOrbs")]
    shrines_gold_orbs: i64,
    #[serde(rename = "m_nPatronPhase1GoldKill")]
    patron_phase1_gold_kill: i64,
    #[serde(rename = "m_nPatronPhase1GoldOrbs")]
    patron_phase1_gold_orbs: i64,
}

#[derive(Debug, Deserialize)]
struct RawRejuvParams {
    #[serde(rename = "m_flRejuvinatorExpirationWarningTiming")]
    rejuvinator_expiration_warning_timing: f64,
    #[serde(rename = "m_flRejuvinatorBuffDuration")]
    rejuvinator_buff_duration: f64,
    #[serde(rename = "m_flRejuvinatorDropHeight")]
    rejuvinator_drop_height: f64,
    #[serde(rename = "m_flRejuvinatorDropDuration")]
    rejuvinator_drop_duration: f64,
    #[serde(rename = "m_TrooperHealthMult")]
    trooper_health_mult: Vec<f64>,
    #[serde(rename = "m_PlayerRespawnMult")]
    player_respawn_mult: Vec<f64>,
    #[serde(rename = "m_flRejuvinatorRebirthDuration")]
    rejuvinator_rebirth_duration: Vec<f64>,
}

#[derive(Debug, Deserialize)]
struct RawMiniMapOffsets {
    #[serde(rename = "eEntityClass")]
    entity_class: String,
    #[serde(rename = "vOffset2D")]
    offset_2d: Vec<f64>,
    #[serde(default, rename = "iLane")]
    lane_index: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct RawItemGroup {
    #[serde(rename = "m_eShopGroup")]
    shop_group: String,
    #[serde(rename = "m_vecUpgrades")]
    upgrades: Vec<String>,
}

/// Up to build 6701 the weights are wrapped in `{ m_mapOutcomesToWeights = {..} }`;
/// from 6711 on they are the bare `{ "0" = .., "1" = .. }` map.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RawOutcomeToWeights {
    Wrapped {
        #[serde(rename = "m_mapOutcomesToWeights")]
        outcomes_to_weights: IndexMap<String, f64>,
    },
    Flat(IndexMap<String, f64>),
}

impl RawOutcomeToWeights {
    fn into_weights(self) -> IndexMap<String, f64> {
        match self {
            Self::Wrapped {
                outcomes_to_weights,
            }
            | Self::Flat(outcomes_to_weights) => outcomes_to_weights,
        }
    }
}

#[derive(Debug, Deserialize)]
struct RawItemDraftRound {
    #[serde(rename = "m_eNormalModTier")]
    normal_mod_tier: ItemTier,
    #[serde(rename = "m_eRareModTier")]
    rare_mod_tier: ItemTier,
}

#[derive(Debug, Deserialize)]
struct RawItemDraftRoundPerGameRound {
    #[serde(rename = "m_chanceRare")]
    chance_rare: RawOutcomeToWeights,
    #[serde(rename = "m_chanceEnhanced")]
    chance_enhanced: RawOutcomeToWeights,
    #[serde(rename = "m_vecItemDraftRounds")]
    item_draft_rounds: Vec<RawItemDraftRound>,
}

#[derive(Debug, Deserialize)]
struct RawDraftBucket {
    #[serde(default, rename = "Normal")]
    normal: Option<f64>,
    #[serde(default, rename = "Good")]
    good: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawDraftBuckets {
    #[serde(default, rename = "m_mapBuckets")]
    bucket: Option<RawDraftBucket>,
    #[serde(default, rename = "m_strBucketName")]
    name: Option<String>,
}

/// KV3 stores the per-tier corrupted penalty values as strings (`"-13"`),
/// distances with a meter suffix (`"-2.75m"`).
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RawNumberOrString {
    Number(f64),
    String(String),
}

impl RawNumberOrString {
    fn to_f64(&self) -> Option<f64> {
        match self {
            Self::Number(n) => Some(*n),
            Self::String(s) => s.trim().trim_end_matches('m').parse().ok(),
        }
    }
}

/// One effect of a corrupted-item penalty (build 6711+).
#[derive(Debug, Deserialize)]
struct RawCorruptedPenaltyEffect {
    #[serde(rename = "m_eModifierValue")]
    modifier_value: String,
    #[serde(rename = "m_strBonusPerTier")]
    bonus_per_tier: Vec<RawNumberOrString>,
    #[serde(default, rename = "m_eDisplayType")]
    display_type: Option<String>,
    #[serde(default, rename = "m_strLocTokenOverride")]
    loc_token_override: Option<String>,
    #[serde(default, rename = "m_strCSSClass")]
    css_class: Option<String>,
    #[serde(default, rename = "m_bDisplay")]
    display: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawCorruptedPenaltyDef {
    #[serde(rename = "m_strName")]
    name: String,
    #[serde(default, rename = "m_flRollWeight")]
    roll_weight: Option<f64>,
    #[serde(default, rename = "m_vecEffects")]
    effects: Vec<RawCorruptedPenaltyEffect>,
}

#[derive(Debug, Deserialize)]
struct RawBreakablePowerupLootParams {
    #[serde(default, rename = "m_iLootListDeckSize")]
    loot_list_deck_size: Option<i64>,
    #[serde(default, rename = "m_mapPickupsByMatchTimeMins")]
    pickups_by_match_time_mins: IndexMap<String, IndexMap<String, f64>>,
}

#[derive(Debug, Deserialize)]
struct RawMapDistrictLocalization {
    #[serde(rename = "m_strDistrict")]
    district: String,
    #[serde(default, rename = "m_strBuilding")]
    building: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawStreetBrawl {
    #[serde(rename = "m_vecRespawnTimes")]
    respawn_times: Vec<i64>,
    #[serde(rename = "m_vecGoldPerRound")]
    gold_per_round: Vec<i64>,
    #[serde(rename = "m_vecAPPerRound")]
    apper_round: Vec<i64>,
    #[serde(rename = "m_vecItemDraftRerollsPerRound")]
    item_draft_rerolls_per_round: Vec<i64>,
    #[serde(rename = "m_vecRoundLengthMinutes")]
    round_length_minutes: Vec<i64>,
    #[serde(rename = "m_vecRoundLengthMinutesUrgent")]
    round_length_minutes_urgent: Vec<f64>,
    #[serde(rename = "m_flOvertimeRespawnTimeIncrease")]
    overtime_respawn_time_increase: Vec<f64>,
    #[serde(rename = "m_flOvertimeRespawnTimeIncreaseUrgent")]
    overtime_respawn_time_increase_urgent: Vec<f64>,
    #[serde(rename = "m_flOvertimeTrooperHealthScale")]
    overtime_trooper_health_scale: Vec<f64>,
    #[serde(rename = "m_flOvertimeTrooperDamageScale")]
    overtime_trooper_damage_scale: Vec<f64>,
    #[serde(rename = "m_vecBuyTime")]
    buy_time: Vec<i64>,
    #[serde(rename = "m_vecPreBuyTime")]
    pre_buy_time: Vec<f64>,
    #[serde(rename = "m_iScoreToWin")]
    score_to_win: i64,
    #[serde(rename = "m_flScoringTime")]
    scoring_time: f64,
    #[serde(rename = "m_iLaneNumber")]
    lane_number: i64,
    #[serde(rename = "m_vecObjectiveMaxHealth")]
    objective_max_health: Vec<i64>,
    #[serde(rename = "m_nTier2BonusHealth")]
    tier2_bonus_health: i64,
    #[serde(rename = "m_nComebackBonusHealth")]
    comeback_bonus_health: i64,
    #[serde(rename = "m_nComebackBonusHealthCritical")]
    comeback_bonus_health_critical: i64,
    #[serde(rename = "m_flTrooperSpawnTimer")]
    trooper_spawn_timer: Vec<f64>,
    #[serde(rename = "m_flTrooperSpawnBeforeRoundStartTimer")]
    trooper_spawn_before_round_start_timer: f64,
    #[serde(rename = "m_flZipBoostCooldownOnStart")]
    zip_boost_cooldown_on_start: f64,
    #[serde(rename = "m_flBuyTimeGracePeriod")]
    buy_time_grace_period: f64,
    #[serde(rename = "m_flTier1MaxResistTime")]
    tier1_max_resist_time: f64,
    #[serde(rename = "m_flTier2MaxResistTime")]
    tier2_max_resist_time: f64,
    #[serde(rename = "m_iUltimateUnlockRound")]
    ultimate_unlock_round: i64,
    #[serde(default, rename = "m_iCorruptItemRound")]
    corrupt_item_round: Option<i64>,
    #[serde(rename = "m_vecItemDraftRoundsPerGameRound")]
    item_draft_rounds_per_game_round: Vec<RawItemDraftRoundPerGameRound>,
    #[serde(rename = "m_mapItemTierToItemDraftBuckets")]
    item_drafts: IndexMap<ItemTier, Option<RawDraftBuckets>>,
}

#[derive(Debug, Deserialize)]
struct RawGenericData {
    #[serde(rename = "m_mapDamageFlash")]
    damage_flash: RawDamageFlash,
    #[serde(rename = "m_GlitchSettings")]
    glitch_settings: RawGlitchSettings,
    #[serde(rename = "m_LaneInfo")]
    lane_info: Vec<RawLaneInfo>,
    #[serde(rename = "m_NewPlayerMetrics")]
    new_player_metrics: Vec<RawNewPlayerMetrics>,
    #[serde(default, rename = "m_MinimapTeamRebelsColor")]
    minimap_team_rebels_color: Option<Color>,
    #[serde(default, rename = "m_MinimapTeamCombineColor")]
    minimap_team_combine_color: Option<Color>,
    #[serde(default, rename = "m_enemyObjectivesAndZiplineColor")]
    enemy_objectives_and_zipline_color: Option<Color>,
    #[serde(default, rename = "m_enemyObjectivesColor")]
    enemy_objectives_color: Option<Color>,
    #[serde(default, rename = "m_enemyZiplineColor")]
    enemy_zipline_color: Option<Color>,
    #[serde(default, rename = "m_ColorFriend")]
    color_friend: Option<Color>,
    #[serde(default, rename = "m_ColorEnemy")]
    color_enemy: Option<Color>,
    #[serde(default, rename = "m_ColorTeam1")]
    color_team1: Option<Color>,
    #[serde(default, rename = "m_ColorTeam2")]
    color_team2: Option<Color>,
    #[serde(rename = "m_nItemPricePerTier")]
    item_price_per_tier: Vec<i64>,
    #[serde(default, rename = "m_nItemCorruptionPricePerTier")]
    item_corruption_price_per_tier: Option<Vec<i64>>,
    /// Parsed entry by entry in [`corrupted_penalties_out`] so one malformed
    /// penalty can't take the whole endpoint down.
    #[serde(default, rename = "m_vecCorruptedPenaltyDefs")]
    corrupted_penalty_defs: Option<Vec<serde_json::Value>>,
    #[serde(default, rename = "m_flNeutralCampRespawnTimerShowDistance")]
    neutral_camp_respawn_timer_show_distance: Option<f64>,
    #[serde(default, rename = "m_BreakablePowerupLootParams")]
    breakable_powerup_loot_params: Option<RawBreakablePowerupLootParams>,
    #[serde(default, rename = "m_MapDistrictLocalization")]
    map_district_localization: Option<Vec<RawMapDistrictLocalization>>,
    #[serde(rename = "m_flTrooperKillGoldShareFrac")]
    trooper_kill_gold_share_frac: Vec<f64>,
    #[serde(rename = "m_flHeroKillGoldShareFrac")]
    hero_kill_gold_share_frac: Vec<f64>,
    #[serde(rename = "m_AimSpringStrength")]
    aim_spring_strength: Vec<f64>,
    #[serde(rename = "m_TargetingSpringStrength")]
    targeting_spring_strength: Vec<f64>,
    #[serde(rename = "m_ObjectiveParams")]
    objective_params: RawObjectiveParams,
    #[serde(rename = "m_RejuvParams")]
    rejuv_params: RawRejuvParams,
    #[serde(rename = "m_MiniMapOffsets")]
    mini_map_offsets: Vec<RawMiniMapOffsets>,
    #[serde(rename = "m_vecWeaponGroups")]
    weapon_groups: Vec<RawItemGroup>,
    #[serde(rename = "m_vecArmorGroups")]
    armor_groups: Vec<RawItemGroup>,
    #[serde(rename = "m_vecSpiritGroups")]
    spirit_groups: Vec<RawItemGroup>,
    #[serde(default, rename = "m_StreetBrawl")]
    street_brawl: Option<RawStreetBrawl>,
}

/// 1–5 item tier. Parses from either the integer literal or the `EModTier_N`
/// string used in KV3 sources, and serializes back as the integer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, EnumString, Display, FromRepr)]
#[repr(u8)]
pub(crate) enum ItemTier {
    #[strum(serialize = "EModTier_1", to_string = "1")]
    Tier1 = 1,
    #[strum(serialize = "EModTier_2", to_string = "2")]
    Tier2 = 2,
    #[strum(serialize = "EModTier_3", to_string = "3")]
    Tier3 = 3,
    #[strum(serialize = "EModTier_4", to_string = "4")]
    Tier4 = 4,
    #[strum(serialize = "EModTier_5", to_string = "5")]
    Tier5 = 5,
}

impl Serialize for ItemTier {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for ItemTier {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl serde::de::Visitor<'_> for V {
            type Value = ItemTier;
            fn expecting(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                f.write_str("int 1-5 or 'EModTier_N' string")
            }
            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<ItemTier, E> {
                u8::try_from(v)
                    .ok()
                    .and_then(ItemTier::from_repr)
                    .ok_or_else(|| E::custom(format!("invalid item tier: {v}")))
            }
            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<ItemTier, E> {
                u8::try_from(v)
                    .ok()
                    .and_then(ItemTier::from_repr)
                    .ok_or_else(|| E::custom(format!("invalid item tier: {v}")))
            }
            fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<ItemTier, E> {
                v.parse().map_err(E::custom)
            }
        }
        d.deserialize_any(V)
    }
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ColorGradientStop {
    /// Position of the stop along the flash's lifetime, `0.0..=1.0`.
    pub position: f64,
    pub color: Color,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct FlashData {
    pub duration: f64,
    /// Only present up to build 6701.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coverage: Option<f64>,
    /// Only present up to build 6701.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardness: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brightness: Option<f64>,
    /// Flat flash color. From build 6711 on it is derived from the first
    /// `color_gradient` stop.
    pub color: Color,
    /// Color gradient over the flash's lifetime (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_gradient: Option<Vec<ColorGradientStop>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brightness_in_light_sensitivity_mode: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct DamageFlash {
    pub bullet_damage: FlashData,
    pub tech_damage: FlashData,
    pub healing_damage: FlashData,
    pub crit_damage: FlashData,
    pub melee_damage: FlashData,
    /// Build 6711+.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generic_damage: Option<FlashData>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct GlitchSettings {
    pub strength: f64,
    /// Field name preserved as-is for `/v2/generic-data` compatibility.
    pub uantize_type: f64,
    pub quantize_scale: f64,
    pub quantize_strength: f64,
    pub frame_rate: f64,
    pub speed: f64,
    pub jump_strength: f64,
    pub distort_strength: f64,
    pub white_noise_strength: f64,
    pub scanline_strength: f64,
    pub breakup_strength: f64,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct LaneInfo {
    /// Localized lane name. Unused lane slots are named `Unused`.
    pub lane_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub css_class: Option<String>,
    /// Absent for unused lane slots (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
    /// Only present up to build 6701.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_zipline_color_override: Option<Color>,
    /// Only present up to build 6701.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective_color: Option<Color>,
    /// Build 6711+.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_color: Option<Color>,
    pub is_enemy_lane: bool,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct NewPlayerMetrics {
    pub skill_tier_name: String,
    pub net_worth: i64,
    pub damage_taken: i64,
    pub boss_damage: i64,
    pub player_damage: i64,
    pub last_hits: i64,
    pub orbs_secured: i64,
    pub orbs_denied: i64,
    pub abilities_upgraded: i64,
    pub mods_purchased: i64,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ObjectiveParams {
    pub gold_per_orb: i64,
    pub near_player_split_pct: f64,
    pub tier1_gold_kill: i64,
    pub tier1_gold_orbs: i64,
    pub tier2_gold_kill: i64,
    pub tier2_gold_orbs: i64,
    pub base_guardians_gold_kill: i64,
    pub base_guardians_gold_orbs: i64,
    pub shrines_gold_kill: i64,
    pub shrines_gold_orbs: i64,
    pub patron_phase1_gold_kill: i64,
    pub patron_phase1_gold_orbs: i64,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct RejuvParams {
    pub rejuvinator_expiration_warning_timing: f64,
    pub rejuvinator_buff_duration: f64,
    pub rejuvinator_drop_height: f64,
    pub rejuvinator_drop_duration: f64,
    pub trooper_health_mult: Vec<f64>,
    pub player_respawn_mult: Vec<f64>,
    pub rejuvinator_rebirth_duration: Vec<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct MiniMapOffsets {
    pub entity_class: String,
    pub offset_2d: Vec<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane_index: Option<i64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ItemGroup {
    pub shop_group: String,
    pub upgrades: Vec<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct OutcomeToWeights {
    #[schema(value_type = std::collections::HashMap<String, f64>)]
    pub outcomes_to_weights: IndexMap<String, f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ItemDraftRound {
    #[schema(value_type = u8)]
    pub normal_mod_tier: ItemTier,
    #[schema(value_type = u8)]
    pub rare_mod_tier: ItemTier,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ItemDraftRoundPerGameRound {
    pub chance_rare: OutcomeToWeights,
    pub chance_enhanced: OutcomeToWeights,
    pub item_draft_rounds: Vec<ItemDraftRound>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct DraftBucket {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normal: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct DraftBuckets {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bucket: Option<DraftBucket>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct CorruptedPenaltyEffect {
    /// Modifier the penalty applies, e.g. `MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE`.
    pub modifier_value: String,
    /// Penalty value indexed by item tier (same indexing as
    /// `item_price_per_tier`; tiers that can't be corrupted are `0`), in
    /// display units: distances are meters (source suffix `m` stripped),
    /// matching `postfix`.
    pub bonus_per_tier: Vec<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loc_token_override: Option<String>,
    /// Localized stat label (from `loc_token_override`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Localized unit suffix, e.g. `%` or ` m`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub postfix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub css_class: Option<String>,
    /// `false` for effects the game applies but doesn't list in tooltips.
    pub display: bool,
}

/// A png image and its webp variant.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ImagePair {
    pub png: String,
    pub webp: String,
}

impl ImagePair {
    fn at(path: &str) -> Self {
        Self {
            png: format!("{IMAGE_BASE_URL}/{path}.png"),
            webp: format!("{IMAGE_BASE_URL}/{path}.webp"),
        }
    }
}

/// Corrupted item tooltip backers, one per item slot type.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct CorruptedTooltipBackers {
    pub weapon: ImagePair,
    pub spirit: ImagePair,
    pub vitality: ImagePair,
}

/// Item tooltip background of one slot type: the backer, its alpha mask and the
/// color layer.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ItemTooltipBacker {
    pub backer: ImagePair,
    pub mask: ImagePair,
    pub color: ImagePair,
}

/// Item tooltip backgrounds, one per item slot type.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ItemTooltipBackers {
    pub weapon: ItemTooltipBacker,
    pub spirit: ItemTooltipBacker,
    pub vitality: ItemTooltipBacker,
}

impl ItemTooltipBackers {
    fn new() -> Self {
        let slot = |slot: &str| {
            let base = format!("tooltips/items/tooltip_backer_{slot}");
            ItemTooltipBacker {
                backer: ImagePair::at(&base),
                mask: ImagePair::at(&format!("{base}_mask")),
                color: ImagePair::at(&format!("{base}_color")),
            }
        };
        Self {
            weapon: slot("weapon"),
            spirit: slot("spirit"),
            vitality: slot("vitality"),
        }
    }
}

/// Shop art for corrupted items (build 6711+). The game has no per-item corrupted
/// icon: a corrupted item is its normal image drawn inside `frame`, with the tooltip
/// backer of its `item_slot_type`.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct CorruptedItemImages {
    pub frame: ImagePair,
    /// Frame for an active (usable) corrupted item.
    pub frame_active: ImagePair,
    pub tooltip_backers: CorruptedTooltipBackers,
}

impl CorruptedItemImages {
    fn new() -> Self {
        let backer =
            |slot: &str| ImagePair::at(&format!("tooltips/items/tooltip_backer_{slot}_corrupted"));
        Self {
            frame: ImagePair::at("shop/corrupted_items/item_frame_corrupted"),
            frame_active: ImagePair::at("shop/corrupted_items/item_frame_corrupted_active"),
            tooltip_backers: CorruptedTooltipBackers {
                weapon: backer("weapon"),
                spirit: backer("spirit"),
                vitality: backer("vitality"),
            },
        }
    }
}

/// A penalty that can be rolled onto a corrupted item (build 6711+).
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct CorruptedPenalty {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roll_weight: Option<f64>,
    pub effects: Vec<CorruptedPenaltyEffect>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct BreakablePowerupLootParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loot_list_deck_size: Option<i64>,
    /// Match time in minutes (string key) from which a loot table applies,
    /// mapped to `{pickup_name: relative weight}`.
    #[schema(value_type = std::collections::HashMap<String, std::collections::HashMap<String, f64>>)]
    pub pickups_by_match_time_mins: IndexMap<String, IndexMap<String, f64>>,
}

/// A district / building label pair shown on the map (build 6711+).
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct MapDistrict {
    /// Localization token, e.g. `map_district_theater`.
    pub district: String,
    /// Localized district name, e.g. `Theater`.
    pub district_name: String,
    /// Localization token, e.g. `map_district_building_docks`. Absent for
    /// districts without buildings.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub building: Option<String>,
    /// Localized building name, e.g. `Docks`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub building_name: Option<String>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct StreetBrawl {
    pub respawn_times: Vec<i64>,
    pub gold_per_round: Vec<i64>,
    pub apper_round: Vec<i64>,
    pub item_draft_rerolls_per_round: Vec<i64>,
    pub round_length_minutes: Vec<i64>,
    pub round_length_minutes_urgent: Vec<f64>,
    pub overtime_respawn_time_increase: Vec<f64>,
    pub overtime_respawn_time_increase_urgent: Vec<f64>,
    pub overtime_trooper_health_scale: Vec<f64>,
    pub overtime_trooper_damage_scale: Vec<f64>,
    pub buy_time: Vec<i64>,
    pub pre_buy_time: Vec<f64>,
    pub score_to_win: i64,
    pub scoring_time: f64,
    pub lane_number: i64,
    pub objective_max_health: Vec<i64>,
    pub tier2_bonus_health: i64,
    pub comeback_bonus_health: i64,
    pub comeback_bonus_health_critical: i64,
    pub trooper_spawn_timer: Vec<f64>,
    pub trooper_spawn_before_round_start_timer: f64,
    pub zip_boost_cooldown_on_start: f64,
    pub buy_time_grace_period: f64,
    pub tier1_max_resist_time: f64,
    pub tier2_max_resist_time: f64,
    pub ultimate_unlock_round: i64,
    /// Round in which players may corrupt an item (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corrupt_item_round: Option<i64>,
    pub item_draft_rounds_per_game_round: Vec<ItemDraftRoundPerGameRound>,
    #[schema(value_type = std::collections::HashMap<String, DraftBuckets>)]
    pub item_drafts: IndexMap<ItemTier, Option<DraftBuckets>>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct GenericData {
    pub damage_flash: DamageFlash,
    pub glitch_settings: GlitchSettings,
    pub lane_info: Vec<LaneInfo>,
    pub new_player_metrics: Vec<NewPlayerMetrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_team_rebels_color: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_team_combine_color: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enemy_objectives_and_zipline_color: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enemy_objectives_color: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enemy_zipline_color: Option<Color>,
    /// Build 6711+.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_friend: Option<Color>,
    /// Build 6711+.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_enemy: Option<Color>,
    /// Build 6711+.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_team1: Option<Color>,
    /// Build 6711+.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_team2: Option<Color>,
    pub item_price_per_tier: Vec<i64>,
    /// Extra cost of corrupting an item, by item tier (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_corruption_price_per_tier: Option<Vec<i64>>,
    /// Penalties that can be rolled onto corrupted items (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corrupted_penalties: Option<Vec<CorruptedPenalty>>,
    /// Shop art for corrupted items (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corrupted_item_images: Option<CorruptedItemImages>,
    /// Item tooltip backgrounds per slot type (the corrupted variants are in
    /// `corrupted_item_images`).
    pub item_tooltip_backers: ItemTooltipBackers,
    /// Distance within which a neutral camp's respawn timer is shown (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub neutral_camp_respawn_timer_show_distance: Option<f64>,
    /// Loot tables for breakable powerup props (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub breakable_powerup_loot_params: Option<BreakablePowerupLootParams>,
    /// District / building labels shown on the map (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map_districts: Option<Vec<MapDistrict>>,
    pub trooper_kill_gold_share_frac: Vec<f64>,
    pub hero_kill_gold_share_frac: Vec<f64>,
    pub aim_spring_strength: Vec<f64>,
    pub targeting_spring_strength: Vec<f64>,
    pub objective_params: ObjectiveParams,
    pub rejuv_params: RejuvParams,
    pub mini_map_offsets: Vec<MiniMapOffsets>,
    pub weapon_groups: Vec<ItemGroup>,
    pub armor_groups: Vec<ItemGroup>,
    pub spirit_groups: Vec<ItemGroup>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub street_brawl: Option<StreetBrawl>,
}

pub(crate) fn build_generic_data(
    vdata: &str,
    loc: &HashMap<String, String>,
) -> Result<GenericData, AssetsError> {
    let root: serde_json::Value = kv3::from_str(vdata)?;
    let raw: RawGenericData = serde_json::from_value(unwrap_root(root))?;
    Ok(transform(raw, loc))
}

/// Source publishes either `{ m_mapDamageFlash = ... }` at top, or
/// `{ generic_data: { m_mapDamageFlash = ... } }` wrapped one level deeper.
fn unwrap_root(v: serde_json::Value) -> serde_json::Value {
    let serde_json::Value::Object(obj) = &v else {
        return v;
    };
    if obj.contains_key("m_mapDamageFlash") {
        return v;
    }
    for child in obj.values() {
        if let serde_json::Value::Object(c) = child
            && c.contains_key("m_mapDamageFlash")
        {
            return child.clone();
        }
    }
    v
}

fn transform(r: RawGenericData, loc: &HashMap<String, String>) -> GenericData {
    GenericData {
        damage_flash: damage_flash_out(r.damage_flash),
        glitch_settings: glitch_out(r.glitch_settings),
        lane_info: r
            .lane_info
            .into_iter()
            .map(|l| lane_info_out(l, loc))
            .collect(),
        new_player_metrics: r
            .new_player_metrics
            .into_iter()
            .map(new_player_metrics_out)
            .collect(),
        minimap_team_rebels_color: r.minimap_team_rebels_color,
        minimap_team_combine_color: r.minimap_team_combine_color,
        enemy_objectives_and_zipline_color: r.enemy_objectives_and_zipline_color,
        enemy_objectives_color: r.enemy_objectives_color,
        enemy_zipline_color: r.enemy_zipline_color,
        color_friend: r.color_friend,
        color_enemy: r.color_enemy,
        color_team1: r.color_team1,
        color_team2: r.color_team2,
        item_price_per_tier: r.item_price_per_tier,
        item_corruption_price_per_tier: r.item_corruption_price_per_tier,
        item_tooltip_backers: ItemTooltipBackers::new(),
        corrupted_item_images: r
            .corrupted_penalty_defs
            .is_some()
            .then(CorruptedItemImages::new),
        corrupted_penalties: r
            .corrupted_penalty_defs
            .map(|defs| corrupted_penalties_out(defs, loc)),
        neutral_camp_respawn_timer_show_distance: r.neutral_camp_respawn_timer_show_distance,
        breakable_powerup_loot_params: r.breakable_powerup_loot_params.map(|p| {
            BreakablePowerupLootParams {
                loot_list_deck_size: p.loot_list_deck_size,
                pickups_by_match_time_mins: p.pickups_by_match_time_mins,
            }
        }),
        map_districts: r
            .map_district_localization
            .map(|v| v.into_iter().map(|d| map_district_out(d, loc)).collect()),
        trooper_kill_gold_share_frac: r.trooper_kill_gold_share_frac,
        hero_kill_gold_share_frac: r.hero_kill_gold_share_frac,
        aim_spring_strength: r.aim_spring_strength,
        targeting_spring_strength: r.targeting_spring_strength,
        objective_params: objective_params_out(r.objective_params),
        rejuv_params: rejuv_out(r.rejuv_params),
        mini_map_offsets: r.mini_map_offsets.into_iter().map(mini_map_out).collect(),
        weapon_groups: r.weapon_groups.into_iter().map(item_group_out).collect(),
        armor_groups: r.armor_groups.into_iter().map(item_group_out).collect(),
        spirit_groups: r.spirit_groups.into_iter().map(item_group_out).collect(),
        street_brawl: r.street_brawl.map(street_brawl_out),
    }
}

fn flash_out(r: RawFlashData) -> FlashData {
    let color_gradient: Option<Vec<ColorGradientStop>> = r.color_gradient.map(|g| {
        g.stops
            .into_iter()
            .map(|s| ColorGradientStop {
                position: s.position,
                color: s.color,
            })
            .collect()
    });
    let color = r
        .color
        .or_else(|| color_gradient.as_ref()?.first().map(|s| s.color))
        .unwrap_or(Color {
            red: 0,
            green: 0,
            blue: 0,
            alpha: 255,
        });
    FlashData {
        duration: r.duration,
        coverage: r.coverage,
        hardness: r.hardness,
        brightness: r.brightness,
        color,
        color_gradient,
        brightness_in_light_sensitivity_mode: r.brightness_in_light_sensitivity_mode,
    }
}

fn damage_flash_out(r: RawDamageFlash) -> DamageFlash {
    DamageFlash {
        bullet_damage: flash_out(r.bullet_damage),
        tech_damage: flash_out(r.tech_damage),
        healing_damage: flash_out(r.healing_damage),
        crit_damage: flash_out(r.crit_damage),
        melee_damage: flash_out(r.melee_damage),
        generic_damage: r.generic_damage.map(flash_out),
    }
}

fn glitch_out(r: RawGlitchSettings) -> GlitchSettings {
    GlitchSettings {
        strength: r.strength,
        uantize_type: r.uantize_type,
        quantize_scale: r.quantize_scale,
        quantize_strength: r.quantize_strength,
        frame_rate: r.frame_rate,
        speed: r.speed,
        jump_strength: r.jump_strength,
        distort_strength: r.distort_strength,
        white_noise_strength: r.white_noise_strength,
        scanline_strength: r.scanline_strength,
        breakup_strength: r.breakup_strength,
    }
}

fn lane_info_out(r: RawLaneInfo, loc: &HashMap<String, String>) -> LaneInfo {
    // Up to build 6701 lane names are plain English; only `#`-prefixed
    // tokens (6711+) are localized.
    let lane_name = if r.lane_name.starts_with('#') {
        localization::localize(loc, &r.lane_name)
    } else {
        r.lane_name
    };
    LaneInfo {
        lane_name,
        css_class: r.css_class,
        color: r.color,
        minimap_zipline_color_override: r.minimap_zipline_color_override,
        objective_color: r.objective_color,
        minimap_color: r.minimap_color,
        is_enemy_lane: r.is_enemy_lane,
    }
}

fn corrupted_penalties_out(
    defs: Vec<serde_json::Value>,
    loc: &HashMap<String, String>,
) -> Vec<CorruptedPenalty> {
    defs.into_iter()
        .filter_map(|v| {
            let parsed = serde_json::from_value::<RawCorruptedPenaltyDef>(v)
                .map_err(|e| e.to_string())
                .and_then(|d| corrupted_penalty_out(d, loc));
            parsed
                .inspect_err(|e| tracing::warn!("Skipping corrupted penalty def: {e}"))
                .ok()
        })
        .collect()
}

fn corrupted_penalty_out(
    d: RawCorruptedPenaltyDef,
    loc: &HashMap<String, String>,
) -> Result<CorruptedPenalty, String> {
    let effects = d
        .effects
        .into_iter()
        .map(|e| corrupted_penalty_effect_out(e, loc))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("{}: {e}", d.name))?;
    Ok(CorruptedPenalty {
        name: d.name,
        roll_weight: d.roll_weight,
        effects,
    })
}

fn corrupted_penalty_effect_out(
    e: RawCorruptedPenaltyEffect,
    loc: &HashMap<String, String>,
) -> Result<CorruptedPenaltyEffect, String> {
    let bonus_per_tier = e
        .bonus_per_tier
        .iter()
        .map(|b| {
            b.to_f64()
                .ok_or_else(|| format!("non-numeric bonus {b:?} for {}", e.modifier_value))
        })
        .collect::<Result<_, _>>()?;
    let token = e.loc_token_override.as_deref().filter(|t| !t.is_empty());
    let label = token.and_then(|t| {
        loc.get(&format!("{t}_label"))
            .or_else(|| loc.get(&format!("{t}_Label")))
            .or_else(|| loc.get(&format!("StatDesc_{t}")))
            .cloned()
    });
    let postfix = token.and_then(|t| {
        loc.get(&format!("{t}_postfix"))
            .or_else(|| loc.get(&format!("StatDesc_{t}_postfix")))
            .cloned()
    });
    Ok(CorruptedPenaltyEffect {
        modifier_value: e.modifier_value,
        bonus_per_tier,
        display_type: e.display_type,
        loc_token_override: e.loc_token_override,
        label,
        postfix,
        css_class: e.css_class.filter(|c| !c.is_empty()),
        display: e.display.unwrap_or(true),
    })
}

fn map_district_out(r: RawMapDistrictLocalization, loc: &HashMap<String, String>) -> MapDistrict {
    // District strings are formatted as the prefix of a
    // `"<district> : <building>"` label (`"York : "`); strip the separator.
    let district_name = localization::localize(loc, &r.district)
        .trim_end_matches([' ', ':'])
        .to_owned();
    let building = r.building.filter(|b| !b.is_empty());
    let building_name = building.as_deref().map(|b| localization::localize(loc, b));
    MapDistrict {
        district: r.district,
        district_name,
        building,
        building_name,
    }
}

fn new_player_metrics_out(r: RawNewPlayerMetrics) -> NewPlayerMetrics {
    NewPlayerMetrics {
        skill_tier_name: r.skill_tier_name,
        net_worth: r.net_worth,
        damage_taken: r.damage_taken,
        boss_damage: r.boss_damage,
        player_damage: r.player_damage,
        last_hits: r.last_hits,
        orbs_secured: r.orbs_secured,
        orbs_denied: r.orbs_denied,
        abilities_upgraded: r.abilities_upgraded,
        mods_purchased: r.mods_purchased,
    }
}

fn objective_params_out(r: RawObjectiveParams) -> ObjectiveParams {
    ObjectiveParams {
        gold_per_orb: r.gold_per_orb,
        near_player_split_pct: r.near_player_split_pct,
        tier1_gold_kill: r.tier1_gold_kill,
        tier1_gold_orbs: r.tier1_gold_orbs,
        tier2_gold_kill: r.tier2_gold_kill,
        tier2_gold_orbs: r.tier2_gold_orbs,
        base_guardians_gold_kill: r.base_guardians_gold_kill,
        base_guardians_gold_orbs: r.base_guardians_gold_orbs,
        shrines_gold_kill: r.shrines_gold_kill,
        shrines_gold_orbs: r.shrines_gold_orbs,
        patron_phase1_gold_kill: r.patron_phase1_gold_kill,
        patron_phase1_gold_orbs: r.patron_phase1_gold_orbs,
    }
}

fn rejuv_out(r: RawRejuvParams) -> RejuvParams {
    RejuvParams {
        rejuvinator_expiration_warning_timing: r.rejuvinator_expiration_warning_timing,
        rejuvinator_buff_duration: r.rejuvinator_buff_duration,
        rejuvinator_drop_height: r.rejuvinator_drop_height,
        rejuvinator_drop_duration: r.rejuvinator_drop_duration,
        trooper_health_mult: r.trooper_health_mult,
        player_respawn_mult: r.player_respawn_mult,
        rejuvinator_rebirth_duration: r.rejuvinator_rebirth_duration,
    }
}

fn mini_map_out(r: RawMiniMapOffsets) -> MiniMapOffsets {
    MiniMapOffsets {
        entity_class: r.entity_class,
        offset_2d: r.offset_2d,
        lane_index: r.lane_index,
    }
}

fn item_group_out(r: RawItemGroup) -> ItemGroup {
    ItemGroup {
        shop_group: r.shop_group,
        upgrades: r.upgrades,
    }
}

fn draft_bucket_out(r: RawDraftBucket) -> DraftBucket {
    DraftBucket {
        normal: r.normal,
        good: r.good,
    }
}

fn draft_buckets_out(r: RawDraftBuckets) -> DraftBuckets {
    DraftBuckets {
        bucket: r.bucket.map(draft_bucket_out),
        name: r.name,
    }
}

fn street_brawl_out(r: RawStreetBrawl) -> StreetBrawl {
    StreetBrawl {
        respawn_times: r.respawn_times,
        gold_per_round: r.gold_per_round,
        apper_round: r.apper_round,
        item_draft_rerolls_per_round: r.item_draft_rerolls_per_round,
        round_length_minutes: r.round_length_minutes,
        round_length_minutes_urgent: r.round_length_minutes_urgent,
        overtime_respawn_time_increase: r.overtime_respawn_time_increase,
        overtime_respawn_time_increase_urgent: r.overtime_respawn_time_increase_urgent,
        overtime_trooper_health_scale: r.overtime_trooper_health_scale,
        overtime_trooper_damage_scale: r.overtime_trooper_damage_scale,
        buy_time: r.buy_time,
        pre_buy_time: r.pre_buy_time,
        score_to_win: r.score_to_win,
        scoring_time: r.scoring_time,
        lane_number: r.lane_number,
        objective_max_health: r.objective_max_health,
        tier2_bonus_health: r.tier2_bonus_health,
        comeback_bonus_health: r.comeback_bonus_health,
        comeback_bonus_health_critical: r.comeback_bonus_health_critical,
        trooper_spawn_timer: r.trooper_spawn_timer,
        trooper_spawn_before_round_start_timer: r.trooper_spawn_before_round_start_timer,
        zip_boost_cooldown_on_start: r.zip_boost_cooldown_on_start,
        buy_time_grace_period: r.buy_time_grace_period,
        tier1_max_resist_time: r.tier1_max_resist_time,
        tier2_max_resist_time: r.tier2_max_resist_time,
        ultimate_unlock_round: r.ultimate_unlock_round,
        corrupt_item_round: r.corrupt_item_round,
        item_draft_rounds_per_game_round: r
            .item_draft_rounds_per_game_round
            .into_iter()
            .map(|x| ItemDraftRoundPerGameRound {
                chance_rare: OutcomeToWeights {
                    outcomes_to_weights: x.chance_rare.into_weights(),
                },
                chance_enhanced: OutcomeToWeights {
                    outcomes_to_weights: x.chance_enhanced.into_weights(),
                },
                item_draft_rounds: x
                    .item_draft_rounds
                    .into_iter()
                    .map(|d| ItemDraftRound {
                        normal_mod_tier: d.normal_mod_tier,
                        rare_mod_tier: d.rare_mod_tier,
                    })
                    .collect(),
            })
            .collect(),
        item_drafts: r
            .item_drafts
            .into_iter()
            .map(|(k, v)| (k, v.map(draft_buckets_out)))
            .collect(),
    }
}

#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)"
)]
pub(crate) async fn fetch_generic_data(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<GenericData>, AssetsError> {
    let (vdata, loc) =
        localization::fetch_with_localization(r2, version, "scripts/generic_data.vdata", language)
            .await?;
    Ok(Arc::new(build_generic_data(&vdata, &loc)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!(
            "{manifest}/src/services/assets/versions/generic_data_fixtures/{name}"
        ))
        .expect("vdata fixture")
    }

    #[test]
    fn snapshot_generic_data() {
        let data =
            build_generic_data(&fixture("generic_data.vdata"), &HashMap::new()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "generic_data_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("generic_data", data); }
        );
    }

    fn data_6711() -> GenericData {
        let loc = HashMap::from([
            ("Citadel_LaneNameYellow".to_owned(), "York".to_owned()),
            ("Citadel_LaneNameBlue".to_owned(), "Broadway".to_owned()),
            ("Citadel_LaneNameGreen".to_owned(), "Greenwich".to_owned()),
            ("map_district_york".to_owned(), "York : ".to_owned()),
            ("map_district_theater".to_owned(), "Theater".to_owned()),
            ("map_district_building_docks".to_owned(), "Docks".to_owned()),
            (
                "CooldownReduction_label".to_owned(),
                "Ability Cooldown Reduction".to_owned(),
            ),
            ("CooldownReduction_postfix".to_owned(), "%".to_owned()),
            (
                "StatDesc_TechArmorDamageReduction".to_owned(),
                "Spirit Resist".to_owned(),
            ),
        ]);
        build_generic_data(&fixture("generic_data_6711.vdata"), &loc).expect("builds")
    }

    /// Build 6711 ("City Never Sleeps") reshaped damage flashes, lane info,
    /// minimap colors and item draft weights.
    #[test]
    fn snapshot_generic_data_6711() {
        let data = data_6711();

        let names: Vec<&str> = data
            .lane_info
            .iter()
            .map(|l| l.lane_name.as_str())
            .collect();
        assert_eq!(
            names,
            [
                "Unused",
                "York",
                "Unused",
                "Unused",
                "Broadway",
                "Unused",
                "Greenwich",
                "Enemy"
            ]
        );
        assert!(data.lane_info[0].color.is_none());
        assert!(data.lane_info[7].is_enemy_lane);
        let bullet = &data.damage_flash.bullet_damage;
        let first_stop = bullet.color_gradient.as_ref().expect("gradient")[0].color;
        assert_eq!(bullet.color, first_stop);
        assert!(data.damage_flash.generic_damage.is_some());
        assert!(data.color_enemy.is_some());
        let round = &data
            .street_brawl
            .as_ref()
            .expect("street brawl")
            .item_draft_rounds_per_game_round[0];
        assert!(!round.chance_rare.outcomes_to_weights.is_empty());

        insta::with_settings!(
            { snapshot_path => "generic_data_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("generic_data_6711", data); }
        );
    }

    /// Build 6711 added the corrupted item shop (Broker).
    #[test]
    fn parses_6711_corrupted_items() {
        let data = data_6711();
        let sb = data.street_brawl.as_ref().expect("street brawl");
        assert_eq!(sb.corrupt_item_round, Some(5));
        assert_eq!(
            data.item_corruption_price_per_tier.as_deref(),
            Some(&[0, 0, 0, 0, 0, 0][..])
        );
        let penalties = data.corrupted_penalties.as_ref().expect("penalties");
        assert_eq!(penalties.len(), 11);
        let cd = &penalties[0];
        assert_eq!(cd.name, "TechCooldown");
        assert_eq!(cd.roll_weight, Some(1.0));
        let cd_effect = &cd.effects[0];
        assert_eq!(cd_effect.bonus_per_tier, [0.0, 0.0, 0.0, -13.0, -17.0, 0.0]);
        assert_eq!(
            cd_effect.label.as_deref(),
            Some("Ability Cooldown Reduction")
        );
        assert_eq!(cd_effect.postfix.as_deref(), Some("%"));
        assert_eq!(cd_effect.css_class.as_deref(), Some("cooldown"));
        assert!(cd_effect.display);
        let range = penalties
            .iter()
            .find(|p| p.name == "TechRange")
            .expect("range");
        assert!(!range.effects[1].display);
        let move_speed = penalties
            .iter()
            .find(|p| p.name == "MoveSpeed")
            .expect("ms");
        assert_eq!(
            move_speed.effects[0].bonus_per_tier,
            [0.0, 0.0, 0.0, -2.0, -2.75, 0.0]
        );
        let resist = penalties
            .iter()
            .find(|p| p.name == "TechResist")
            .expect("resist");
        assert_eq!(resist.effects[0].label.as_deref(), Some("Spirit Resist"));
    }

    /// Build 6711 moved the breakable loot tables here from misc entities
    /// and added map district labels.
    #[test]
    fn parses_6711_loot_params_and_districts() {
        let data = data_6711();
        let loot = data
            .breakable_powerup_loot_params
            .as_ref()
            .expect("loot params");
        assert_eq!(loot.loot_list_deck_size, Some(3));
        let mins: Vec<&str> = loot
            .pickups_by_match_time_mins
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(mins, ["0", "10", "30"]);
        assert_eq!(
            loot.pickups_by_match_time_mins["10"].get("range_permanent_pickup_lv2"),
            Some(&0.5)
        );

        assert_eq!(data.neutral_camp_respawn_timer_show_distance, Some(15.0));
        let districts = data.map_districts.as_ref().expect("districts");
        let docks = districts
            .iter()
            .find(|d| d.building.as_deref() == Some("map_district_building_docks"))
            .expect("docks");
        assert_eq!(docks.district_name, "York");
        assert_eq!(docks.building_name.as_deref(), Some("Docks"));
        let theater = districts
            .iter()
            .find(|d| d.district == "map_district_theater")
            .expect("theater");
        assert_eq!(theater.district_name, "Theater");
        assert!(theater.building.is_none());
    }
}
