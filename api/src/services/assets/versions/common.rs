//! Types shared between `/v1/assets/*` versioned-asset endpoints.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

use crate::services::assets::versions::error::AssetsError;
use crate::utils::kv3;

/// Base URL for static images served from the assets bucket.
pub(crate) const IMAGE_BASE_URL: &str =
    "https://assets-bucket.deadlock-api.com/assets-api-res/images";
/// Base URL for static SVG icons served from the assets bucket.
pub(crate) const SVGS_BASE_URL: &str =
    "https://assets-bucket.deadlock-api.com/assets-api-res/icons";

/// Path of an svg icon relative to `icons/` in the assets bucket, derived from
/// its game source path (`file://{images}/...`, `s2r://panorama/images/...`,
/// `images/...`, optionally quoted / `.vsvg`). Icons are uploaded nested by
/// their path under `panorama/images/` (see `copy_icon` in
/// `scripts/build_version_and_upload.sh`); sources outside it sit at the top
/// level under their file name.
pub(crate) fn svg_icon_path(source: &str) -> String {
    let s = source.replace('"', "").replace(".vsvg", ".svg");
    let rel = s
        .rsplit_once("{images}/")
        .or_else(|| s.rsplit_once("panorama/images/"))
        .map(|(_, t)| t)
        .or_else(|| s.strip_prefix("images/"))
        .unwrap_or_else(|| s.rsplit('/').next().unwrap_or(&s));
    rel.to_owned()
}

/// Public URL of an svg icon given its game source path (see [`svg_icon_path`]).
pub(crate) fn svg_icon_url(source: &str) -> String {
    format!("{SVGS_BASE_URL}/{}", svg_icon_path(source))
}

/// Parse a KV3 source file, then iterate its top-level entries: each entry
/// that passes `keep` is deserialized into `Raw` and passed to `transform`.
/// Entries that fail to deserialize are skipped with a `warn!` carrying
/// `label` for context, so a single malformed entry can't break the endpoint.
pub(crate) fn build_from_kv3<Raw, Out>(
    vdata: &str,
    label: &'static str,
    keep: impl Fn(&str, &serde_json::Value) -> bool,
    mut transform: impl FnMut(String, Raw) -> Out,
) -> Result<Vec<Out>, AssetsError>
where
    Raw: serde::de::DeserializeOwned,
{
    Ok(kv3_entries(vdata, label, keep)?
        .map(|(class_name, raw)| transform(class_name, raw))
        .collect())
}

/// Like [`build_from_kv3`], but collects into an [`IndexMap`] keyed by
/// `class_name`.
pub(crate) fn build_map_from_kv3<Raw, Out>(
    vdata: &str,
    label: &'static str,
    keep: impl Fn(&str, &serde_json::Value) -> bool,
    mut transform: impl FnMut(&str, Raw) -> Out,
) -> Result<IndexMap<String, Out>, AssetsError>
where
    Raw: serde::de::DeserializeOwned,
{
    Ok(kv3_entries(vdata, label, keep)?
        .map(|(class_name, raw)| {
            let v = transform(&class_name, raw);
            (class_name, v)
        })
        .collect())
}

/// The top-level entries of a KV3 source file that pass `keep` and deserialize
/// into `Raw`; the others are skipped (with a `warn!` for the malformed ones).
fn kv3_entries<Raw>(
    vdata: &str,
    label: &'static str,
    keep: impl Fn(&str, &serde_json::Value) -> bool,
) -> Result<impl Iterator<Item = (String, Raw)>, AssetsError>
where
    Raw: serde::de::DeserializeOwned,
{
    let root: IndexMap<String, serde_json::Value> = kv3::from_str(vdata)?;
    Ok(root.into_iter().filter_map(move |(class_name, value)| {
        if !keep(&class_name, &value) {
            return None;
        }
        match serde_json::from_value::<Raw>(value) {
            Ok(raw) => Some((class_name, raw)),
            Err(e) => {
                tracing::warn!("Skipping {label} {class_name}: {e}");
                None
            }
        }
    }))
}

/// Derives `Serialize`/`Deserialize` for an enum that already implements
/// [`core::fmt::Display`] and [`core::str::FromStr`] (e.g. via `strum`).
/// Serializes via `Display`, deserializes via `FromStr`.
macro_rules! enum_str_serde {
    ($($t:ty),+ $(,)?) => {$(
        impl serde::Serialize for $t {
            fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
                s.collect_str(self)
            }
        }
        impl<'de> serde::Deserialize<'de> for $t {
            fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
                let s = <std::borrow::Cow<'de, str>>::deserialize(d)?;
                s.parse().map_err(serde::de::Error::custom)
            }
        }
    )+};
}
pub(crate) use enum_str_serde;

/// Stable murmurhash2 seed used for entity-id derivation from `class_name`.
const ENTITY_ID_SEED: u32 = 0x3141_5926;

/// Derive the canonical `id` for a versioned-asset entity from its `class_name`.
pub(crate) fn entity_id(class_name: &str) -> u32 {
    murmur2::murmur2(class_name.as_bytes(), ENTITY_ID_SEED)
}

/// Deserialization wrapper for the KV3 `subclass:{...}` literal, which the
/// parser emits as `{"subclass": ...}`.
#[derive(Debug, Deserialize)]
pub(crate) struct WrapSubclass<T> {
    pub(crate) subclass: T,
}

/// Serializes back as `{"subclass": ...}` to preserve the KV3 wrapper shape in
/// JSON output.
#[derive(Debug, Serialize, Clone, ToSchema)]
pub(crate) struct Subclass<T: Serialize> {
    pub(crate) subclass: T,
}

/// Slot used by `m_mapBoundAbilities` on heroes and NPC units. Parses from
/// `Source`'s `ESlot_*` identifiers and serializes as a `snake_case` string,
/// including when used as a JSON map key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, ToSchema, EnumString, Display)]
pub(crate) enum HeroItemType {
    #[strum(serialize = "ESlot_Weapon_Primary", to_string = "weapon_primary")]
    WeaponPrimary,
    #[strum(serialize = "ESlot_Weapon_Secondary", to_string = "weapon_secondary")]
    WeaponSecondary,
    #[strum(serialize = "ESlot_Weapon_Melee", to_string = "weapon_melee")]
    WeaponMelee,
    #[strum(serialize = "ESlot_Ability_Mantle", to_string = "ability_mantle")]
    AbilityMantle,
    #[strum(serialize = "ESlot_Ability_Jump", to_string = "ability_jump")]
    AbilityJump,
    #[strum(serialize = "ESlot_Ability_Slide", to_string = "ability_slide")]
    AbilitySlide,
    #[strum(serialize = "ESlot_Ability_ZipLine", to_string = "ability_zip_line")]
    AbilityZipLine,
    #[strum(
        serialize = "ESlot_Ability_ZipLineBoost",
        to_string = "ability_zip_line_boost"
    )]
    AbilityZipLineBoost,
    #[strum(
        serialize = "ESlot_Ability_ClimbRope",
        to_string = "ability_climb_rope"
    )]
    AbilityClimbRope,
    #[strum(serialize = "ESlot_Ability_Innate_1", to_string = "ability_innate1")]
    AbilityInnate1,
    #[strum(serialize = "ESlot_Ability_Innate_2", to_string = "ability_innate2")]
    AbilityInnate2,
    #[strum(serialize = "ESlot_Ability_Innate_3", to_string = "ability_innate3")]
    AbilityInnate3,
    #[strum(serialize = "ESlot_Signature_1", to_string = "signature1")]
    Signature1,
    #[strum(serialize = "ESlot_Signature_2", to_string = "signature2")]
    Signature2,
    #[strum(serialize = "ESlot_Signature_3", to_string = "signature3")]
    Signature3,
    #[strum(serialize = "ESlot_Signature_4", to_string = "signature4")]
    Signature4,
    #[strum(serialize = "ESlot_Cosmetic_1", to_string = "eslot_cosmetic_1")]
    EslotCosmetic1,
}

enum_str_serde!(HeroItemType);

/// RGBA color emitted by KV3 as a 3- or 4-element integer array. Alpha
/// defaults to 255 when omitted.
#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, ToSchema)]
pub(crate) struct Color {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
    pub alpha: u8,
}

impl Color {
    /// Parse a `#RRGGBB` or `#RRGGBBAA` hex string (with or without the `#`).
    pub(crate) fn from_hex(hex: &str) -> Option<Self> {
        let h = hex.strip_prefix('#').unwrap_or(hex);
        let (rgb, alpha) = match h.len() {
            6 => (h, 255),
            8 => (&h[..6], u8::from_str_radix(&h[6..8], 16).ok()?),
            _ => return None,
        };
        let red = u8::from_str_radix(&rgb[0..2], 16).ok()?;
        let green = u8::from_str_radix(&rgb[2..4], 16).ok()?;
        let blue = u8::from_str_radix(&rgb[4..6], 16).ok()?;
        Some(Self {
            red,
            green,
            blue,
            alpha,
        })
    }
}

impl<'de> Deserialize<'de> for Color {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let components: Vec<u8> = Vec::deserialize(deserializer)?;
        match components.as_slice() {
            [red, green, blue] => Ok(Self {
                red: *red,
                green: *green,
                blue: *blue,
                alpha: 255,
            }),
            [red, green, blue, alpha] => Ok(Self {
                red: *red,
                green: *green,
                blue: *blue,
                alpha: *alpha,
            }),
            _ => Err(serde::de::Error::custom(
                "color must be a 3- or 4-element list of bytes",
            )),
        }
    }
}
