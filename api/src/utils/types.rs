use serde::Deserialize;
use strum::Display;
use utoipa::{IntoParams, ToSchema};

use crate::utils::parse::parse_steam_id;

#[derive(Deserialize, IntoParams, Copy, Clone)]
pub(crate) struct AccountIdQuery {
    /// The players `SteamID3`
    #[serde(deserialize_with = "parse_steam_id")]
    pub(crate) account_id: u32,
}

#[derive(Deserialize, IntoParams, Copy, Clone)]
pub(crate) struct MatchIdQuery {
    /// The match ID
    pub(crate) match_id: u64,
}

#[derive(Copy, Clone, Debug, Deserialize, ToSchema, Default, Display, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(crate) enum SortDirectionAsc {
    /// Sort in descending order.
    Desc,
    /// Sort in ascending order. (default)
    #[default]
    Asc,
}

#[derive(Copy, Clone, Debug, Deserialize, ToSchema, Default, Display, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum SortDirectionDesc {
    /// Sort in descending order. (default)
    #[default]
    Desc,
    /// Sort in ascending order.
    Asc,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sort_direction_asc() {
        assert_eq!(SortDirectionAsc::default().to_string(), "asc");
        assert_eq!(SortDirectionAsc::Asc.to_string(), "asc");
        assert_eq!(SortDirectionAsc::Desc.to_string(), "desc");
    }

    #[test]
    fn test_sort_direction_desc() {
        assert_eq!(SortDirectionDesc::default().to_string(), "desc");
        assert_eq!(SortDirectionDesc::Desc.to_string(), "desc");
        assert_eq!(SortDirectionDesc::Asc.to_string(), "asc");
    }
}
