//! Raw KV3 deserialization types for `abilities.vdata` plus the minimal hero
//! data needed for item linkage. Field aliases are the original `m_*` source
//! names; optional fields default to `None` to tolerate missing keys.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ============================== shared sub-types ==============================

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RawItemWeaponInfoBulletSpeedCurveSpline {
    #[serde(alias = "m_flSlopeIncoming")]
    pub(crate) slope_incoming: f64,
    #[serde(alias = "m_flSlopeOutgoing")]
    pub(crate) slope_outgoing: f64,
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RawItemWeaponInfoBulletSpeedCurve {
    #[serde(default, alias = "m_spline", skip_serializing_if = "Option::is_none")]
    pub(crate) spline: Option<Vec<RawItemWeaponInfoBulletSpeedCurveSpline>>,
    #[serde(alias = "m_vDomainMaxs")]
    pub(crate) domain_maxs: Vec<f64>,
    #[serde(alias = "m_vDomainMins")]
    pub(crate) domain_mins: Vec<f64>,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) struct RawItemWeaponInfoInner {
    #[serde(
        default,
        rename = "m_BulletSpeedCurve",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) bullet_speed_curve: Option<RawItemWeaponInfoBulletSpeedCurve>,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct RawItemPropertyScaleFunctionSubclass {
    #[serde(default, alias = "_class", skip_serializing_if = "Option::is_none")]
    pub(crate) class_name: Option<String>,
    #[serde(
        default,
        alias = "_my_subclass_name",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) subclass_name: Option<String>,
    #[serde(
        default,
        alias = "m_eSpecificStatScaleType",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) specific_stat_scale_type: Option<String>,
    #[serde(
        default,
        alias = "m_vecScalingStats",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) scaling_stats: Option<Vec<String>>,
    #[serde(
        default,
        alias = "m_flStatScale",
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_lenient_opt_f64"
    )]
    pub(crate) stat_scale: Option<f64>,
    #[serde(
        default,
        alias = "m_flStreetBrawlStatScale",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) street_brawl_stat_scale: Option<f64>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawItemPropertyScaleFunctionWrap {
    #[serde(default)]
    pub(crate) subclass: Option<RawItemPropertyScaleFunctionSubclass>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(untagged)]
pub(crate) enum StringOrFloatList {
    List(Vec<f64>),
    Str(String),
}

// ============================== raw item property ==============================

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawItemProperty {
    #[serde(
        default,
        rename = "m_strValue",
        alias = "m_strVAlue",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) value: Option<serde_json::Value>,
    #[serde(default, rename = "m_strStreetBrawlValue")]
    pub(crate) street_brawl_value: Option<serde_json::Value>,
    #[serde(default, rename = "m_bCanSetTokenOverride")]
    pub(crate) can_set_token_override: Option<bool>,
    #[serde(default, rename = "m_eProvidedPropertyType")]
    pub(crate) provided_property_type: Option<String>,
    #[serde(default, rename = "m_strCSSClass")]
    pub(crate) css_class: Option<String>,
    #[serde(default, rename = "m_eStatsUsageFlags")]
    pub(crate) usage_flags: Option<UsageFlagsField>,
    #[serde(default, rename = "m_bIsNegativeAttribute")]
    pub(crate) negative_attribute: Option<bool>,
    #[serde(default, rename = "m_strDisableValue")]
    pub(crate) disable_value: Option<String>,
    #[serde(default, rename = "m_strLocTokenOverride")]
    pub(crate) loc_token_override: Option<String>,
    #[serde(default, rename = "m_eDisplayUnits")]
    pub(crate) display_units: Option<String>,
    #[serde(default, rename = "m_subclassScaleFunction")]
    pub(crate) scale_function: Option<RawItemPropertyScaleFunctionWrap>,
}

#[derive(Debug, Clone)]
pub(crate) enum UsageFlagsField {
    List(Vec<String>),
    Pipe(String),
}

impl<'de> Deserialize<'de> for UsageFlagsField {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(d)?;
        match v {
            serde_json::Value::String(s) => Ok(Self::Pipe(s)),
            serde_json::Value::Array(a) => Ok(Self::List(
                a.into_iter()
                    .filter_map(|x| x.as_str().map(str::to_owned))
                    .collect(),
            )),
            _ => Err(serde::de::Error::custom(
                "usage flags must be string or array",
            )),
        }
    }
}

impl UsageFlagsField {
    pub(crate) fn as_list(&self) -> Vec<String> {
        match self {
            Self::List(v) => v.clone(),
            Self::Pipe(s) => s.split('|').map(|p| p.trim().to_owned()).collect(),
        }
    }
}

/// Source ships some booleans inconsistently: as an actual JSON bool, as the
/// integers `0`/`1`, or as the strings `"true"`/`"false"`/`"0"`/`"1"`.
/// Normalize to `Option<bool>` while tolerating any of these encodings.
fn deserialize_lenient_opt_bool<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<bool>, D::Error> {
    match Option::<serde_json::Value>::deserialize(d)? {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Bool(b)) => Ok(Some(b)),
        Some(serde_json::Value::Number(n)) => Ok(n.as_i64().map(|v| v != 0)),
        Some(serde_json::Value::String(s)) => match s.trim().to_ascii_lowercase().as_str() {
            "true" | "1" => Ok(Some(true)),
            "false" | "0" | "" => Ok(Some(false)),
            other => Err(serde::de::Error::custom(format!(
                "invalid bool string {other}"
            ))),
        },
        Some(other) => Err(serde::de::Error::custom(format!(
            "unexpected bool value {other}"
        ))),
    }
}

/// Source ships some floats as JSON numbers and some as numeric strings
/// (e.g. `"10000"`). Tolerate both into `Option<f64>`.
fn deserialize_lenient_opt_f64<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<f64>, D::Error> {
    match Option::<serde_json::Value>::deserialize(d)? {
        None | Some(serde_json::Value::Null) => Ok(None),
        Some(serde_json::Value::Number(n)) => Ok(n.as_f64()),
        Some(serde_json::Value::String(s)) => s
            .parse::<f64>()
            .map(Some)
            .map_err(|_| serde::de::Error::custom(format!("invalid f64 string {s}"))),
        Some(other) => Err(serde::de::Error::custom(format!(
            "unexpected f64 value {other}"
        ))),
    }
}

/// Source ships item tiers as either the integer `1`-`5` or the string
/// `"EModTier_<n>"`. Normalize to u8.
fn deserialize_item_tier<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u8, D::Error> {
    match serde_json::Value::deserialize(d)? {
        serde_json::Value::Number(n) => n
            .as_u64()
            .and_then(|v| u8::try_from(v).ok())
            .ok_or_else(|| serde::de::Error::custom("item tier out of range")),
        serde_json::Value::String(s) => s
            .strip_prefix("EModTier_")
            .and_then(|n| n.parse::<u8>().ok())
            .ok_or_else(|| serde::de::Error::custom(format!("unknown item tier {s}"))),
        serde_json::Value::Null => Ok(0),
        other => Err(serde::de::Error::custom(format!(
            "unexpected item tier {other}"
        ))),
    }
}

// ============================== ability upgrades ==============================

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct RawAbilityUpgradePropertyUpgrade {
    #[serde(alias = "m_strPropertyName", alias = "m_StrPropertyNAme")]
    pub(crate) name: String,
    #[serde(alias = "m_strBonus")]
    #[schema(value_type = String)]
    pub(crate) bonus: BonusValue,
    #[serde(
        default,
        alias = "m_eScaleStatFilter",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) scale_stat_filter: Option<String>,
    #[serde(
        default,
        alias = "m_eUpgradeType",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) upgrade_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub(crate) enum BonusValue {
    Str(String),
    Float(f64),
}

impl<'de> Deserialize<'de> for BonusValue {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(d)?;
        match v {
            serde_json::Value::String(s) => Ok(Self::Str(s)),
            serde_json::Value::Number(n) => n
                .as_f64()
                .map(Self::Float)
                .ok_or_else(|| serde::de::Error::custom("bonus not numeric")),
            _ => Err(serde::de::Error::custom("bonus must be string or number")),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct RawAbilityUpgrade {
    #[serde(default, alias = "m_vecPropertyUpgrades")]
    pub(crate) property_upgrades: Vec<RawAbilityUpgradePropertyUpgrade>,
}

// ============================== tooltip details ==============================

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawAbilityTooltipDetailsBlockProperty {
    #[serde(default, rename = "m_bRequiresAbilityUpgrade")]
    pub(crate) requires_ability_upgrade: Option<bool>,
    #[serde(default, rename = "m_bShowPropertyValue")]
    pub(crate) show_property_value: Option<bool>,
    #[serde(default, rename = "m_strImportantProperty")]
    pub(crate) important_property: Option<String>,
    #[serde(default, rename = "m_strStatusEffectValue")]
    pub(crate) status_effect_value: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawAbilityTooltipDetailsBlock {
    #[serde(default, rename = "m_strPropertiesTitleLocString")]
    pub(crate) loc_string: Option<String>,
    #[serde(default, rename = "m_vecAbilityProperties")]
    pub(crate) properties: Option<Vec<RawAbilityTooltipDetailsBlockProperty>>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawAbilityTooltipDetailsInfoSection {
    #[serde(default, rename = "m_strAbilityPropertyUpgradeRequired")]
    pub(crate) property_upgrade_required: Option<String>,
    #[serde(default, rename = "m_strLocString")]
    pub(crate) loc_string: Option<String>,
    #[serde(default, rename = "m_vecAbilityPropertiesBlock")]
    pub(crate) properties_block: Option<Vec<RawAbilityTooltipDetailsBlock>>,
    #[serde(default, rename = "m_vecBasicProperties")]
    pub(crate) basic_properties: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawAbilityTooltipDetails {
    #[serde(default, rename = "m_vecAbilityInfoSections")]
    pub(crate) info_sections: Option<Vec<RawAbilityTooltipDetailsInfoSection>>,
    #[serde(default, rename = "m_vecAdditionalHeaderProperties")]
    pub(crate) additional_header_properties: Option<Vec<String>>,
}

// ============================== dependent abilities ==============================

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct DependantAbilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) flags: Option<Vec<String>>,
}

impl<'de> Deserialize<'de> for DependantAbilities {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Helper {
            #[serde(default, rename = "m_eFlags")]
            flags: Option<serde_json::Value>,
        }
        let h = Helper::deserialize(d)?;
        let flags = match h.flags {
            Some(serde_json::Value::String(s)) => {
                Some(s.split('|').map(|p| p.trim().to_owned()).collect())
            }
            Some(serde_json::Value::Array(a)) => Some(
                a.into_iter()
                    .filter_map(|x| x.as_str().map(str::to_owned))
                    .collect(),
            ),
            _ => None,
        };
        Ok(Self { flags })
    }
}

// ============================== upgrade tooltip sections ==============================

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawUpgradeImportantProperty {
    #[serde(default, rename = "m_strImportantProperty")]
    pub(crate) important_property: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawUpgradeTooltipSectionAttribute {
    #[serde(default, rename = "m_strLocString")]
    pub(crate) loc_string: Option<String>,
    #[serde(default, rename = "m_vecAbilityProperties")]
    pub(crate) properties: Option<Vec<String>>,
    #[serde(default, rename = "m_vecElevatedAbilityProperties")]
    pub(crate) elevated_properties: Option<Vec<String>>,
    #[serde(default, rename = "m_vecImportantAbilityProperties")]
    pub(crate) important_properties: Option<Vec<RawUpgradeImportantProperty>>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawUpgradeTooltipSection {
    #[serde(default, rename = "m_eAbilitySectionType")]
    pub(crate) section_type: Option<String>,
    #[serde(rename = "m_vecSectionAttributes")]
    pub(crate) section_attributes: Vec<RawUpgradeTooltipSectionAttribute>,
}

// ============================== weapon info ==============================

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct RawCustomCrosshairSettings {
    #[serde(
        default,
        rename = "m_nPipWidth",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_width: Option<i32>,
    #[serde(
        default,
        rename = "m_nPipHeight",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_height: Option<i32>,
    #[serde(
        default,
        rename = "m_nPipOutlineWidth",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_outline_width: Option<i32>,
    #[serde(
        default,
        rename = "m_nPipOutlineGap",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_outline_gap: Option<i32>,
    #[serde(
        default,
        rename = "m_flPipOpacity",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_opacity: Option<f64>,
    #[serde(
        default,
        rename = "m_flPipOutlineOpacity",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_outline_opacity: Option<f64>,
    #[serde(
        default,
        rename = "m_PipColor",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_color: Option<Vec<i32>>,
    #[serde(
        default,
        rename = "m_PipOutlineColor",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) pip_outline_color: Option<Vec<i32>>,
    #[serde(
        default,
        rename = "m_nDotRadius",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_radius: Option<i32>,
    #[serde(
        default,
        rename = "m_nDotOutlineWidth",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_outline_width: Option<i32>,
    #[serde(
        default,
        rename = "m_nDotOutlineGap",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_outline_gap: Option<i32>,
    #[serde(
        default,
        rename = "m_flDotOpacity",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_opacity: Option<f64>,
    #[serde(
        default,
        rename = "m_flDotOutlineOpacity",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_outline_opacity: Option<f64>,
    #[serde(
        default,
        rename = "m_DotColor",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_color: Option<Vec<i32>>,
    #[serde(
        default,
        rename = "m_DotOutlineColor",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) dot_outline_color: Option<Vec<i32>>,
    #[serde(
        default,
        rename = "m_SpreadIndicatingElement",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) spread_indicating_element: Option<String>,
    #[serde(
        default,
        rename = "m_flBaseSpread",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) base_spread: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct RawWeaponInfoHorizontalRecoil {
    #[serde(default, alias = "m_Range", skip_serializing_if = "Option::is_none")]
    pub(crate) range: Option<serde_json::Value>,
    #[serde(
        default,
        alias = "m_flBurstExponent",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) burst_exponent: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize, Clone, ToSchema)]
pub(crate) struct RawWeaponInfoVerticalRecoil {
    #[serde(default, alias = "m_Range", skip_serializing_if = "Option::is_none")]
    pub(crate) range: Option<serde_json::Value>,
    #[serde(
        default,
        alias = "m_flBurstExponent",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) burst_exponent: Option<f64>,
    #[serde(
        default,
        alias = "m_flBurstConstant",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) burst_constant: Option<f64>,
    #[serde(
        default,
        alias = "m_flBurstSlope",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) burst_slope: Option<f64>,
}

/// `m_WeaponInfo` for weapon-typed items.
#[derive(Debug, Deserialize, Clone, Default)]
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct RawWeaponInfo {
    #[serde(default, rename = "m_bCanZoom")]
    pub(crate) can_zoom: Option<bool>,
    #[serde(default, rename = "m_flBulletDamage")]
    pub(crate) bullet_damage: Option<f64>,
    #[serde(default, rename = "m_flBulletGravityScale")]
    pub(crate) bullet_gravity_scale: Option<f64>,
    #[serde(default, rename = "m_flBulletInheritShooterVelocityScale")]
    pub(crate) bullet_inherit_shooter_velocity_scale: Option<f64>,
    #[serde(default, rename = "m_flBulletLifetime")]
    pub(crate) bullet_lifetime: Option<f64>,
    #[serde(default, rename = "m_flBulletRadius")]
    pub(crate) bullet_radius: Option<f64>,
    #[serde(default, rename = "m_flBulletRadiusVsWorld")]
    pub(crate) bullet_radius_vs_world: Option<f64>,
    #[serde(default, rename = "m_flBulletReflectAmount")]
    pub(crate) bullet_reflect_amount: Option<f64>,
    #[serde(default, rename = "m_flBulletReflectScale")]
    pub(crate) bullet_reflect_scale: Option<f64>,
    #[serde(default, rename = "m_flBulletWhizDistance")]
    pub(crate) bullet_whiz_distance: Option<f64>,
    #[serde(default, rename = "m_flBurstShotCooldown")]
    pub(crate) burst_shot_cooldown: Option<f64>,
    #[serde(default, rename = "m_flCritBonusAgainstNpcs")]
    pub(crate) crit_bonus_against_npcs: Option<f64>,
    #[serde(default, rename = "m_flCritBonusEnd")]
    pub(crate) crit_bonus_end: Option<f64>,
    #[serde(default, rename = "m_flCritBonusEndRange")]
    pub(crate) crit_bonus_end_range: Option<f64>,
    #[serde(default, rename = "m_flCritBonusStart")]
    pub(crate) crit_bonus_start: Option<f64>,
    #[serde(default, rename = "m_flCritBonusStartRange")]
    pub(crate) crit_bonus_start_range: Option<f64>,
    #[serde(default, rename = "m_flCycleTime")]
    pub(crate) cycle_time: Option<f64>,
    #[serde(
        default,
        rename = "m_bSpinsUp",
        deserialize_with = "deserialize_lenient_opt_bool"
    )]
    pub(crate) spins_up: Option<bool>,
    #[serde(default, rename = "m_bIsSemiAuto")]
    pub(crate) is_semi_auto: Option<bool>,
    #[serde(default, rename = "m_flSemiAutoCycleRate")]
    pub(crate) semi_auto_cycle_rate: Option<f64>,
    #[serde(default, rename = "m_flMaxSpinCycleTime")]
    pub(crate) max_spin_cycle_time: Option<f64>,
    #[serde(default, rename = "m_flSpinIncreaseRate")]
    pub(crate) spin_increase_rate: Option<f64>,
    #[serde(default, rename = "m_flSpinDecayRate")]
    pub(crate) spin_decay_rate: Option<f64>,
    #[serde(default, rename = "m_flBuildUpRate")]
    pub(crate) build_up_rate: Option<f64>,
    #[serde(default, rename = "m_flIntraBurstCycleTime")]
    pub(crate) intra_burst_cycle_time: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffBias")]
    pub(crate) damage_falloff_bias: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffEndRange")]
    pub(crate) damage_falloff_end_range: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffEndScale")]
    pub(crate) damage_falloff_end_scale: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffStartRange")]
    pub(crate) damage_falloff_start_range: Option<f64>,
    #[serde(default, rename = "m_flDamageFalloffStartScale")]
    pub(crate) damage_falloff_start_scale: Option<f64>,
    #[serde(default, rename = "m_flHorizontalPunch")]
    pub(crate) horizontal_punch: Option<f64>,
    #[serde(default, rename = "m_flRange")]
    pub(crate) range: Option<f64>,
    #[serde(default, rename = "m_flRecoilRecoveryDelayFactor")]
    pub(crate) recoil_recovery_delay_factor: Option<f64>,
    #[serde(default, rename = "m_flBulletSpeed")]
    pub(crate) bullet_speed: Option<f64>,
    #[serde(default, rename = "m_flRecoilRecoverySpeed")]
    pub(crate) recoil_recovery_speed: Option<f64>,
    #[serde(default, rename = "m_flRecoilShotIndexRecoveryTimeFactor")]
    pub(crate) recoil_shot_index_recovery_time_factor: Option<f64>,
    #[serde(default, rename = "m_flRecoilSpeed")]
    pub(crate) recoil_speed: Option<f64>,
    #[serde(
        default,
        rename = "m_flReloadMoveSpeed",
        deserialize_with = "deserialize_lenient_opt_f64"
    )]
    pub(crate) reload_move_speed: Option<f64>,
    #[serde(default, rename = "m_flScatterYawScale")]
    pub(crate) scatter_yaw_scale: Option<f64>,
    #[serde(default, rename = "m_AimingShootSpreadPenalty")]
    pub(crate) aiming_shot_spread_penalty: Option<StringOrFloatList>,
    #[serde(default, rename = "m_StandingShootSpreadPenalty")]
    pub(crate) standing_shot_spread_penalty: Option<StringOrFloatList>,
    #[serde(default, rename = "m_flShootMoveSpeedPercent")]
    pub(crate) shoot_move_speed_percent: Option<f64>,
    #[serde(default, rename = "m_flShootSpreadPenaltyDecay")]
    pub(crate) shoot_spread_penalty_decay: Option<f64>,
    #[serde(default, rename = "m_flShootSpreadPenaltyDecayDelay")]
    pub(crate) shoot_spread_penalty_decay_delay: Option<f64>,
    #[serde(default, rename = "m_flShootSpreadPenaltyPerShot")]
    pub(crate) shoot_spread_penalty_per_shot: Option<f64>,
    #[serde(default, rename = "m_flShootingUpSpreadPenalty")]
    pub(crate) shooting_up_spread_penalty: Option<f64>,
    #[serde(default, rename = "m_flVerticalPunch")]
    pub(crate) vertical_punch: Option<f64>,
    #[serde(default, rename = "m_flZoomFov")]
    pub(crate) zoom_fov: Option<f64>,
    #[serde(default, rename = "m_flZoomMoveSpeedPercent")]
    pub(crate) zoom_move_speed_percent: Option<f64>,
    #[serde(default, rename = "m_iBullets")]
    pub(crate) bullets: Option<u32>,
    #[serde(default, rename = "m_flReloadSingleBulletsInitialDelay")]
    pub(crate) reload_single_bullets_initial_delay: Option<f64>,
    #[serde(default, rename = "m_bReloadSingleBullets")]
    pub(crate) reload_single_bullets: Option<bool>,
    #[serde(default, rename = "m_bReloadSingleBulletsAllowCancel")]
    pub(crate) reload_single_bullets_allow_cancel: Option<bool>,
    #[serde(default, rename = "m_iBurstShotCount")]
    pub(crate) burst_shot_count: Option<u32>,
    #[serde(default, rename = "m_iClipSize")]
    pub(crate) clip_size: Option<u32>,
    #[serde(default, rename = "m_flSpread")]
    pub(crate) spread: Option<f64>,
    #[serde(default, rename = "m_flStandingSpread")]
    pub(crate) standing_spread: Option<f64>,
    #[serde(default, rename = "m_flLowAmmoIndicatorThreshold")]
    pub(crate) low_ammo_indicator_threshold: Option<f64>,
    #[serde(default, rename = "m_flRecoilSeed")]
    pub(crate) recoil_seed: Option<f64>,
    #[serde(default, rename = "m_flReloadDuration", alias = "m_reloadDuration")]
    pub(crate) reload_duration: Option<f64>,
    #[serde(default, rename = "m_BulletSpeedCurve")]
    pub(crate) bullet_speed_curve: Option<RawItemWeaponInfoBulletSpeedCurve>,
    #[serde(default, rename = "m_HorizontalRecoil")]
    pub(crate) horizontal_recoil: Option<RawWeaponInfoHorizontalRecoil>,
    #[serde(default, rename = "m_VerticalRecoil")]
    pub(crate) vertical_recoil: Option<RawWeaponInfoVerticalRecoil>,
}

// ============================== item variants ==============================

#[derive(Debug, Deserialize, Clone, Default)]
pub(crate) struct RawItemBaseFields {
    #[serde(
        default,
        rename = "m_bStartTrained",
        deserialize_with = "deserialize_lenient_opt_bool"
    )]
    pub(crate) start_trained: Option<bool>,
    #[serde(default, rename = "m_strAbilityImage")]
    pub(crate) image: Option<String>,
    #[serde(default, rename = "m_iUpdateTime")]
    pub(crate) update_time: Option<i64>,
    #[serde(default, rename = "m_mapAbilityProperties")]
    pub(crate) properties: Option<IndexMap<String, RawItemProperty>>,
    #[serde(default, rename = "m_WeaponInfo")]
    pub(crate) weapon_info_inner: Option<RawItemWeaponInfoInner>,
    #[serde(default, rename = "m_strCSSClass")]
    pub(crate) css_class: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawAbility {
    #[serde(flatten)]
    pub(crate) base: RawItemBaseFields,
    #[serde(default, rename = "m_bGrantAmmoOnCast")]
    pub(crate) grant_ammo_on_cast: Option<bool>,
    #[serde(default, rename = "m_AbilityBehaviorsBits")]
    pub(crate) behaviour_bits: Option<String>,
    #[serde(default, rename = "m_vecAbilityUpgrades")]
    pub(crate) upgrades: Option<Vec<RawAbilityUpgrade>>,
    #[serde(default, rename = "m_eAbilityType")]
    pub(crate) ability_type: Option<String>,
    #[serde(default, rename = "m_flBossDamageScale")]
    pub(crate) boss_damage_scale: Option<f64>,
    #[serde(default, rename = "m_vecDependentAbilities")]
    pub(crate) dependant_abilities: Option<Vec<String>>,
    #[serde(default, rename = "m_strMoviePreviewPath")]
    pub(crate) video: Option<String>,
    #[serde(default, rename = "m_AbilityTooltipDetails")]
    pub(crate) tooltip_details: Option<RawAbilityTooltipDetails>,
    #[serde(default, rename = "m_mapDependentAbilities")]
    pub(crate) dependent_abilities: Option<IndexMap<String, Option<DependantAbilities>>>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawUpgrade {
    #[serde(flatten)]
    pub(crate) base: RawItemBaseFields,
    #[serde(default, rename = "m_strShopIconLarge")]
    pub(crate) shop_image: Option<String>,
    #[serde(default, rename = "m_strShopIconSmall")]
    pub(crate) shop_image_small: Option<String>,
    #[serde(default, rename = "m_eItemSlotType")]
    pub(crate) item_slot_type: String,
    #[serde(
        default,
        rename = "m_iItemTier",
        deserialize_with = "deserialize_item_tier"
    )]
    pub(crate) item_tier: u8,
    #[serde(
        default,
        rename = "m_bDisabled",
        deserialize_with = "deserialize_lenient_opt_bool"
    )]
    pub(crate) disabled: Option<bool>,
    #[serde(default, rename = "m_eAbilityActivation")]
    pub(crate) activation: Option<String>,
    #[serde(default, rename = "m_TargetAbilityEffectsToApply")]
    pub(crate) imbue: Option<String>,
    #[serde(default, rename = "m_vecComponentItems")]
    pub(crate) component_items: Option<Vec<String>>,
    #[serde(default, rename = "m_vecTooltipSectionInfo")]
    pub(crate) tooltip_sections: Option<Vec<RawUpgradeTooltipSection>>,
    #[serde(default, rename = "m_vecAbilityUpgrades")]
    pub(crate) upgrades: Option<Vec<RawAbilityUpgrade>>,
}

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawWeapon {
    #[serde(flatten)]
    pub(crate) base: RawItemBaseFields,
    #[serde(default, rename = "m_WeaponInfo")]
    pub(crate) weapon_info: Option<RawWeaponInfo>,
    #[serde(default, rename = "m_strCrosshairCSSClass")]
    pub(crate) crosshair_css_class: Option<String>,
    #[serde(default, rename = "m_bUseCustomCrosshairSettings")]
    pub(crate) use_custom_crosshair_settings: Option<bool>,
    #[serde(default, rename = "m_CustomCrosshairSettings")]
    pub(crate) custom_crosshair_settings: Option<RawCustomCrosshairSettings>,
}

// ============================== minimal hero linkage ==============================

#[derive(Debug, Deserialize, Clone)]
pub(crate) struct RawHeroLite {
    #[serde(rename = "m_HeroID")]
    pub(crate) id: u32,
    pub(crate) class_name: String,
    /// Stored as raw strings to tolerate new/unknown slot keys; we only need
    /// the values (item `class_name`s) for linkage.
    #[serde(rename = "m_mapBoundAbilities")]
    pub(crate) items: IndexMap<String, String>,
}
