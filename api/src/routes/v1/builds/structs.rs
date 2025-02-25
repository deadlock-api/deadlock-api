use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsCategoryAbility {
    pub ability_id: u32,
    pub annotation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsCategory {
    pub name: String,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub description: Option<String>,
    pub mods: Option<Vec<BuildHeroDetailsCategoryAbility>>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsAbilityOrderCurrencyChange {
    pub ability_id: u32,
    pub currency_type: i32,
    pub delta: i32,
    pub annotation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsAbilityOrder {
    pub currency_changes: Option<Vec<BuildHeroDetailsAbilityOrderCurrencyChange>>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetails {
    pub mod_categories: Vec<BuildHeroDetailsCategory>,
    pub ability_order: Option<BuildHeroDetailsAbilityOrder>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHero {
    pub hero_id: u32,
    pub hero_build_id: u32,
    pub author_account_id: u32,
    pub last_updated_timestamp: i64,
    pub name: String,
    pub description: Option<String>,
    pub language: u32,
    pub version: u32,
    pub origin_build_id: u32,
    pub details: BuildHeroDetails,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildPreference {
    pub favorited: bool,
    pub ignored: bool,
    pub reported: bool,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct Build {
    pub hero_build: BuildHero,
    #[serde(default)]
    pub num_favorites: u32,
    #[serde(default)]
    pub num_ignores: u32,
    #[serde(default)]
    pub num_reports: u32,
    pub preference: Option<BuildPreference>,
}
