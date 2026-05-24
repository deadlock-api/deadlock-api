//! `/v1/assets/generic-data` data layer — fetch + parse + transform.

#![allow(clippy::struct_field_names, clippy::needless_pass_by_value)]

use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString, FromRepr};
use utoipa::ToSchema;

use crate::services::assets::versions::common::Color;
use crate::services::assets::versions::common::{DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;
use crate::utils::kv3;

#[derive(Debug, Deserialize)]
struct RawFlashData {
    #[serde(rename = "m_flDuration")]
    duration: f64,
    #[serde(rename = "m_flCoverage")]
    coverage: f64,
    #[serde(rename = "m_flHardness")]
    hardness: f64,
    #[serde(rename = "m_flBrightness")]
    brightness: f64,
    #[serde(rename = "m_Color")]
    color: Color,
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

#[derive(Debug, Deserialize)]
struct RawLaneInfo {
    #[serde(rename = "m_strLaneName")]
    lane_name: String,
    #[serde(default, rename = "m_strCSSClass")]
    css_class: Option<String>,
    #[serde(rename = "m_Color")]
    color: Color,
    #[serde(default, rename = "m_MinimapZiplineColorOverride")]
    minimap_zipline_color_override: Option<Color>,
    #[serde(default, rename = "m_ObjectiveColor")]
    objective_color: Option<Color>,
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

#[derive(Debug, Deserialize)]
struct RawOutcomeToWeights {
    #[serde(rename = "m_mapOutcomesToWeights")]
    outcomes_to_weights: IndexMap<String, f64>,
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
    #[serde(rename = "m_nItemPricePerTier")]
    item_price_per_tier: Vec<i64>,
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
pub(crate) struct FlashData {
    pub duration: f64,
    pub coverage: f64,
    pub hardness: f64,
    pub brightness: f64,
    pub color: Color,
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
    pub lane_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub css_class: Option<String>,
    pub color: Color,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimap_zipline_color_override: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective_color: Option<Color>,
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
    pub item_price_per_tier: Vec<i64>,
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

pub(crate) fn build_generic_data(vdata: &str) -> Result<GenericData, AssetsError> {
    let root: serde_json::Value = kv3::from_str(vdata)?;
    let raw: RawGenericData = serde_json::from_value(unwrap_root(root))?;
    Ok(transform(raw))
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

fn transform(r: RawGenericData) -> GenericData {
    GenericData {
        damage_flash: damage_flash_out(r.damage_flash),
        glitch_settings: glitch_out(r.glitch_settings),
        lane_info: r.lane_info.into_iter().map(lane_info_out).collect(),
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
        item_price_per_tier: r.item_price_per_tier,
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
    FlashData {
        duration: r.duration,
        coverage: r.coverage,
        hardness: r.hardness,
        brightness: r.brightness,
        color: r.color,
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

fn lane_info_out(r: RawLaneInfo) -> LaneInfo {
    LaneInfo {
        lane_name: r.lane_name,
        css_class: r.css_class,
        color: r.color,
        minimap_zipline_color_override: r.minimap_zipline_color_override,
        objective_color: r.objective_color,
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
        item_draft_rounds_per_game_round: r
            .item_draft_rounds_per_game_round
            .into_iter()
            .map(|x| ItemDraftRoundPerGameRound {
                chance_rare: OutcomeToWeights {
                    outcomes_to_weights: x.chance_rare.outcomes_to_weights,
                },
                chance_enhanced: OutcomeToWeights {
                    outcomes_to_weights: x.chance_enhanced.outcomes_to_weights,
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
    ty = "LruTtlCache<u32, Arc<GenericData>>",
    create = "{ LruTtlCache::builder().size(DEFAULT_CACHE_SIZE).ttl(DEFAULT_CACHE_TTL).build() }",
    convert = "{ version }",
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_generic_data(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<GenericData>, AssetsError> {
    let vdata = store::fetch_text(r2, version, "scripts/generic_data.vdata").await?;
    Ok(Arc::new(build_generic_data(&vdata)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!(
            "{manifest}/src/services/assets/versions/generic_data_fixtures/generic_data.vdata"
        ))
        .expect("vdata fixture")
    }

    #[test]
    fn snapshot_generic_data() {
        let data = build_generic_data(&fixture()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "generic_data_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("generic_data", data); }
        );
    }
}
