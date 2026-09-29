//! `/v1/assets/map` data layer.
//!
//! The objective marker positions come from the per-version
//! `styles/objectives_map.css`; the radius, image URLs (which switch to the
//! layered midtown minimap from build 6711 on), zip-line lane splines and (6711+)
//! neutral camps are fixed constants extracted from the map entity lump: the
//! pre-6711 map in [`geometry`], the "City Never Sleeps" map (6711+) in
//! [`city_never_sleeps`].

mod city_never_sleeps;
mod geometry;

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::Serialize;
use strum::{Display, EnumIter, EnumString, IntoEnumIterator};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{Color, IMAGE_BASE_URL, SVGS_BASE_URL};
use crate::services::assets::versions::css;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;
use geometry::NeutralCampKind;

const MAP_RADIUS: u32 = 10752;
const CSS_PATH: &str = "styles/objectives_map.css";
/// First build of the "City Never Sleeps" map (layered midtown minimap with
/// tunnel overlays).
const CITY_NEVER_SLEEPS_BUILD: u32 = 6711;

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

/// CDN URLs for the minimap image layers.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct MapImages {
    /// Full minimap. From build 6711 on the game ships no composed minimap, so this is the
    /// same image as `mid`: the midtown street layer as a black mask on transparency, meant
    /// to be drawn over a base colour rather than shown on its own.
    minimap: String,
    /// Minimap without overlays. From build 6711 on this is the same street mask as `mid`
    /// (see `minimap`).
    plain: String,
    /// Background layer drawn under `mid`. Only for builds before 6711; the game no longer
    /// ships it, so it is omitted from build 6711 on.
    #[serde(skip_serializing_if = "Option::is_none")]
    background: Option<String>,
    frame: String,
    /// Midtown base layer.
    mid: String,
    /// Mid tunnels overlay, drawn above `mid` (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    mid_tunnels: Option<String>,
    /// Rat tunnels overlay, drawn above `mid_tunnels` (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    rat_tunnels: Option<String>,
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

/// A neutral camp ("Haunt") marker (build 6711+).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct NeutralCamp {
    /// Camp entity name from the map (e.g. `theater_lobby_camp`).
    name: String,
    kind: NeutralCampKind,
    /// World position `[x, y, z]`, same space as the zip-line splines.
    position: [f64; 3],
    /// Position on the minimap, as fractions of its width/height.
    left_relative: f64,
    top_relative: f64,
    /// Minimap icon URL.
    icon: String,
}

/// The `/v1/assets/map` response.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(crate) struct MapData {
    radius: u32,
    images: MapImages,
    #[schema(value_type = HashMap<String, ObjectivePosition>)]
    objective_positions: IndexMap<String, ObjectivePosition>,
    zipline_paths: Vec<ZiplanePath>,
    /// Neutral camps (build 6711+).
    #[serde(skip_serializing_if = "Option::is_none")]
    neutral_camps: Option<Vec<NeutralCamp>>,
}

/// Image layers for `version`. Images aren't versioned in the bucket and
/// uploads never delete, so the pre-6711 files stay available for older builds.
fn images(version: u32) -> MapImages {
    let url = |name: &str| format!("{IMAGE_BASE_URL}/maps/{name}.png");
    if version >= CITY_NEVER_SLEEPS_BUILD {
        MapImages {
            minimap: url("minimap_midtown_mid"),
            plain: url("minimap_midtown_mid"),
            background: None,
            frame: url("minimap_frame"),
            mid: url("minimap_midtown_mid"),
            mid_tunnels: Some(url("minimap_midtown_mid_tunnels")),
            rat_tunnels: Some(url("minimap_midtown_rat_tunnels")),
        }
    } else {
        MapImages {
            minimap: url("minimap"),
            plain: url("minimap_plain"),
            background: Some(url("minimap_bg")),
            frame: url("minimap_frame"),
            mid: url("minimap_midtown_mid_2k"),
            mid_tunnels: None,
            rat_tunnels: None,
        }
    }
}

fn zipline_paths(version: u32) -> Vec<ZiplanePath> {
    let (lanes, origins) = if version >= CITY_NEVER_SLEEPS_BUILD {
        (&city_never_sleeps::LANES, &city_never_sleeps::LANE_ORIGINS)
    } else {
        (&geometry::LANES, &geometry::LANE_ORIGINS)
    };
    lanes
        .iter()
        .zip(geometry::LANE_COLORS)
        .zip(origins.iter().copied())
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

/// Minimap icon (under `icons/minimap/`) for a camp kind, as `hud_minimap.css`
/// maps `.map_button.neutral_{weak,medium,large,vault}`.
const fn neutral_camp_icon(kind: NeutralCampKind) -> &'static str {
    match kind {
        NeutralCampKind::Weak => "neutral_small_psd",
        NeutralCampKind::Medium => "neutral_medium_psd",
        NeutralCampKind::Strong => "neutral_large_psd",
        NeutralCampKind::Vault => "neutral_vault_psd",
    }
}

/// Neutral camps for `version`; `None` before 6711 (not extracted for the old map).
fn neutral_camps(version: u32) -> Option<Vec<NeutralCamp>> {
    if version < CITY_NEVER_SLEEPS_BUILD {
        return None;
    }
    let radius = f64::from(MAP_RADIUS);
    Some(
        city_never_sleeps::NEUTRAL_CAMPS
            .iter()
            .map(|camp| {
                let [x, y, _] = camp.position;
                NeutralCamp {
                    name: camp.name.to_owned(),
                    kind: camp.kind,
                    position: camp.position,
                    left_relative: (x + radius) / (2.0 * radius),
                    top_relative: (radius - y) / (2.0 * radius),
                    icon: format!(
                        "{SVGS_BASE_URL}/minimap/{}.png",
                        neutral_camp_icon(camp.kind)
                    ),
                }
            })
            .collect(),
    )
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
pub(crate) fn build_map(css: &str, version: u32) -> Result<MapData, AssetsError> {
    Ok(MapData {
        radius: MAP_RADIUS,
        images: images(version),
        objective_positions: build_objective_positions(css)?,
        zipline_paths: zipline_paths(version),
        neutral_camps: neutral_camps(version),
    })
}

#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ version }"#,
    key = "u32"
)]
pub(crate) async fn fetch_map(r2: &AmazonS3, version: u32) -> Result<Arc<MapData>, AssetsError> {
    let css_src = store::fetch_text(r2, version, CSS_PATH).await?;
    Ok(Arc::new(build_map(&css_src, version)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("map_fixtures/objectives_map.css");

    #[test]
    fn snapshot_map() {
        let map = build_map(FIXTURE, 6701).expect("builds");
        insta::with_settings!(
            { snapshot_path => "map_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("map", map); }
        );
    }

    /// `objectives_map.css` is byte-identical in 6711, so the same fixture is used.
    #[test]
    fn snapshot_map_city_never_sleeps() {
        let map = build_map(FIXTURE, CITY_NEVER_SLEEPS_BUILD).expect("builds");
        insta::with_settings!(
            { snapshot_path => "map_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("map_city_never_sleeps", map); }
        );
    }

    #[test]
    fn city_never_sleeps_geometry() {
        let old = build_map(FIXTURE, CITY_NEVER_SLEEPS_BUILD - 1).expect("builds");
        assert!(old.neutral_camps.is_none());
        let bits = |v: [f64; 3]| v.map(f64::to_bits);
        assert_eq!(
            bits(old.zipline_paths[0].origin),
            bits(geometry::LANE_ORIGINS[0])
        );

        let new = build_map(FIXTURE, CITY_NEVER_SLEEPS_BUILD).expect("builds");
        assert_eq!(new.zipline_paths.len(), 3);
        assert_eq!(
            bits(new.zipline_paths[0].origin),
            bits(city_never_sleeps::LANE_ORIGINS[0])
        );
        let camps = new.neutral_camps.expect("camps for 6711+");
        assert!(!camps.is_empty());
        for camp in &camps {
            assert!((0.0..=1.0).contains(&camp.left_relative), "{}", camp.name);
            assert!((0.0..=1.0).contains(&camp.top_relative), "{}", camp.name);
            assert!(
                camp.icon.contains("/icons/minimap/neutral_"),
                "{}",
                camp.icon
            );
        }
    }

    #[test]
    fn city_never_sleeps_uses_layered_minimap() {
        let old = images(CITY_NEVER_SLEEPS_BUILD - 1);
        assert!(old.minimap.ends_with("/maps/minimap.png"));
        assert!(old.mid_tunnels.is_none());

        let new = images(CITY_NEVER_SLEEPS_BUILD);
        assert!(new.mid.ends_with("/maps/minimap_midtown_mid.png"));
        assert!(new.minimap.ends_with("/maps/minimap_midtown_mid.png"));
        assert!(new.frame.ends_with("/maps/minimap_frame.png"));
        assert!(
            new.mid_tunnels
                .is_some_and(|u| u.ends_with("/maps/minimap_midtown_mid_tunnels.png"))
        );
        assert!(
            new.rat_tunnels
                .is_some_and(|u| u.ends_with("/maps/minimap_midtown_rat_tunnels.png"))
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
