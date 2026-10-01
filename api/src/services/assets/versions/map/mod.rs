//! `/v1/assets/map` data layer.
//!
//! The objective marker positions come from the per-version
//! `styles/objectives_map.css` (pre-6711) or, from 6711 on, from the world
//! positions in the map entity lump; the radius, image URLs (which switch to the
//! layered midtown minimap from build 6711 on), zip-line lane splines and (6711+)
//! neutral camps are fixed constants extracted from the map entity lump: the
//! pre-6711 map in [`geometry`], the "City Never Sleeps" map (6711+) in
//! [`city_never_sleeps`]. The interactable map entities (crates, bounce pads,
//! shops, ...) come from the per-version `map/entities.json`, which the assets
//! pipeline extracts from the map entity lump on every build
//! (`scripts/extract_map_entities.py`).

mod city_never_sleeps;
mod geometry;

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use indexmap::IndexMap;
use object_store::aws::AmazonS3;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter, EnumString, IntoEnumIterator};
use utoipa::ToSchema;

use crate::services::assets::versions::common::{Color, IMAGE_BASE_URL, SVGS_BASE_URL};
use crate::services::assets::versions::css;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;
use geometry::NeutralCampKind;

const MAP_RADIUS: u32 = 10752;
const CSS_PATH: &str = "styles/objectives_map.css";
const ENTITIES_PATH: &str = "map/entities.json";
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

/// Marker footprint in `objectives_map.css`, as fractions of the minimap:
/// `.Core` is 30% x 8%, every other marker (`.Icon`) 10% x 10%.
const CORE_SIZE: (f64, f64) = (0.30, 0.08);
const ICON_SIZE: (f64, f64) = (0.10, 0.10);

impl ObjectiveMarker {
    const fn size(self) -> (f64, f64) {
        match self {
            Self::Team0Core | Self::Team1Core => CORE_SIZE,
            _ => ICON_SIZE,
        }
    }

    const fn is_required(self) -> bool {
        !matches!(
            self,
            Self::Team0Tier22 | Self::Team1Tier22 | Self::Team0Tier12 | Self::Team1Tier12
        )
    }
}

/// The top-left corner of an objective marker on the minimap, as fractions of
/// its width/height (like a CSS `margin-left`/`margin-top`). The marker is a
/// `Core` (30% x 8%) for the cores and an `Icon` (10% x 10%) otherwise, so its
/// centre is this position plus half that size. Unlike `neutral_camps`, whose
/// `left_relative`/`top_relative` are the point itself. Before build 6711 these
/// are the HUD's schematic layout; from 6711 on they are real map positions.
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

/// An interactable map entity (crate, bounce pad, shop, ...). Deserialized from
/// `map/entities.json`, which has no minimap position; that is filled in after.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub(crate) struct MapEntity {
    /// World position `[x, y, z]`, same space as the zip-line splines. Brush
    /// triggers (ropes, pads, veils, ...) are placed at their entity origin.
    position: [f64; 3],
    /// Position on the minimap, as fractions of its width/height.
    #[serde(default)]
    left_relative: f64,
    #[serde(default)]
    top_relative: f64,
    /// Owning team (0 or 1); absent for neutral entities.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    team: Option<u8>,
    /// Variant within the category, e.g. `wooden_crate` or `secret` (shops).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    /// World position `[x, y, z]` the entity sends you to: the teleporter exit
    /// or the bounce pad landing spot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    target: Option<[f64; 3]>,
}

/// Interactable map entities by category, extracted from the map entity lump.
#[derive(Debug, Clone, Default, Deserialize, Serialize, ToSchema)]
#[serde(default)]
pub(crate) struct MapEntities {
    /// Breakable wooden crates (`citadel_breakable_prop_wooden_crate` and variants).
    crates: Vec<MapEntity>,
    /// Breakable tough crates (`citadel_breakable_prop_tough_crate`).
    tough_crates: Vec<MapEntity>,
    /// Golden statues (`citadel_breakable_item_container`, `citadel_breakable_lion_statue`).
    golden_statues: Vec<MapEntity>,
    /// Chinatown bells (`citadel_breakable_bell_chinatown`).
    bells: Vec<MapEntity>,
    /// Healing snack spawners (`citadel_pickup_spawner`).
    healing_snacks: Vec<MapEntity>,
    /// Bridge buff spawners (`citadel_item_powerup_spawner`).
    bridge_buffs: Vec<MapEntity>,
    /// Climbable ropes (`citadel_trigger_climb_rope`).
    climb_ropes: Vec<MapEntity>,
    /// Teleporters (`citadel_trigger_teleport`); `target` is the exit.
    teleporters: Vec<MapEntity>,
    /// Item shops (`trigger_item_shop`); `kind` is `base`, `lane` or `secret`.
    shops: Vec<MapEntity>,
    /// Soul urn spawn points (`item_crate_spawn`).
    soul_urn_spawns: Vec<MapEntity>,
    /// Soul urn delivery pads (`citadel_trigger_idol_return`).
    soul_urn_pads: Vec<MapEntity>,
    /// Base defense sentries (`npc_base_defense_sentry`).
    base_sentries: Vec<MapEntity>,
    /// Bounce pads (`trigger_catapult`); `target` is the landing spot.
    bounce_pads: Vec<MapEntity>,
    /// Vision-obscuring steam vents (`citadel_obscured_volume`).
    steam_vents: Vec<MapEntity>,
    /// Cosmic veils (`citadel_invis_volume`).
    cosmic_veils: Vec<MapEntity>,
    /// Unstable rift spawn points (`info_koth_spawn_location`).
    unstable_rifts: Vec<MapEntity>,
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
    /// Interactable map entities; only for builds whose assets were built with
    /// the map entity extraction.
    #[serde(skip_serializing_if = "Option::is_none")]
    entities: Option<MapEntities>,
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

/// Position on the minimap, as `(left, top)` fractions of its width/height.
fn minimap_relative([x, y, _]: [f64; 3]) -> (f64, f64) {
    let radius = f64::from(MAP_RADIUS);
    ((x + radius) / (2.0 * radius), (radius - y) / (2.0 * radius))
}

impl MapEntities {
    fn lists_mut(&mut self) -> [&mut Vec<MapEntity>; 16] {
        [
            &mut self.crates,
            &mut self.tough_crates,
            &mut self.golden_statues,
            &mut self.bells,
            &mut self.healing_snacks,
            &mut self.bridge_buffs,
            &mut self.climb_ropes,
            &mut self.teleporters,
            &mut self.shops,
            &mut self.soul_urn_spawns,
            &mut self.soul_urn_pads,
            &mut self.base_sentries,
            &mut self.bounce_pads,
            &mut self.steam_vents,
            &mut self.cosmic_veils,
            &mut self.unstable_rifts,
        ]
    }
}

/// Parse `map/entities.json` and place every entity on the minimap.
fn build_entities(json: &str) -> Result<MapEntities, AssetsError> {
    let mut entities: MapEntities = serde_json::from_str(json)?;
    for entity in entities.lists_mut().into_iter().flatten() {
        let (left, top) = minimap_relative(entity.position);
        entity.left_relative = round4(left);
        entity.top_relative = round4(top);
    }
    Ok(entities)
}

/// Neutral camps for `version`; `None` before 6711 (not extracted for the old map).
fn neutral_camps(version: u32) -> Option<Vec<NeutralCamp>> {
    if version < CITY_NEVER_SLEEPS_BUILD {
        return None;
    }
    Some(
        city_never_sleeps::NEUTRAL_CAMPS
            .iter()
            .map(|camp| {
                let (left_relative, top_relative) = minimap_relative(camp.position);
                NeutralCamp {
                    name: camp.name.to_owned(),
                    kind: camp.kind,
                    position: camp.position,
                    left_relative,
                    top_relative,
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

/// Round to 4 decimals (about 2 px on a 20k-wide minimap), like the CSS's 2.
fn round4(v: f64) -> f64 {
    (v * 1e4).round() / 1e4
}

/// Objective positions for 6711+, from the entity lump's world positions.
///
/// `objectives_map.css` still describes the old layout after the "City Never
/// Sleeps" rework, so it is not used. The CSS `margin-left`/`margin-top` place
/// the marker's top-left corner, so the marker centre is
/// `margin + size / 2`; the centre of a `Core` (30% x 8%) / `Icon` (10% x 10%)
/// coincides with the structure's minimap position on the cores and titans of
/// the old layout (`0.5` horizontally). Here the margin is therefore
/// `(x + R) / 2R - w / 2` and `(R - y) / 2R - h / 2`, the same anchor, clamped
/// so the whole marker stays on the minimap (the cores sit at the map edge).
///
/// The cores have no structure entity of their own: their position is the
/// centroid of the team's `info_team_spawn` points (the base area), matching
/// the old CSS `Core` bar, which marks the base rather than a building.
fn city_never_sleeps_objective_positions()
-> Result<IndexMap<String, ObjectivePosition>, AssetsError> {
    let radius = f64::from(MAP_RADIUS);
    ObjectiveMarker::iter()
        .filter_map(|marker| {
            let key = marker.to_string();
            let Some(src) = city_never_sleeps::OBJECTIVES.iter().find(|o| o.key == key) else {
                return marker.is_required().then(|| {
                    Err(AssetsError::Map(format!(
                        "missing objective position for `{marker}`"
                    )))
                });
            };
            let [x, y] = src.position;
            let (w, h) = marker.size();
            Some(Ok((
                key,
                ObjectivePosition {
                    left_relative: round4(
                        ((x + radius) / (2.0 * radius) - w / 2.0).clamp(0.0, 1.0 - w),
                    ),
                    top_relative: round4(
                        ((radius - y) / (2.0 * radius) - h / 2.0).clamp(0.0, 1.0 - h),
                    ),
                },
            )))
        })
        .collect()
}

/// Build the full map response. Pre-6711 the objective positions come from
/// `css` (the version's `objectives_map.css`); from 6711 on `css` is unused.
/// `entities_json` is the version's `map/entities.json`, if it has one.
pub(crate) fn build_map(
    css: &str,
    entities_json: Option<&str>,
    version: u32,
) -> Result<MapData, AssetsError> {
    let objective_positions = if version >= CITY_NEVER_SLEEPS_BUILD {
        city_never_sleeps_objective_positions()?
    } else {
        build_objective_positions(css)?
    };
    Ok(MapData {
        radius: MAP_RADIUS,
        images: images(version),
        objective_positions,
        zipline_paths: zipline_paths(version),
        neutral_camps: neutral_camps(version),
        entities: entities_json.map(build_entities).transpose()?,
    })
}

#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ version }"#,
    key = "u32"
)]
pub(crate) async fn fetch_map(r2: &AmazonS3, version: u32) -> Result<Arc<MapData>, AssetsError> {
    // From 6711 on the objective positions don't come from the CSS, so don't
    // depend on the file existing.
    let css_src = if version >= CITY_NEVER_SLEEPS_BUILD {
        String::new()
    } else {
        store::fetch_text(r2, version, CSS_PATH).await?
    };
    let entities_json = match store::fetch_text(r2, version, ENTITIES_PATH).await {
        Ok(json) => Some(json),
        Err(store::VersionStoreError::ObjectStore(object_store::Error::NotFound { .. })) => None,
        Err(e) => return Err(e.into()),
    };
    Ok(Arc::new(build_map(
        &css_src,
        entities_json.as_deref(),
        version,
    )?))
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("map_fixtures/objectives_map.css");
    const ENTITIES_FIXTURE: &str = include_str!("map_fixtures/entities.json");

    #[test]
    fn snapshot_map() {
        let map = build_map(FIXTURE, None, 6701).expect("builds");
        insta::with_settings!(
            { snapshot_path => "map_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("map", map); }
        );
    }

    /// `objectives_map.css` is byte-identical in 6711 (and no longer describes the
    /// bases), so the fixture is only passed through; positions come from the lump.
    #[test]
    fn snapshot_map_city_never_sleeps() {
        let map = build_map(FIXTURE, None, CITY_NEVER_SLEEPS_BUILD).expect("builds");
        insta::with_settings!(
            { snapshot_path => "map_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("map_city_never_sleeps", map); }
        );
    }

    #[test]
    fn city_never_sleeps_geometry() {
        let old = build_map(FIXTURE, None, CITY_NEVER_SLEEPS_BUILD - 1).expect("builds");
        assert!(old.neutral_camps.is_none());
        let bits = |v: [f64; 3]| v.map(f64::to_bits);
        assert_eq!(
            bits(old.zipline_paths[0].origin),
            bits(geometry::LANE_ORIGINS[0])
        );

        let new = build_map(FIXTURE, None, CITY_NEVER_SLEEPS_BUILD).expect("builds");
        assert_eq!(new.zipline_paths.len(), 3);
        assert_eq!(
            bits(new.zipline_paths[0].origin),
            bits(city_never_sleeps::LANE_ORIGINS[0])
        );
        for (key, pos) in &new.objective_positions {
            let marker = ObjectiveMarker::iter()
                .find(|m| m.to_string() == *key)
                .expect("marker key");
            let (w, h) = marker.size();
            assert!(
                (0.0..=1.0 - w).contains(&pos.left_relative),
                "{key} left {}",
                pos.left_relative
            );
            assert!(
                (0.0..=1.0 - h).contains(&pos.top_relative),
                "{key} top {}",
                pos.top_relative
            );
        }
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

    #[test]
    fn city_never_sleeps_objectives_follow_the_lump() {
        let old = build_map(FIXTURE, None, CITY_NEVER_SLEEPS_BUILD - 1).expect("builds");
        let new = build_map(FIXTURE, None, CITY_NEVER_SLEEPS_BUILD).expect("builds");
        assert!(
            old.objective_positions
                .keys()
                .eq(new.objective_positions.keys())
        );
        // Bases moved off the map's centre line.
        assert!(new.objective_positions["team0_titan"].left_relative < 0.45);
        assert!(new.objective_positions["team1_titan"].left_relative > 0.45);
        // Legacy path is untouched: it still reads the CSS.
        assert!((old.objective_positions["team0_titan"].left_relative - 0.45).abs() < 1e-9);
    }

    #[test]
    fn map_entities_from_lump_extract() {
        let map =
            build_map(FIXTURE, Some(ENTITIES_FIXTURE), CITY_NEVER_SLEEPS_BUILD).expect("builds");
        let entities = map.entities.expect("entities");
        for (name, list) in [
            ("crates", &entities.crates),
            ("tough_crates", &entities.tough_crates),
            ("golden_statues", &entities.golden_statues),
            ("healing_snacks", &entities.healing_snacks),
            ("climb_ropes", &entities.climb_ropes),
            ("teleporters", &entities.teleporters),
            ("shops", &entities.shops),
            ("base_sentries", &entities.base_sentries),
            ("bounce_pads", &entities.bounce_pads),
        ] {
            assert!(!list.is_empty(), "{name}");
            for e in list {
                assert!((0.0..=1.0).contains(&e.left_relative), "{name}");
                assert!((0.0..=1.0).contains(&e.top_relative), "{name}");
            }
        }
        assert!(entities.teleporters.iter().all(|t| t.target.is_some()));
        assert!(entities.bounce_pads.iter().all(|t| t.target.is_some()));
        assert!(entities.base_sentries.iter().all(|s| s.team.is_some()));
    }
}
