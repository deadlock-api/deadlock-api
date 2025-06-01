use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsCategoryAbility {
    pub ability_id: u32,
    pub annotation: Option<String>,
    pub required_flex_slots: Option<u32>,
    pub sell_priority: Option<u32>,
    pub imbue_target_ability_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsCategory {
    pub name: String,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub description: Option<String>,
    pub mods: Option<Vec<BuildHeroDetailsCategoryAbility>>,
    pub optional: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsAbilityOrderCurrencyChange {
    pub ability_id: u32,
    pub currency_type: i32,
    pub delta: i32,
    pub annotation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsAbilityOrder {
    pub currency_changes: Option<Vec<BuildHeroDetailsAbilityOrderCurrencyChange>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetails {
    pub mod_categories: Vec<BuildHeroDetailsCategory>,
    pub ability_order: Option<BuildHeroDetailsAbilityOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHero {
    pub hero_id: u32,
    pub hero_build_id: u32,
    pub author_account_id: u32,
    pub last_updated_timestamp: i64,
    pub publish_timestamp: i64,
    pub name: String,
    pub description: Option<String>,
    pub language: u32,
    pub version: u32,
    pub origin_build_id: u32,
    #[serde(default)]
    pub tags: Vec<u32>,
    pub development_build: Option<bool>,
    pub details: BuildHeroDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct Build {
    pub hero_build: BuildHero,
    pub num_favorites: Option<u32>,
    pub num_ignores: Option<u32>,
    pub num_reports: Option<u32>,
    pub num_weekly_favorites: Option<u32>,
    pub rollup_category: Option<u32>,
}
