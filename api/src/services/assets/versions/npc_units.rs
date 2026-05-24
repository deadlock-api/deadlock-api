//! `/v1/assets/npc-units` data layer — fetch + parse + transform.

use core::time::Duration;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{
    Color, HeroItemType, Subclass, WrapSubclass, entity_id,
};
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;
use crate::utils::kv3;

// ===================================================== Raw KV3 shape

#[derive(Debug, Deserialize)]
struct RawHorizontalRecoil {
    #[serde(default, rename = "m_Range")]
    range: Option<RecoilRange>,
    #[serde(default, rename = "m_flBurstExponent")]
    burst_exponent: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawVerticalRecoil {
    #[serde(default, rename = "m_Range")]
    range: Option<RecoilRange>,
    #[serde(default, rename = "m_flBurstExponent")]
    burst_exponent: Option<f64>,
    #[serde(default, rename = "m_flBurstConstant")]
    burst_constant: Option<f64>,
    #[serde(default, rename = "m_flBurstSlope")]
    burst_slope: Option<f64>,
}

/// Recoil `m_Range` is either a `[min, max]` array or a single scalar.
#[derive(Debug, Serialize, Deserialize, Clone, ToSchema)]
#[serde(untagged)]
pub(crate) enum RecoilRange {
    Range(Vec<f64>),
    Float(f64),
}

/// Source data emits spread penalties as either a list of floats or a string
/// (sometimes a comma-separated list, sometimes a literal label).
#[derive(Debug, Serialize, Deserialize, Clone, ToSchema)]
#[serde(untagged)]
pub(crate) enum SpreadPenalty {
    List(Vec<f64>),
    Str(String),
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_excessive_bools)]
struct RawWeaponInfo {
    #[serde(default, rename = "m_bCanZoom")]
    can_zoom: Option<bool>,
    #[serde(default, rename = "m_flBulletDamage")]
    bullet_damage: Option<f64>,
    #[serde(default, rename = "m_flBulletGravityScale")]
    bullet_gravity_scale: Option<f64>,
    #[serde(default, rename = "m_flBulletInheritShooterVelocityScale")]
    bullet_inherit_shooter_velocity_scale: Option<f64>,
    #[serde(default, rename = "m_flBulletLifetime")]
    bullet_lifetime: Option<f64>,
    #[serde(default, rename = "m_flBulletRadius")]
    bullet_radius: Option<f64>,
    #[serde(default, rename = "m_flBulletRadiusVsWorld")]
    bullet_radius_vs_world: Option<f64>,
    #[serde(default, rename = "m_flBulletReflectAmount")]
    bullet_reflect_amount: Option<f64>,
    #[serde(default, rename = "m_flBulletReflectScale")]
    bullet_reflect_scale: Option<f64>,
    #[serde(default, rename = "m_flBulletWhizDistance")]
    bullet_whiz_distance: Option<f64>,
    #[serde(default, rename = "m_flBurstShotCooldown")]
    burst_shot_cooldown: Option<f64>,
    #[serde(default, rename = "m_flCritBonusAgainstNpcs")]
    crit_bonus_against_npcs: Option<f64>,
    #[serde(default, rename = "m_flCritBonusEnd")]
    crit_bonus_end: Option<f64>,
    #[serde(default, rename = "m_flCritBonusEndRange")]
    crit_bonus_end_range: Option<f64>,
    #[serde(default, rename = "m_flCritBonusStart")]
    crit_bonus_start: Option<f64>,
    #[serde(default, rename = "m_flCritBonusStartRange")]
    crit_bonus_start_range: Option<f64>,
    #[serde(default, rename = "m_flCycleTime")]
    cycle_time: Option<f64>,
    #[serde(default, rename = "m_bSpinsUp")]
    spins_up: Option<bool>,
    #[serde(default, rename = "m_bIsSemiAuto")]
    is_semi_auto: Option<bool>,
    #[serde(default, rename = "m_flSemiAutoCycleRate")]
    semi_auto_cycle_rate: Option<f64>,
    #[serde(default, rename = "m_flMaxSpinCycleTime")]
    max_spin_cycle_time: Option<f64>,
    #[serde(default, rename = "m_flSpinIncreaseRate")]
    spin_increase_rate: Option<f64>,
    #[serde(default, rename = "m_flSpinDecayRate")]
    spin_decay_rate: Option<f64>,
    #[serde(default, rename = "m_flBuildUpRate")]
    build_up_rate: Option<f64>,
    #[serde(default, rename = "m_flIntraBurstCycleTime")]
    intra_burst_cycle_time: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffBias")]
    damage_falloff_bias: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffEndRange")]
    damage_falloff_end_range: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffEndScale")]
    damage_falloff_end_scale: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffStartRange")]
    damage_falloff_start_range: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffStartScale")]
    damage_falloff_start_scale: Option<f64>,
    #[serde(default, rename = "m_flHorizontalPunch")]
    horizontal_punch: Option<f64>,
    #[serde(default, rename = "m_flRange")]
    range: Option<f64>,
    #[serde(default, rename = "m_flRecoilRecoveryDelayFactor")]
    recoil_recovery_delay_factor: Option<f64>,
    #[serde(default, rename = "m_flBulletSpeed")]
    bullet_speed: Option<f64>,
    #[serde(default, rename = "m_flRecoilRecoverySpeed")]
    recoil_recovery_speed: Option<f64>,
    #[serde(default, rename = "m_flRecoilShotIndexRecoveryTimeFactor")]
    recoil_shot_index_recovery_time_factor: Option<f64>,
    #[serde(default, rename = "m_flRecoilSpeed")]
    recoil_speed: Option<f64>,
    #[serde(default, rename = "m_flReloadMoveSpeed")]
    reload_move_speed: Option<f64>,
    #[serde(default, rename = "m_flScatterYawScale")]
    scatter_yaw_scale: Option<f64>,
    #[serde(default, rename = "m_AimingShootSpreadPenalty")]
    aiming_shot_spread_penalty: Option<SpreadPenalty>,
    #[serde(default, rename = "m_StandingShootSpreadPenalty")]
    standing_shot_spread_penalty: Option<SpreadPenalty>,
    #[serde(default, rename = "m_flShootMoveSpeedPercent")]
    shoot_move_speed_percent: Option<f64>,
    #[serde(default, rename = "m_flShootSpreadPenaltyDecay")]
    shoot_spread_penalty_decay: Option<f64>,
    #[serde(default, rename = "m_flShootSpreadPenaltyDecayDelay")]
    shoot_spread_penalty_decay_delay: Option<f64>,
    #[serde(default, rename = "m_flShootSpreadPenaltyPerShot")]
    shoot_spread_penalty_per_shot: Option<f64>,
    #[serde(default, rename = "m_flShootingUpSpreadPenalty")]
    shooting_up_spread_penalty: Option<f64>,
    #[serde(default, rename = "m_flVerticalPunch")]
    vertical_punch: Option<f64>,
    #[serde(default, rename = "m_flZoomFov")]
    zoom_fov: Option<f64>,
    #[serde(default, rename = "m_flZoomMoveSpeedPercent")]
    zoom_move_speed_percent: Option<f64>,
    #[serde(default, rename = "m_iBullets")]
    bullets: Option<i64>,
    #[serde(default, rename = "m_flReloadSingleBulletsInitialDelay")]
    reload_single_bullets_initial_delay: Option<f64>,
    #[serde(default, rename = "m_bReloadSingleBullets")]
    reload_single_bullets: Option<bool>,
    #[serde(default, rename = "m_bReloadSingleBulletsAllowCancel")]
    reload_single_bullets_allow_cancel: Option<bool>,
    #[serde(default, rename = "m_iBurstShotCount")]
    burst_shot_count: Option<i64>,
    #[serde(default, rename = "m_iClipSize")]
    clip_size: Option<i64>,
    #[serde(default, rename = "m_flSpread")]
    spread: Option<f64>,
    #[serde(default, rename = "m_flStandingSpread")]
    standing_spread: Option<f64>,
    #[serde(default, rename = "m_flLowAmmoIndicatorThreshold")]
    low_ammo_indicator_threshold: Option<f64>,
    #[serde(default, rename = "m_flRecoilSeed")]
    recoil_seed: Option<f64>,
    // Source data uses either spelling.
    #[serde(default, rename = "m_flReloadDuration")]
    reload_duration_a: Option<f64>,
    #[serde(default, rename = "m_reloadDuration")]
    reload_duration_b: Option<f64>,
    #[serde(default, rename = "m_BulletSpeedCurve")]
    bullet_speed_curve: Option<serde_json::Value>,
    #[serde(default, rename = "m_HorizontalRecoil")]
    horizontal_recoil: Option<RawHorizontalRecoil>,
    #[serde(default, rename = "m_VerticalRecoil")]
    vertical_recoil: Option<RawVerticalRecoil>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawEmpoweredModifierLevel {
    #[serde(default, rename = "m_nMaxHealth")]
    max_health: Option<i64>,
    #[serde(default, rename = "m_flTransitionDuration")]
    transition_duration: Option<f64>,
    #[serde(default, rename = "m_flModelScale")]
    model_scale: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawBulletResistModifier {
    #[serde(default, rename = "m_BulletResist")]
    bullet_resist: Option<i64>,
    #[serde(default, rename = "m_BulletResistReductionPerHero")]
    bullet_resist_reduction_per_hero: Option<i64>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawTrooperDamageReduction {
    #[serde(default, rename = "m_flDamageReductionForTroopers")]
    damage_reduction_for_troopers: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawRangedArmorModifier {
    #[serde(default, rename = "m_flRangeMin")]
    range_min: Option<f64>,
    #[serde(default, rename = "m_flRangeMax")]
    range_max: Option<f64>,
    #[serde(default, rename = "m_flInvulnRange")]
    invuln_range: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawScriptValues {
    #[serde(default, rename = "m_eModifierValue")]
    modifier_value: Option<String>,
    #[serde(default, rename = "m_value")]
    value: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct RawIntrinsicModifiers {
    #[serde(default, rename = "m_vecScriptValues")]
    script_values: Option<Vec<RawScriptValues>>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawObjectiveRegen {
    #[serde(default, rename = "m_flOutOfCombatHealthRegen")]
    out_of_combat_health_regen: Option<f64>,
    #[serde(default, rename = "m_flOutOfCombatRegenDelay")]
    out_of_combat_regen_delay: Option<f64>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct RawObjectiveHealthGrowthPhase {
    #[serde(default, rename = "m_iGrowthPerMinute")]
    growth_per_minute: Option<i64>,
    #[serde(default, rename = "m_flTickRate")]
    tick_rate: Option<f64>,
    #[serde(default, rename = "m_iGrowthStartTimeInMinutes")]
    growth_start_time_in_minutes: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[allow(clippy::struct_excessive_bools)]
struct RawNpcUnit {
    #[serde(default, rename = "m_WeaponInfo")]
    weapon_info: Option<RawWeaponInfo>,
    #[serde(default, rename = "m_nMaxHealth")]
    max_health: Option<i64>,
    #[serde(default, rename = "m_nPhase2Health")]
    phase2_health: Option<i64>,
    #[serde(default, rename = "m_mapBoundAbilities")]
    bound_abilities: Option<IndexMap<String, String>>,
    #[serde(default, rename = "m_iMaxHealthFinal")]
    max_health_final: Option<i64>,
    #[serde(default, rename = "m_iMaxHealthGenerator")]
    max_health_generator: Option<i64>,
    #[serde(default, rename = "m_flEnemyTrooperProtectionRange")]
    enemy_trooper_protection_range: Option<f64>,
    #[serde(default, rename = "m_EmpoweredModifierLevel1")]
    empowered_modifier_level1: Option<WrapSubclass<RawEmpoweredModifierLevel>>,
    #[serde(default, rename = "m_EmpoweredModifierLevel2")]
    empowered_modifier_level2: Option<WrapSubclass<RawEmpoweredModifierLevel>>,
    #[serde(default, rename = "m_BackdoorBulletResistModifier")]
    backdoor_bullet_resist_modifier: Option<WrapSubclass<RawBulletResistModifier>>,
    #[serde(default, rename = "m_ObjectiveRegen")]
    objective_regen: Option<WrapSubclass<RawObjectiveRegen>>,
    #[serde(default, rename = "m_ObjectiveHealthGrowthPhase1")]
    objective_health_growth_phase1: Option<WrapSubclass<RawObjectiveHealthGrowthPhase>>,
    #[serde(default, rename = "m_ObjectiveHealthGrowthPhase2")]
    objective_health_growth_phase2: Option<WrapSubclass<RawObjectiveHealthGrowthPhase>>,
    #[serde(default, rename = "m_EnemyTrooperDamageReduction")]
    enemy_trooper_damage_reduction: Option<WrapSubclass<RawTrooperDamageReduction>>,
    #[serde(default, rename = "m_RangedArmorModifier")]
    ranged_armor_modifier: Option<WrapSubclass<RawRangedArmorModifier>>,
    #[serde(default, rename = "m_vecIntrinsicModifiers")]
    intrinsic_modifiers: Option<Vec<WrapSubclass<RawIntrinsicModifiers>>>,
    #[serde(default, rename = "m_flSightRangePlayers")]
    sight_range_players: Option<f64>,
    #[serde(default, rename = "m_flSightRangeNPCs")]
    sight_range_npcs: Option<f64>,
    #[serde(default, rename = "m_flGoldReward")]
    gold_reward: Option<f64>,
    #[serde(default, rename = "m_flGoldRewardBonusPercentPerMinute")]
    gold_reward_bonus_percent_per_minute: Option<f64>,
    #[serde(default, rename = "m_flPlayerDamageResistPct")]
    player_damage_resist_pct: Option<f64>,
    #[serde(default, rename = "m_flTrooperDamageResistPct")]
    trooper_damage_resist_pct: Option<f64>,
    #[serde(default, rename = "m_flT1BossDamageResistPct")]
    t1_boss_damage_resist_pct: Option<f64>,
    #[serde(default, rename = "m_flT2BossDamageResistPct")]
    t2_boss_damage_resist_pct: Option<f64>,
    #[serde(default, rename = "m_flT3BossDamageResistPct")]
    t3_boss_damage_resist_pct: Option<f64>,
    #[serde(default, rename = "m_flBarrackGuardianDamageResistPct")]
    barrack_guardian_damage_resist_pct: Option<f64>,
    #[serde(default, rename = "m_flNearDeathDuration")]
    near_death_duration: Option<f64>,
    #[serde(default, rename = "m_flLaserDPSToPlayers")]
    laser_dps_to_players: Option<f64>,
    #[serde(default, rename = "m_flLaserDPSMaxHealth")]
    laser_dps_max_health: Option<f64>,
    #[serde(default, rename = "m_flNoShieldLaserDPSToPlayers")]
    no_shield_laser_dps_to_players: Option<f64>,
    #[serde(default, rename = "m_flStompDamage")]
    stomp_damage: Option<f64>,
    #[serde(default, rename = "m_flStompDamageMaxHealthPercent")]
    stomp_damage_max_health_percent: Option<f64>,
    #[serde(default, rename = "m_flStunDuration")]
    stun_duration: Option<f64>,
    #[serde(default, rename = "m_flStompImpactRadius")]
    stomp_impact_radius: Option<f64>,
    #[serde(default, rename = "m_flWalkSpeed")]
    walk_speed: Option<f64>,
    #[serde(default, rename = "m_flRunSpeed")]
    run_speed: Option<f64>,
    #[serde(default, rename = "m_flAcceleration")]
    acceleration: Option<f64>,
    #[serde(default, rename = "m_flMeleeDamage")]
    melee_damage: Option<f64>,
    #[serde(default, rename = "m_bSpawnBreakablesOnDeath")]
    spawn_breakables_on_death: Option<bool>,
    #[serde(default, rename = "m_flMeleeAttemptRange")]
    melee_attempt_range: Option<f64>,
    #[serde(default, rename = "m_flMeleeHitRange")]
    melee_hit_range: Option<f64>,
    #[serde(default, rename = "m_flMeleeDuration")]
    melee_duration: Option<f64>,
    #[serde(default, rename = "m_flAttackT1BossMaxRange")]
    attack_t1_boss_max_range: Option<f64>,
    #[serde(default, rename = "m_flAttackT3BossMaxRange")]
    attack_t3_boss_max_range: Option<f64>,
    #[serde(default, rename = "m_flAttackT3BossPhase2MaxRange")]
    attack_t3_boss_phase2_max_range: Option<f64>,
    #[serde(default, rename = "m_flAttackTrooperMaxRange")]
    attack_trooper_max_range: Option<f64>,
    #[serde(default, rename = "m_flT1BossDPS")]
    t1_boss_dps: Option<f64>,
    #[serde(default, rename = "m_flT1BossDPSBaseResist")]
    t1_boss_dpsbase_resist: Option<f64>,
    #[serde(default, rename = "m_flT1BossDPSMaxResist")]
    t1_boss_dpsmax_resist: Option<f64>,
    #[serde(default, rename = "m_flT1BossDPSMaxResistTimeInSeconds")]
    t1_boss_dpsmax_resist_time_in_seconds: Option<f64>,
    #[serde(default, rename = "m_flT2BossDPS")]
    t2_boss_dps: Option<f64>,
    #[serde(default, rename = "m_flT2BossDPSBaseResist")]
    t2_boss_dpsbase_resist: Option<f64>,
    #[serde(default, rename = "m_flT2BossDPSMaxResist")]
    t2_boss_dpsmax_resist: Option<f64>,
    #[serde(default, rename = "m_flT2BossDPSMaxResistTimeInSeconds")]
    t2_boss_dpsmax_resist_time_in_seconds: Option<f64>,
    #[serde(default, rename = "m_flT3BossDPS")]
    t3_boss_dps: Option<f64>,
    #[serde(default, rename = "m_flGeneratorBossDPS")]
    generator_boss_dps: Option<f64>,
    #[serde(default, rename = "m_flBarrackBossDPS")]
    barrack_boss_dps: Option<f64>,
    #[serde(default, rename = "m_flPlayerDPS")]
    player_dps: Option<f64>,
    #[serde(default, rename = "m_flTrooperDPS")]
    trooper_dps: Option<f64>,
    #[serde(default, rename = "m_HealthBarColorFriend")]
    health_bar_color_friend: Option<Color>,
    #[serde(default, rename = "m_HealthBarColorEnemy")]
    health_bar_color_enemy: Option<Color>,
    #[serde(default, rename = "m_HealthBarColorTeam1")]
    health_bar_color_team1: Option<Color>,
    #[serde(default, rename = "m_HealthBarColorTeam2")]
    health_bar_color_team2: Option<Color>,
    #[serde(default, rename = "m_HealthBarColorTeamNeutral")]
    health_bar_color_team_neutral: Option<Color>,
}

// ===================================================== Public shape

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct HorizontalRecoil {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<RecoilRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub burst_exponent: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct VerticalRecoil {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<RecoilRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub burst_exponent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub burst_constant: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub burst_slope: Option<f64>,
}

#[derive(Debug, Serialize, Clone, Default, ToSchema)]
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct WeaponInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_zoom: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_damage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_gravity_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_inherit_shooter_velocity_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_lifetime: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_radius_vs_world: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_reflect_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_reflect_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_whiz_distance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub burst_shot_cooldown: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crit_bonus_against_npcs: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crit_bonus_end: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crit_bonus_end_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crit_bonus_start: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crit_bonus_start_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cycle_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spins_up: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_semi_auto: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semi_auto_cycle_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_spin_cycle_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spin_increase_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spin_decay_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_up_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intra_burst_cycle_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_falloff_bias: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_falloff_end_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_falloff_end_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_falloff_start_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_falloff_start_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub horizontal_punch: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recoil_recovery_delay_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recoil_recovery_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recoil_shot_index_recovery_time_factor: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recoil_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reload_move_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scatter_yaw_scale: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aiming_shot_spread_penalty: Option<SpreadPenalty>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standing_shot_spread_penalty: Option<SpreadPenalty>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shoot_move_speed_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shoot_spread_penalty_decay: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shoot_spread_penalty_decay_delay: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shoot_spread_penalty_per_shot: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shooting_up_spread_penalty: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_punch: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_fov: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_move_speed_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullets: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reload_single_bullets_initial_delay: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reload_single_bullets: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reload_single_bullets_allow_cancel: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub burst_shot_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clip_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spread: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub standing_spread: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub low_ammo_indicator_threshold: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recoil_seed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reload_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_speed_curve: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub horizontal_recoil: Option<HorizontalRecoil>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_recoil: Option<VerticalRecoil>,
    // ---- computed ----
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shots_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shots_per_second_with_reload: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullets_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullets_per_second_with_reload: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_per_second: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_per_second_with_reload: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_per_shot: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_per_magazine: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct EmpoweredModifierLevel {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_health: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_scale: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct BulletResistModifier {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_resist: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bullet_resist_reduction_per_hero: Option<i64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct TrooperDamageReduction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage_reduction_for_troopers: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct RangedArmorModifier {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invuln_range: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ScriptValues {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifier_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct IntrinsicModifiers {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_values: Option<Vec<ScriptValues>>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ObjectiveRegen {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub out_of_combat_health_regen: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub out_of_combat_regen_delay: Option<f64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct ObjectiveHealthGrowthPhase {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub growth_per_minute: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tick_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub growth_start_time_in_minutes: Option<i64>,
}

#[derive(Debug, Serialize, Clone, ToSchema)]
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct NpcUnit {
    pub class_name: String,
    pub id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weapon_info: Option<WeaponInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_health: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase2_health: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Option<std::collections::HashMap<HeroItemType, String>>)]
    pub bound_abilities: Option<IndexMap<HeroItemType, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_health_final: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_health_generator: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enemy_trooper_protection_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub empowered_modifier_level1: Option<Subclass<EmpoweredModifierLevel>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub empowered_modifier_level2: Option<Subclass<EmpoweredModifierLevel>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backdoor_bullet_resist_modifier: Option<Subclass<BulletResistModifier>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective_regen: Option<Subclass<ObjectiveRegen>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective_health_growth_phase1: Option<Subclass<ObjectiveHealthGrowthPhase>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective_health_growth_phase2: Option<Subclass<ObjectiveHealthGrowthPhase>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enemy_trooper_damage_reduction: Option<Subclass<TrooperDamageReduction>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ranged_armor_modifier: Option<Subclass<RangedArmorModifier>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intrinsic_modifiers: Option<Vec<Subclass<IntrinsicModifiers>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sight_range_players: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sight_range_npcs: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_reward: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gold_reward_bonus_percent_per_minute: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_damage_resist_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trooper_damage_resist_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t1_boss_damage_resist_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t2_boss_damage_resist_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t3_boss_damage_resist_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub barrack_guardian_damage_resist_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub near_death_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub laser_dps_to_players: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub laser_dps_max_health: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_shield_laser_dps_to_players: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stomp_damage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stomp_damage_max_health_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stun_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stomp_impact_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub walk_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_speed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acceleration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub melee_damage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spawn_breakables_on_death: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub melee_attempt_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub melee_hit_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub melee_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack_t1_boss_max_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack_t3_boss_max_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack_t3_boss_phase2_max_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attack_trooper_max_range: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t1_boss_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t1_boss_dpsbase_resist: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t1_boss_dpsmax_resist: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t1_boss_dpsmax_resist_time_in_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t2_boss_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t2_boss_dpsbase_resist: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t2_boss_dpsmax_resist: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t2_boss_dpsmax_resist_time_in_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t3_boss_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generator_boss_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub barrack_boss_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trooper_dps: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_bar_color_friend: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_bar_color_enemy: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_bar_color_team1: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_bar_color_team2: Option<Color>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_bar_color_team_neutral: Option<Color>,
}

// ===================================================== Build

pub(crate) fn build_npc_units(vdata: &str) -> Result<Vec<NpcUnit>, AssetsError> {
    let root: IndexMap<String, serde_json::Value> = kv3::from_str(vdata)?;
    let mut out = Vec::with_capacity(root.len());
    for (class_name, value) in root {
        if !value.is_object() {
            // `generic_data_type` and other scalar top-level keys.
            continue;
        }
        let raw: RawNpcUnit = match serde_json::from_value(value) {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("Skipping npc unit {class_name}: {e}");
                continue;
            }
        };
        out.push(transform(class_name, raw));
    }
    Ok(out)
}

#[allow(clippy::too_many_lines)]
fn transform(class_name: String, r: RawNpcUnit) -> NpcUnit {
    let id = entity_id(&class_name);

    let bound_abilities = r.bound_abilities.map(|m| {
        m.into_iter()
            .filter_map(|(k, v)| k.parse::<HeroItemType>().ok().map(|k| (k, v)))
            .collect::<IndexMap<HeroItemType, String>>()
    });

    NpcUnit {
        weapon_info: r.weapon_info.map(weapon_info_out),
        max_health: r.max_health,
        phase2_health: r.phase2_health,
        bound_abilities,
        max_health_final: r.max_health_final,
        max_health_generator: r.max_health_generator,
        enemy_trooper_protection_range: r.enemy_trooper_protection_range,
        empowered_modifier_level1: r.empowered_modifier_level1.map(|s| Subclass {
            subclass: empowered_out(s.subclass),
        }),
        empowered_modifier_level2: r.empowered_modifier_level2.map(|s| Subclass {
            subclass: empowered_out(s.subclass),
        }),
        backdoor_bullet_resist_modifier: r.backdoor_bullet_resist_modifier.map(|s| Subclass {
            subclass: bullet_resist_out(s.subclass),
        }),
        objective_regen: r.objective_regen.map(|s| Subclass {
            subclass: objective_regen_out(s.subclass),
        }),
        objective_health_growth_phase1: r.objective_health_growth_phase1.map(|s| Subclass {
            subclass: obj_health_phase_out(s.subclass),
        }),
        objective_health_growth_phase2: r.objective_health_growth_phase2.map(|s| Subclass {
            subclass: obj_health_phase_out(s.subclass),
        }),
        enemy_trooper_damage_reduction: r.enemy_trooper_damage_reduction.map(|s| Subclass {
            subclass: trooper_dmg_out(s.subclass),
        }),
        ranged_armor_modifier: r.ranged_armor_modifier.map(|s| Subclass {
            subclass: ranged_armor_out(s.subclass),
        }),
        intrinsic_modifiers: r.intrinsic_modifiers.map(|v| {
            v.into_iter()
                .map(|s| Subclass {
                    subclass: IntrinsicModifiers {
                        script_values: s.subclass.script_values.map(|sv| {
                            sv.into_iter()
                                .map(|x| ScriptValues {
                                    modifier_value: x.modifier_value,
                                    value: x.value,
                                })
                                .collect()
                        }),
                    },
                })
                .collect()
        }),
        sight_range_players: r.sight_range_players,
        sight_range_npcs: r.sight_range_npcs,
        gold_reward: r.gold_reward,
        gold_reward_bonus_percent_per_minute: r.gold_reward_bonus_percent_per_minute,
        player_damage_resist_pct: r.player_damage_resist_pct,
        trooper_damage_resist_pct: r.trooper_damage_resist_pct,
        t1_boss_damage_resist_pct: r.t1_boss_damage_resist_pct,
        t2_boss_damage_resist_pct: r.t2_boss_damage_resist_pct,
        t3_boss_damage_resist_pct: r.t3_boss_damage_resist_pct,
        barrack_guardian_damage_resist_pct: r.barrack_guardian_damage_resist_pct,
        near_death_duration: r.near_death_duration,
        laser_dps_to_players: r.laser_dps_to_players,
        laser_dps_max_health: r.laser_dps_max_health,
        no_shield_laser_dps_to_players: r.no_shield_laser_dps_to_players,
        stomp_damage: r.stomp_damage,
        stomp_damage_max_health_percent: r.stomp_damage_max_health_percent,
        stun_duration: r.stun_duration,
        stomp_impact_radius: r.stomp_impact_radius,
        walk_speed: r.walk_speed,
        run_speed: r.run_speed,
        acceleration: r.acceleration,
        melee_damage: r.melee_damage,
        spawn_breakables_on_death: r.spawn_breakables_on_death,
        melee_attempt_range: r.melee_attempt_range,
        melee_hit_range: r.melee_hit_range,
        melee_duration: r.melee_duration,
        attack_t1_boss_max_range: r.attack_t1_boss_max_range,
        attack_t3_boss_max_range: r.attack_t3_boss_max_range,
        attack_t3_boss_phase2_max_range: r.attack_t3_boss_phase2_max_range,
        attack_trooper_max_range: r.attack_trooper_max_range,
        t1_boss_dps: r.t1_boss_dps,
        t1_boss_dpsbase_resist: r.t1_boss_dpsbase_resist,
        t1_boss_dpsmax_resist: r.t1_boss_dpsmax_resist,
        t1_boss_dpsmax_resist_time_in_seconds: r.t1_boss_dpsmax_resist_time_in_seconds,
        t2_boss_dps: r.t2_boss_dps,
        t2_boss_dpsbase_resist: r.t2_boss_dpsbase_resist,
        t2_boss_dpsmax_resist: r.t2_boss_dpsmax_resist,
        t2_boss_dpsmax_resist_time_in_seconds: r.t2_boss_dpsmax_resist_time_in_seconds,
        t3_boss_dps: r.t3_boss_dps,
        generator_boss_dps: r.generator_boss_dps,
        barrack_boss_dps: r.barrack_boss_dps,
        player_dps: r.player_dps,
        trooper_dps: r.trooper_dps,
        health_bar_color_friend: r.health_bar_color_friend,
        health_bar_color_enemy: r.health_bar_color_enemy,
        health_bar_color_team1: r.health_bar_color_team1,
        health_bar_color_team2: r.health_bar_color_team2,
        health_bar_color_team_neutral: r.health_bar_color_team_neutral,
        class_name,
        id,
    }
}

fn empowered_out(r: RawEmpoweredModifierLevel) -> EmpoweredModifierLevel {
    EmpoweredModifierLevel {
        max_health: r.max_health,
        transition_duration: r.transition_duration,
        model_scale: r.model_scale,
    }
}
fn bullet_resist_out(r: RawBulletResistModifier) -> BulletResistModifier {
    BulletResistModifier {
        bullet_resist: r.bullet_resist,
        bullet_resist_reduction_per_hero: r.bullet_resist_reduction_per_hero,
    }
}
fn trooper_dmg_out(r: RawTrooperDamageReduction) -> TrooperDamageReduction {
    TrooperDamageReduction {
        damage_reduction_for_troopers: r.damage_reduction_for_troopers,
    }
}
fn ranged_armor_out(r: RawRangedArmorModifier) -> RangedArmorModifier {
    RangedArmorModifier {
        range_min: r.range_min,
        range_max: r.range_max,
        invuln_range: r.invuln_range,
    }
}
fn objective_regen_out(r: RawObjectiveRegen) -> ObjectiveRegen {
    ObjectiveRegen {
        out_of_combat_health_regen: r.out_of_combat_health_regen,
        out_of_combat_regen_delay: r.out_of_combat_regen_delay,
    }
}
fn obj_health_phase_out(r: RawObjectiveHealthGrowthPhase) -> ObjectiveHealthGrowthPhase {
    ObjectiveHealthGrowthPhase {
        growth_per_minute: r.growth_per_minute,
        tick_rate: r.tick_rate,
        growth_start_time_in_minutes: r.growth_start_time_in_minutes,
    }
}

#[allow(clippy::too_many_lines)]
fn weapon_info_out(r: RawWeaponInfo) -> WeaponInfo {
    let reload_duration = r.reload_duration_a.or(r.reload_duration_b);
    let cycle_time = r.cycle_time;
    let intra_burst = r.intra_burst_cycle_time;
    let burst_shot_count = r.burst_shot_count;
    let clip_size = r.clip_size;
    let recoil_recov = r.recoil_shot_index_recovery_time_factor;
    let bullets = r.bullets;
    let bullet_damage = r.bullet_damage;

    let shots_per_second = cycle_time.map(|ct| {
        #[allow(clippy::cast_precision_loss)]
        let bc = burst_shot_count.unwrap_or(1) as f64;
        let ib = intra_burst.unwrap_or(0.0);
        let adjusted = bc * ib + ct;
        if adjusted == 0.0 { 0.0 } else { bc / adjusted }
    });

    let shots_per_second_with_reload = match (cycle_time, reload_duration, clip_size) {
        (Some(ct), Some(reload), Some(cs)) => {
            let bc_i = burst_shot_count.unwrap_or(1);
            #[allow(clippy::cast_precision_loss)]
            let bc = bc_i as f64;
            let ib = intra_burst.unwrap_or(0.0);
            let recoil = recoil_recov.unwrap_or(0.0);
            let full_bursts = if bc_i == 0 { 0 } else { cs.div_euclid(bc_i) };
            let remaining = if bc_i == 0 { 0 } else { cs.rem_euclid(bc_i) };
            #[allow(clippy::cast_precision_loss)]
            let total_burst = (full_bursts as f64) * (bc * ib + ct) - ib;
            #[allow(clippy::cast_precision_loss)]
            let total_remaining = (remaining as f64) * ib;
            let total = total_burst + total_remaining + reload + recoil;
            #[allow(clippy::cast_precision_loss)]
            let cs_f = cs as f64;
            Some(if total == 0.0 { 0.0 } else { cs_f / total })
        }
        _ => None,
    };

    #[allow(clippy::cast_precision_loss)]
    let bullets_f = bullets.map(|b| b as f64);
    let bps = match (shots_per_second, bullets_f) {
        (Some(s), Some(b)) if s != 0.0 && b != 0.0 => Some(s * b),
        _ => None,
    };
    let bps_reload = match (shots_per_second_with_reload, bullets_f) {
        (Some(s), Some(b)) if s != 0.0 && b != 0.0 => Some(s * b),
        _ => None,
    };
    let dps = match (bps, bullet_damage) {
        (Some(b), Some(d)) if b != 0.0 && d != 0.0 => Some(b * d),
        _ => None,
    };
    let dps_reload = match (bps_reload, bullet_damage) {
        (Some(b), Some(d)) if b != 0.0 && d != 0.0 => Some(b * d),
        _ => None,
    };
    let dmg_per_shot = match (bullets_f, bullet_damage) {
        (Some(b), Some(d)) if b != 0.0 && d != 0.0 => Some(b * d),
        _ => None,
    };
    let dmg_per_mag = match (clip_size, dmg_per_shot) {
        (Some(cs), Some(d)) if cs > 0 && d != 0.0 =>
        {
            #[allow(clippy::cast_precision_loss)]
            Some((cs as f64) * d)
        }
        _ => None,
    };

    WeaponInfo {
        can_zoom: r.can_zoom,
        bullet_damage: r.bullet_damage,
        bullet_gravity_scale: r.bullet_gravity_scale,
        bullet_inherit_shooter_velocity_scale: r.bullet_inherit_shooter_velocity_scale,
        bullet_lifetime: r.bullet_lifetime,
        bullet_radius: r.bullet_radius,
        bullet_radius_vs_world: r.bullet_radius_vs_world,
        bullet_reflect_amount: r.bullet_reflect_amount,
        bullet_reflect_scale: r.bullet_reflect_scale,
        bullet_whiz_distance: r.bullet_whiz_distance,
        burst_shot_cooldown: r.burst_shot_cooldown,
        crit_bonus_against_npcs: r.crit_bonus_against_npcs,
        crit_bonus_end: r.crit_bonus_end,
        crit_bonus_end_range: r.crit_bonus_end_range,
        crit_bonus_start: r.crit_bonus_start,
        crit_bonus_start_range: r.crit_bonus_start_range,
        cycle_time: r.cycle_time,
        spins_up: r.spins_up,
        is_semi_auto: r.is_semi_auto,
        semi_auto_cycle_rate: r.semi_auto_cycle_rate,
        max_spin_cycle_time: r.max_spin_cycle_time,
        spin_increase_rate: r.spin_increase_rate,
        spin_decay_rate: r.spin_decay_rate,
        build_up_rate: r.build_up_rate,
        intra_burst_cycle_time: r.intra_burst_cycle_time,
        damage_falloff_bias: r.damage_falloff_bias,
        damage_falloff_end_range: r.damage_falloff_end_range,
        damage_falloff_end_scale: r.damage_falloff_end_scale,
        damage_falloff_start_range: r.damage_falloff_start_range,
        damage_falloff_start_scale: r.damage_falloff_start_scale,
        horizontal_punch: r.horizontal_punch,
        range: r.range,
        recoil_recovery_delay_factor: r.recoil_recovery_delay_factor,
        bullet_speed: r.bullet_speed,
        recoil_recovery_speed: r.recoil_recovery_speed,
        recoil_shot_index_recovery_time_factor: r.recoil_shot_index_recovery_time_factor,
        recoil_speed: r.recoil_speed,
        reload_move_speed: r.reload_move_speed,
        scatter_yaw_scale: r.scatter_yaw_scale,
        aiming_shot_spread_penalty: r
            .aiming_shot_spread_penalty
            .and_then(normalize_spread_penalty),
        standing_shot_spread_penalty: r
            .standing_shot_spread_penalty
            .and_then(normalize_spread_penalty),
        shoot_move_speed_percent: r.shoot_move_speed_percent,
        shoot_spread_penalty_decay: r.shoot_spread_penalty_decay,
        shoot_spread_penalty_decay_delay: r.shoot_spread_penalty_decay_delay,
        shoot_spread_penalty_per_shot: r.shoot_spread_penalty_per_shot,
        shooting_up_spread_penalty: r.shooting_up_spread_penalty,
        vertical_punch: r.vertical_punch,
        zoom_fov: r.zoom_fov,
        zoom_move_speed_percent: r.zoom_move_speed_percent,
        bullets: r.bullets,
        reload_single_bullets_initial_delay: r.reload_single_bullets_initial_delay,
        reload_single_bullets: r.reload_single_bullets,
        reload_single_bullets_allow_cancel: r.reload_single_bullets_allow_cancel,
        burst_shot_count: r.burst_shot_count,
        clip_size: r.clip_size,
        spread: r.spread,
        standing_spread: r.standing_spread,
        low_ammo_indicator_threshold: r.low_ammo_indicator_threshold,
        recoil_seed: r.recoil_seed,
        reload_duration,
        bullet_speed_curve: r.bullet_speed_curve,
        horizontal_recoil: r.horizontal_recoil.map(|h| HorizontalRecoil {
            range: h.range,
            burst_exponent: h.burst_exponent,
        }),
        vertical_recoil: r.vertical_recoil.map(|h| VerticalRecoil {
            range: h.range,
            burst_exponent: h.burst_exponent,
            burst_constant: h.burst_constant,
            burst_slope: h.burst_slope,
        }),
        shots_per_second,
        shots_per_second_with_reload,
        bullets_per_second: bps,
        bullets_per_second_with_reload: bps_reload,
        damage_per_second: dps,
        damage_per_second_with_reload: dps_reload,
        damage_per_shot: dmg_per_shot,
        damage_per_magazine: dmg_per_mag,
    }
}

fn normalize_spread_penalty(p: SpreadPenalty) -> Option<SpreadPenalty> {
    match p {
        SpreadPenalty::List(v) => Some(SpreadPenalty::List(v)),
        SpreadPenalty::Str(s) if s.is_empty() => None,
        SpreadPenalty::Str(s) if s.contains(',') => s
            .split(',')
            .map(|x| x.trim().parse::<f64>().ok())
            .collect::<Option<Vec<f64>>>()
            .map(SpreadPenalty::List),
        SpreadPenalty::Str(s) => Some(SpreadPenalty::Str(s)),
    }
}

// ===================================================== Cached fetch

const CACHE_SIZE: usize = 64;
const CACHE_TTL: Duration = Duration::from_hours(24);

#[cached(
    ty = "LruTtlCache<u32, Arc<Vec<NpcUnit>>>",
    create = "{ LruTtlCache::builder().size(CACHE_SIZE).ttl(CACHE_TTL).build() }",
    convert = "{ version }",
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_npc_units(
    r2: &AmazonS3,
    version: u32,
) -> Result<Arc<Vec<NpcUnit>>, AssetsError> {
    let vdata = store::fetch_text(r2, version, "scripts/npc_units.vdata").await?;
    let units = build_npc_units(&vdata)?;
    Ok(Arc::new(units))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let manifest = env!("CARGO_MANIFEST_DIR");
        std::fs::read_to_string(format!("{manifest}/src/utils/kv3_fixtures/npc_units.vdata"))
            .expect("vdata fixture")
    }

    #[test]
    fn snapshot_npc_units() {
        let units = build_npc_units(&fixture()).expect("builds");
        insta::with_settings!(
            { snapshot_path => "npc_units_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("npc_units", units); }
        );
    }
}
