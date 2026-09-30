//! The crosshair convars a share code carries.

#![expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "convars are stored as strings and the game truncates numeric ones to integers"
)]

use core::fmt::Display;

use serde::Deserialize;
use utoipa::IntoParams;

/// Seed of the murmur2 hash that identifies a convar inside a share code.
const HASH_SEED: u32 = 0x4453_4554;

/// A convar value as the game stores it in a share code, where it is written with `Display`.
trait ConvarValue: Sized + Display {
    /// Unparsable values fall back to zero, like the game's `atof`/`atoi`.
    fn parse(text: &str) -> Self;
}

/// Parses a number the way the game reads a numeric convar, rejecting non-finite values.
fn parse_number(text: &str) -> f32 {
    match text {
        "true" => 1.0,
        _ => text
            .parse()
            .ok()
            .filter(|v: &f32| v.is_finite())
            .unwrap_or(0.0),
    }
}

impl ConvarValue for bool {
    fn parse(text: &str) -> Self {
        parse_number(text) != 0.0
    }
}

impl ConvarValue for i32 {
    fn parse(text: &str) -> Self {
        parse_number(text) as Self
    }
}

impl ConvarValue for f32 {
    fn parse(text: &str) -> Self {
        parse_number(text)
    }
}

/// Colour channels wrap around like the game's integer-to-byte conversion.
impl ConvarValue for u8 {
    fn parse(text: &str) -> Self {
        i32::parse(text) as Self
    }
}

/// Declares [`Settings`] from one table so decoding, encoding, defaults and the API schema cannot
/// drift apart. Fields are listed in the order the game writes them into a code, and each is named
/// after its convar without the `citadel_crosshair_` prefix.
macro_rules! settings {
    ($($(#[doc = $doc:literal])* $field:ident: $ty:ty = $default:expr,)*) => {
        /// Crosshair convars. Anything not given keeps the game's default.
        #[derive(Debug, Clone, Copy, PartialEq, Deserialize, IntoParams)]
        #[serde(default)]
        #[into_params(parameter_in = Query)]
        pub(crate) struct Settings {
            $(
                $(#[doc = $doc])*
                #[param(default = $default)]
                pub(crate) $field: $ty,
            )*
        }

        impl Default for Settings {
            fn default() -> Self {
                Self { $($field: $default,)* }
            }
        }

        impl Settings {
            /// Applies one `(convar hash, value)` entry of a share code, ignoring unknown convars.
            pub(super) fn apply(&mut self, key: u32, value: &str) {
                $(
                    if key == convar_hash(concat!("crosshair_", stringify!($field))) {
                        self.$field = ConvarValue::parse(value);
                        return;
                    }
                )*
            }

            /// The `(convar hash, value)` entries of a share code, in the game's order.
            pub(super) fn entries(&self) -> impl Iterator<Item = (u32, String)> {
                [$((
                    convar_hash(concat!("crosshair_", stringify!($field))),
                    self.$field.to_string(),
                ),)*]
                .into_iter()
            }
        }
    };
}

settings! {
    /// Use the hero's own crosshair instead of these settings.
    themed: bool = false,
    /// Keep the pips at a fixed distance instead of spreading them with weapon spread.
    pip_gap_static: bool = false,
    pip_width: i32 = 2,
    pip_height: i32 = 16,
    pip_gap: i32 = 4,
    /// 0 to 1.
    pip_opacity: f32 = 0.5,
    pip_outline_border: i32 = 1,
    pip_outline_gap: i32 = 0,
    /// 0 to 1.
    pip_outline_opacity: f32 = 0.7,
    dot_size: i32 = 4,
    /// 0 to 1.
    dot_opacity: f32 = 0.7,
    dot_outline_border: i32 = 2,
    dot_outline_gap: i32 = 0,
    /// 0 to 1.
    dot_outline_opacity: f32 = 0.7,
    color_r: u8 = 255,
    color_g: u8 = 255,
    color_b: u8 = 255,
    outline_color_r: u8 = 0,
    outline_color_g: u8 = 0,
    outline_color_b: u8 = 0,
}

fn convar_hash(name: &str) -> u32 {
    murmur2::murmur2(name.as_bytes(), HASH_SEED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_like_the_game() {
        assert!(bool::parse("true"));
        assert!(!bool::parse("false"));
        assert_eq!(i32::parse("16"), 16);
        assert_eq!(i32::parse("-3.9"), -3);
        assert_eq!(i32::parse("inf"), 0);
        assert_eq!(u8::parse("300"), 44);
        assert!(f32::parse("NaN").abs() < f32::EPSILON);
        assert!((f32::parse("0.7") - 0.7).abs() < f32::EPSILON);
    }

    #[test]
    fn formats_like_the_game() {
        assert_eq!(0.7f32.to_string(), "0.7");
        assert_eq!(1.0f32.to_string(), "1");
        assert_eq!(false.to_string(), "false");
    }

    #[test]
    fn convar_hashes_match_the_game() {
        // `crosshair_dot_size` as found in a code exported by the game.
        assert_eq!(convar_hash("crosshair_dot_size"), 0x9e12_6112);
    }

    #[test]
    fn round_trips_through_entries() {
        let settings = Settings {
            themed: true,
            pip_gap: -7,
            dot_opacity: 0.25,
            outline_color_g: 12,
            ..Settings::default()
        };
        let mut decoded = Settings::default();
        for (key, value) in settings.entries() {
            decoded.apply(key, &value);
        }
        assert_eq!(decoded, settings);
    }
}
