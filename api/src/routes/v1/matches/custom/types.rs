use crate::utils::parse::default_true_option;
use derive_more::Display;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, Default, Display, ToSchema)]
#[repr(i32)]
pub enum ServerRegion {
    /// Rest of the world, includes North America
    #[default]
    #[display("row")]
    Row = 0,
    #[display("europe")]
    Europe = 1,
    #[display("southeast_asia")]
    SeAsia = 2,
    #[display("south_america")]
    SAmerica = 3,
    #[display("russia")]
    Russia = 4,
    #[display("oceania")]
    Oceania = 5,
}

#[derive(Deserialize, IntoParams, ToSchema)]
pub struct CreateCustomQuery {
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    pub randomize_lanes: Option<bool>,
    #[serde(default = "default_true_option")]
    #[param(default = true)]
    pub is_publicly_visible: Option<bool>,
    #[serde(default)]
    #[param(default)]
    pub cheats_enabled: Option<bool>,
    #[serde(default)]
    #[param(default)]
    pub duplicate_heroes_enabled: Option<bool>,
    #[serde(default)]
    #[param(default)]
    pub experimental_heroes_enabled: Option<bool>,
}

#[derive(Serialize, ToSchema)]
pub struct CreateCustomResponse {
    pub party_id: u64,
    pub party_code: String,
}

#[derive(Deserialize, IntoParams)]
pub struct PartyIdQuery {
    pub party_id: u64,
}

#[derive(Serialize, ToSchema)]
pub struct StartCustomResponse {
    pub message: String,
}
