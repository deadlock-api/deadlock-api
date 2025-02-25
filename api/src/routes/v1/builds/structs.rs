use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsCategoryAbility {
    ability_id: u32,
    annotation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsCategory {
    name: String,
    width: Option<f32>,
    height: Option<f32>,
    description: Option<String>,
    mods: Option<Vec<BuildHeroDetailsCategoryAbility>>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsAbilityOrderCurrencyChange {
    ability_id: u32,
    currency_type: i32,
    delta: i32,
    annotation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetailsAbilityOrder {
    currency_changes: Option<Vec<BuildHeroDetailsAbilityOrderCurrencyChange>>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHeroDetails {
    mod_categories: Vec<BuildHeroDetailsCategory>,
    ability_order: Option<BuildHeroDetailsAbilityOrder>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildHero {
    hero_id: u32,
    hero_build_id: u32,
    author_account_id: u32,
    last_updated_timestamp: i64,
    name: String,
    description: Option<String>,
    language: u32,
    version: u32,
    origin_build_id: u32,
    details: BuildHeroDetails,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct BuildPreference {
    favorited: bool,
    ignored: bool,
    reported: bool,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub struct Build {
    hero_build: BuildHero,
    #[serde(default)]
    num_favorites: u32,
    #[serde(default)]
    num_ignores: u32,
    #[serde(default)]
    num_reports: u32,
    preference: Option<BuildPreference>,
}
