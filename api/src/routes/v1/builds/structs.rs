use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct BuildHeroDetailsCategoryAbility {
    ability_id: u32,
    annotation: Option<String>,
    required_flex_slots: Option<u32>,
    sell_priority: Option<u32>,
    imbue_target_ability_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct BuildHeroDetailsCategory {
    name: String,
    width: Option<f32>,
    height: Option<f32>,
    description: Option<String>,
    mods: Option<Vec<BuildHeroDetailsCategoryAbility>>,
    optional: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct BuildHeroDetailsAbilityOrderCurrencyChange {
    ability_id: u32,
    currency_type: i32,
    delta: i32,
    annotation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct BuildHeroDetailsAbilityOrder {
    currency_changes: Option<Vec<BuildHeroDetailsAbilityOrderCurrencyChange>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
struct BuildHeroDetails {
    mod_categories: Vec<BuildHeroDetailsCategory>,
    ability_order: Option<BuildHeroDetailsAbilityOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHero {
    /// See more: <https://assets.deadlock-api.com/v2/heroes>
    pub hero_id: u32,
    pub hero_build_id: u32,
    pub author_account_id: u32,
    pub last_updated_timestamp: Option<i64>,
    pub publish_timestamp: Option<i64>,
    pub name: String,
    description: Option<String>,
    language: u32,
    pub version: u32,
    origin_build_id: u32,
    #[serde(default)]
    pub tags: Vec<u32>,
    development_build: Option<bool>,
    details: BuildHeroDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct Build {
    pub hero_build: BuildHero,
    pub num_favorites: Option<u32>,
    pub num_ignores: Option<u32>,
    pub num_reports: Option<u32>,
    pub num_weekly_favorites: Option<u32>,
    rollup_category: Option<u32>,
}
