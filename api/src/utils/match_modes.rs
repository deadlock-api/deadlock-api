//! The game and match modes the analytics, player and match routes filter on.

use itertools::Itertools as _;
use serde::{Deserialize, Deserializer, Serialize};
use strum::{Display, EnumString, FromRepr};
use utoipa::ToSchema;

#[derive(
    FromRepr,
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    ToSchema,
    Display,
    PartialEq,
    Eq,
    Hash,
    Default,
)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
#[repr(i32)]
pub enum GameMode {
    #[default]
    Normal = 1,
    StreetBrawl = 4,
    ExploreNYC = 5,
    Internal = 6,
    Internal02 = 7,
}

#[derive(
    FromRepr,
    Debug,
    Clone,
    Copy,
    Serialize,
    Deserialize,
    ToSchema,
    Display,
    EnumString,
    PartialEq,
    Eq,
    Hash,
)]
#[cfg_attr(test, derive(proptest_derive::Arbitrary))]
#[serde(rename_all = "snake_case")]
#[repr(i32)]
pub(crate) enum MatchMode {
    #[strum(serialize = "unranked", to_string = "Unranked")]
    Unranked = 1,
    #[strum(serialize = "private_lobby", to_string = "PrivateLobby")]
    PrivateLobby = 2,
    #[strum(serialize = "coop_bot", to_string = "CoopBot")]
    CoopBot = 3,
    #[strum(serialize = "ranked", to_string = "Ranked")]
    Ranked = 4,
    #[strum(serialize = "server_test", to_string = "ServerTest")]
    ServerTest = 5,
    #[strum(serialize = "tutorial", to_string = "Tutorial")]
    Tutorial = 6,
    #[strum(serialize = "hero_labs", to_string = "HeroLabs")]
    HeroLabs = 7,
    #[serde(alias = "calibration")]
    #[strum(
        serialize = "calibration",
        serialize = "new_player_placement",
        to_string = "NewPlayerPlacement"
    )]
    NewPlayerPlacement = 8,
}

impl MatchMode {
    /// Returns a SQL filter clause for `match_mode`.
    /// If specific modes are provided, filters to those modes.
    /// If None, defaults to `Ranked` and `Unranked`.
    pub(crate) fn sql_filter(match_modes: Option<&[Self]>) -> String {
        Self::sql_filter_with_prefix(match_modes, "")
    }

    /// Same as [`Self::sql_filter`] but qualifies the column reference with the given
    /// prefix (e.g. `"mp."`). Use when the surrounding query joins another table that
    /// also has a `match_mode` column.
    pub(crate) fn sql_filter_with_prefix(match_modes: Option<&[Self]>, prefix: &str) -> String {
        match match_modes {
            Some([mode]) => format!("{prefix}match_mode = '{mode}'"),
            Some(modes) if !modes.is_empty() => format!(
                "{prefix}match_mode IN ({})",
                modes.iter().map(|m| format!("'{m}'")).join(", ")
            ),
            _ => format!(
                "{prefix}match_mode IN ('{}', '{}')",
                Self::Ranked,
                Self::Unranked
            ),
        }
    }

    /// Whether every requested mode is covered by the `Ranked` + `Unranked` set the
    /// pre-aggregated rollups are built from. A query selecting anything outside that
    /// set would silently read zero rows from a rollup, so it must use the base table.
    pub(crate) fn is_agg_servable(match_modes: Option<&[Self]>) -> bool {
        match match_modes {
            Some(modes) if !modes.is_empty() => modes
                .iter()
                .all(|m| matches!(m, Self::Ranked | Self::Unranked)),
            _ => true,
        }
    }

    /// SQL predicate for the pre-aggregated rollups, or `None` when no predicate is
    /// needed. The rollups only ingest `Ranked` + `Unranked`, so a request covering
    /// both already matches every row and the predicate is omitted. Omitting it also
    /// keeps rows written before `match_mode` joined the rollup grain (stored as
    /// `Invalid`) counted, so totals stay correct while a rebuild is still in flight.
    ///
    /// Callers must first check [`Self::is_agg_servable`]; a non-servable set has no
    /// valid rollup predicate.
    pub(crate) fn agg_sql_filter(match_modes: Option<&[Self]>) -> Option<String> {
        let modes = match_modes?;
        // A list may repeat a mode (`Ranked,Ranked`); it narrows unless it names both.
        let names_both = modes.contains(&Self::Ranked) && modes.contains(&Self::Unranked);
        let narrows = !modes.is_empty() && !names_both;
        narrows.then(|| Self::sql_filter(Some(modes)))
    }
}

impl GameMode {
    #[expect(
        clippy::unnecessary_wraps,
        reason = "serde default fn must return the field type"
    )]
    pub const fn default_option() -> Option<Self> {
        Some(Self::Normal)
    }

    /// Returns a SQL filter clause for `game_mode`.
    /// If a specific game mode is provided, returns `game_mode = {value}`.
    /// If None, no filter is applied.
    pub fn sql_filter(game_mode: Option<Self>) -> String {
        Self::sql_filter_with_prefix(game_mode, "")
    }

    /// Same as [`Self::sql_filter`] but qualifies the column reference with the given
    /// prefix (e.g. `"mp."`).
    pub fn sql_filter_with_prefix(game_mode: Option<Self>, prefix: &str) -> String {
        game_mode.map_or_else(
            || "1=1".to_owned(),
            |mode| format!("{prefix}game_mode = {}", mode as i32),
        )
    }

    /// Deserializes an `Option<GameMode>` from a query parameter.
    /// An empty string or missing value deserializes as `None` (no filter).
    pub fn deserialize_option<'de, D>(deserializer: D) -> Result<Option<Self>, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de::IntoDeserializer as _;
        let s = Option::<String>::deserialize(deserializer)?;
        match s.as_deref() {
            None | Some("" | "null") => Ok(None),
            Some(v) => Self::deserialize(v.into_deserializer()).map(Some),
        }
    }
}

/// Street brawl matches carry no average badge, so a badge filter on them can only ever match
/// nothing; reject the combination instead of returning an empty result.
pub(crate) fn reject_brawl_badge_filter(
    game_mode: Option<GameMode>,
    min_average_badge: Option<u8>,
    max_average_badge: Option<u8>,
) -> crate::error::APIResult<()> {
    if game_mode == Some(GameMode::StreetBrawl)
        && (min_average_badge.is_some() || max_average_badge.is_some())
    {
        return Err(crate::error::APIError::status_msg(
            axum::http::StatusCode::BAD_REQUEST,
            "Cannot filter by average badge for street brawl game mode",
        ));
    }
    Ok(())
}

impl From<GameMode> for i32 {
    fn from(val: GameMode) -> Self {
        val as Self
    }
}

impl From<GameMode> for u32 {
    fn from(val: GameMode) -> Self {
        val as Self
    }
}

impl From<i32> for GameMode {
    fn from(val: i32) -> Self {
        Self::from_repr(val).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agg_filter_narrows_unless_both_modes_are_named() {
        let ranked = Some("match_mode = 'Ranked'".to_owned());
        assert_eq!(
            MatchMode::agg_sql_filter(Some(&[MatchMode::Ranked])),
            ranked
        );
        assert!(MatchMode::agg_sql_filter(Some(&[MatchMode::Ranked, MatchMode::Ranked])).is_some());
        assert_eq!(
            MatchMode::agg_sql_filter(Some(&[MatchMode::Ranked, MatchMode::Unranked])),
            None
        );
        assert_eq!(MatchMode::agg_sql_filter(Some(&[])), None);
        assert_eq!(MatchMode::agg_sql_filter(None), None);
    }
}
