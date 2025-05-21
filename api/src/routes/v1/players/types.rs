use crate::utils::parse::parse_steam_id;
use serde::Deserialize;
use utoipa::IntoParams;

#[derive(Deserialize, IntoParams, Default)]
pub struct AccountIdQuery {
    /// The players SteamID3
    #[serde(default)]
    #[serde(deserialize_with = "parse_steam_id")]
    pub account_id: u32,
}
