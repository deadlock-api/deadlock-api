//! Types shared between `/v1/assets/*` versioned-asset endpoints.

use core::time::Duration;

use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};
use utoipa::ToSchema;

/// Default LRU capacity for per-version `fetch_*` caches.
pub(crate) const DEFAULT_CACHE_SIZE: usize = 64;
/// Default TTL for per-version `fetch_*` caches.
pub(crate) const DEFAULT_CACHE_TTL: Duration = Duration::from_hours(24);

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

impl Serialize for HeroItemType {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for HeroItemType {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = <&str>::deserialize(d)?;
        s.parse().map_err(serde::de::Error::custom)
    }
}

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
