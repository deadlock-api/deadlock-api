//! `/v1/assets/map` data layer.
//!
//! The objective marker positions come from the per-version
//! `styles/objectives_map.css`; the radius, image URLs, and zip-line lane
//! splines ([`geometry`]) are fixed constants.

mod geometry;

use std::collections::HashMap;
use std::sync::Arc;

use cached::LruTtlCache;
use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::Serialize;
use strum::{Display, EnumIter, EnumString, IntoEnumIterator};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{
    Color, DEFAULT_CACHE_SIZE, DEFAULT_CACHE_TTL, IMAGE_BASE_URL,
};
use crate::services::assets::versions::css;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

const MAP_RADIUS: u32 = 10752;
const CSS_PATH: &str = "styles/objectives_map.css";

/// Tower/objective markers. The `serialize` value is the CSS selector to read
/// (drives `FromStr`); the `to_string` value is the output key (drives
/// `Display`). Variant order is the response key order. The `*_tier*_2` markers
/// are absent on the three-lane map, so only they are optional.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, EnumString, Display, EnumIter)]
enum ObjectiveMarker {
    #[strum(serialize = "#Team1Core", to_string = "team0_core")]
    Team0Core,
    #[strum(serialize = "#Team2Core", to_string = "team1_core")]
    Team1Core,
    #[strum(serialize = "#Team1Titan", to_string = "team0_titan")]
    Team0Titan,
    #[strum(serialize = "#Team2Titan", to_string = "team1_titan")]
    Team1Titan,
    #[strum(serialize = ".ThreeLane #Team1Tier2_1", to_string = "team0_tier2_1")]
    Team0Tier21,
    #[strum(serialize = ".ThreeLane #Team1Tier2_2", to_string = "team0_tier2_2")]
    Team0Tier22,
    #[strum(serialize = ".ThreeLane #Team1Tier2_3", to_string = "team0_tier2_3")]
    Team0Tier23,
    #[strum(serialize = ".ThreeLane #Team1Tier2_4", to_string = "team0_tier2_4")]
    Team0Tier24,
    #[strum(serialize = ".ThreeLane #Team2Tier2_1", to_string = "team1_tier2_1")]
    Team1Tier21,
    #[strum(serialize = ".ThreeLane #Team2Tier2_2", to_string = "team1_tier2_2")]
    Team1Tier22,
    #[strum(serialize = ".ThreeLane #Team2Tier2_3", to_string = "team1_tier2_3")]
    Team1Tier23,
    #[strum(serialize = ".ThreeLane #Team2Tier2_4", to_string = "team1_tier2_4")]
    Team1Tier24,
    #[strum(serialize = ".ThreeLane #Team1Tier1_1", to_string = "team0_tier1_1")]
    Team0Tier11,
    #[strum(serialize = ".ThreeLane #Team1Tier1_2", to_string = "team0_tier1_2")]
    Team0Tier12,
    #[strum(serialize = ".ThreeLane #Team1Tier1_3", to_string = "team0_tier1_3")]
    Team0Tier13,
    #[strum(serialize = ".ThreeLane #Team1Tier1_4", to_string = "team0_tier1_4")]
    Team0Tier14,
    #[strum(serialize = ".ThreeLane #Team2Tier1_1", to_string = "team1_tier1_1")]
    Team1Tier11,
    #[strum(serialize = ".ThreeLane #Team2Tier1_2", to_string = "team1_tier1_2")]
    Team1Tier12,
    #[strum(serialize = ".ThreeLane #Team2Tier1_3", to_string = "team1_tier1_3")]
    Team1Tier13,
    #[strum(serialize = ".ThreeLane #Team2Tier1_4", to_string = "team1_tier1_4")]
    Team1Tier14,
}

impl ObjectiveMarker {
    const fn is_required(self) -> bool {
        !matches!(
            self,
            Self::Team0Tier22 | Self::Team1Tier22 | Self::Team0Tier12 | Self::Team1Tier12
        )
    }
}

/// A position on the minimap, as fractions of its width/height.
#[derive(Debug, Clone, Copy, Serialize, ToSchema)]
pub(crate) struct ObjectivePosition {
    pub(crate) left_relative: f64,
    pub(crate) top_relative: f64,
}

/// Fixed CDN URLs for the minimap image layers.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct MapImages {
    minimap: String,
    plain: String,
    background: String,
    frame: String,
    mid: String,
}

/// A single lane's zip-line cubic spline.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct ZiplanePath {
    origin: [f64; 3],
    color: String,
    #[serde(rename = "P0_points")]
    p0_points: Vec<[f64; 3]>,
    #[serde(rename = "P1_points")]
    p1_points: Vec<[f64; 3]>,
    #[serde(rename = "P2_points")]
    p2_points: Vec<[f64; 3]>,
    color_parsed: Color,
}

/// The `/v1/assets/map` response.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct Map {
    radius: u32,
    images: MapImages,
    #[schema(value_type = HashMap<String, ObjectivePosition>)]
    objective_positions: IndexMap<String, ObjectivePosition>,
    zipline_paths: Vec<ZiplanePath>,
}

fn images() -> MapImages {
    MapImages {
        minimap: format!("{IMAGE_BASE_URL}/maps/minimap.png"),
        plain: format!("{IMAGE_BASE_URL}/maps/minimap_plain.png"),
        background: format!("{IMAGE_BASE_URL}/maps/minimap_bg.png"),
        frame: format!("{IMAGE_BASE_URL}/maps/minimap_frame.png"),
        mid: format!("{IMAGE_BASE_URL}/maps/minimap_midtown_mid_2k.png"),
    }
}

fn zipline_paths() -> Vec<ZiplanePath> {
    geometry::LANES
        .iter()
        .zip(geometry::LANE_COLORS)
        .zip(geometry::LANE_ORIGINS)
        .map(|((lane, color), origin)| {
            let pick = |a: usize, b: usize, c: usize| -> Vec<[f64; 3]> {
                lane.iter().map(|n| [n[a], n[b], n[c]]).collect()
            };
            ZiplanePath {
                origin,
                color: color.to_owned(),
                p0_points: pick(0, 1, 2),
                p1_points: pick(3, 4, 5),
                p2_points: pick(6, 7, 8),
                color_parsed: Color::from_hex(color).unwrap_or(Color {
                    red: 0,
                    green: 0,
                    blue: 0,
                    alpha: 255,
                }),
            }
        })
        .collect()
}

/// Parse the objective marker positions from `objectives_map.css`, keyed by
/// output name in [`ObjectiveMarker`] order. Selectors we don't model (e.g. the
/// four-lane variants) are ignored; a missing required marker is an error.
pub(crate) fn build_objective_positions(
    css: &str,
) -> Result<IndexMap<String, ObjectivePosition>, AssetsError> {
    let by_marker: HashMap<ObjectiveMarker, ObjectivePosition> = css::parse_margin_percentages(css)
        .into_iter()
        .filter_map(|(selector, (left, top))| {
            let marker = selector.parse::<ObjectiveMarker>().ok()?;
            Some((
                marker,
                ObjectivePosition {
                    left_relative: left,
                    top_relative: top,
                },
            ))
        })
        .collect();

    ObjectiveMarker::iter()
        .filter_map(|marker| match by_marker.get(&marker) {
            Some(&pos) => Some(Ok((marker.to_string(), pos))),
            None if marker.is_required() => Some(Err(AssetsError::Map(format!(
                "missing objective position for `{marker}`"
            )))),
            None => None,
        })
        .collect()
}

/// Build the full map response from the version's `objectives_map.css`.
pub(crate) fn build_map(css: &str) -> Result<Map, AssetsError> {
    Ok(Map {
        radius: MAP_RADIUS,
        images: images(),
        objective_positions: build_objective_positions(css)?,
        zipline_paths: zipline_paths(),
    })
}

#[cached(
    ty = "LruTtlCache<u32, Arc<Map>>",
    create = "{ LruTtlCache::builder().size(DEFAULT_CACHE_SIZE).ttl(DEFAULT_CACHE_TTL).build() }",
    convert = r#"{ version }"#,
    result = true,
    sync_writes = "by_key"
)]
pub(crate) async fn fetch_map(r2: &AmazonS3, version: u32) -> Result<Arc<Map>, AssetsError> {
    let css_src = store::fetch_text(r2, version, CSS_PATH).await?;
    Ok(Arc::new(build_map(&css_src)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("map_fixtures/objectives_map.css");

    #[test]
    fn snapshot_map() {
        let map = build_map(FIXTURE).expect("builds");
        insta::with_settings!(
            { snapshot_path => "map_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("map", map); }
        );
    }

    #[test]
    fn lane_colors_are_valid_hex() {
        for color in geometry::LANE_COLORS {
            assert!(
                Color::from_hex(color).is_some(),
                "invalid lane color {color}"
            );
        }
    }

    #[test]
    fn three_lane_tier2_markers_are_absent() {
        let positions = build_objective_positions(FIXTURE).expect("builds");
        assert!(!positions.contains_key("team0_tier2_2"));
        assert!(!positions.contains_key("team1_tier1_2"));
        assert!(positions.contains_key("team0_tier2_1"));
    }
}
