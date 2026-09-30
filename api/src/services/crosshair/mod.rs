//! Deadlock crosshairs: share codes (`DL.…`) to settings and back, and settings to images.

mod code;
mod console;
mod render;
mod settings;

use axum::body::Bytes;
use image::ImageEncoder;
use image::codecs::png::PngEncoder;

pub(crate) use self::code::encode;
pub(crate) use self::settings::Settings;

/// Screen heights, in pixels, that crosshairs can be rendered for.
pub(crate) const MIN_SCREEN_HEIGHT: u32 = 480;
pub(crate) const MAX_SCREEN_HEIGHT: u32 = 4320;
pub(crate) const DEFAULT_SCREEN_HEIGHT: u32 = 1080;
/// How many pixels per side an image pixel may be enlarged to.
pub(crate) const MAX_SCALE: u32 = 16;
/// The largest edge an enlarged image is allowed; a larger `scale` is lowered to fit.
const MAX_SCALED_SIZE: u32 = 2048;

#[derive(Debug, thiserror::Error)]
pub(crate) enum CrosshairError {
    #[error("Crosshair code is too long")]
    CodeTooLong,
    #[error(
        "Not a crosshair code: paste a code that starts with `DL.` or crosshair console commands"
    )]
    NotACode,
    #[error("Crosshair code is not valid base64")]
    Base64(#[from] base64::DecodeError),
    #[error("Unsupported crosshair code version {0}")]
    UnsupportedVersion(u8),
    #[error("Crosshair code is malformed")]
    Malformed,
    #[error("Crosshair code could not be decompressed")]
    Decompress,
    #[error("Crosshair code checksum mismatch")]
    Checksum,
    #[error("Crosshair is too large to render")]
    TooLarge,
    #[error("Screen height must be between {MIN_SCREEN_HEIGHT} and {MAX_SCREEN_HEIGHT} pixels")]
    ScreenHeight,
    #[error("Scale must be between 1 and {MAX_SCALE}")]
    Scale,
    #[error("Failed to encode crosshair image: {0}")]
    Encode(#[from] image::ImageError),
}

/// Codes exported by the game are a few hundred characters, console commands under two thousand.
const MAX_CODE_LEN: usize = 4096;

/// The settings in a share code (`DL.…`) or in crosshair console commands
/// (`citadel_crosshair_dot_size 4; citadel_crosshair_color_r 245`).
pub(crate) fn decode(input: &str) -> Result<Settings, CrosshairError> {
    if input.len() > MAX_CODE_LEN {
        return Err(CrosshairError::CodeTooLong);
    }
    let input = input.trim();
    if input.starts_with(code::PREFIX) {
        code::decode(input)
    } else {
        console::parse(input)
    }
}

/// Renders `settings` as they look on a screen `screen_height` pixels tall, as a PNG with a
/// transparent background, cropped square around the crosshair. `scale` enlarges it afterwards,
/// every pixel drawn as a `scale`-sized square, for a picture larger than the crosshair itself
/// (a link preview); it is lowered when the result would pass `MAX_SCALED_SIZE`.
pub(crate) fn render_png(
    settings: &Settings,
    screen_height: u32,
    scale: u32,
) -> Result<Bytes, CrosshairError> {
    if !(MIN_SCREEN_HEIGHT..=MAX_SCREEN_HEIGHT).contains(&screen_height) {
        return Err(CrosshairError::ScreenHeight);
    }
    if !(1..=MAX_SCALE).contains(&scale) {
        return Err(CrosshairError::Scale);
    }
    #[expect(
        clippy::cast_precision_loss,
        reason = "screen heights are far below f32's exact integer range"
    )]
    let mut image = render::render(settings, screen_height as f32)?;
    let scale = scale.min(MAX_SCALED_SIZE / image.width().max(1)).max(1);
    if scale > 1 {
        image = image::imageops::resize(
            &image,
            image.width() * scale,
            image.height() * scale,
            image::imageops::FilterType::Nearest,
        );
    }
    let mut png = Vec::new();
    PngEncoder::new(&mut png).write_image(
        image.as_raw(),
        image.width(),
        image.height(),
        image::ExtendedColorType::Rgba8,
    )?;
    Ok(png.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_codes_and_console_commands() {
        assert_eq!(decode(fixtures::RED_PIPS).unwrap().pip_width, 3);
        assert_eq!(
            decode("  citadel_crosshair_pip_width 5 ")
                .unwrap()
                .pip_width,
            5
        );
        assert!(matches!(
            decode(&"A".repeat(MAX_CODE_LEN + 1)),
            Err(CrosshairError::CodeTooLong)
        ));
        assert!(matches!(decode("AQDehwon"), Err(CrosshairError::NotACode)));
    }

    #[test]
    fn scales_every_pixel_to_a_square() {
        let settings = decode(fixtures::RED_PIPS).unwrap();
        let size = |png: &Bytes| image::load_from_memory(png).unwrap().to_rgba8();
        let plain = size(&render_png(&settings, 1080, 1).unwrap());
        let scaled = size(&render_png(&settings, 1080, 4).unwrap());
        assert_eq!(scaled.width(), plain.width() * 4);
        for (x, y, pixel) in plain.enumerate_pixels() {
            assert_eq!(scaled.get_pixel(x * 4 + 3, y * 4 + 3), pixel);
        }
        assert!(matches!(
            render_png(&settings, 1080, 0),
            Err(CrosshairError::Scale)
        ));
        // A large crosshair is only enlarged as far as the size limit allows.
        let large = Settings {
            pip_gap: 200,
            ..settings
        };
        assert!(size(&render_png(&large, 2160, 16).unwrap()).width() <= MAX_SCALED_SIZE);
    }
}

/// Codes exported by the game, with reference renders next to them in `fixtures/`.
#[cfg(test)]
mod fixtures {
    /// Every setting, zstd-compressed: a teal dot with a black ring and no pips.
    pub(super) const TEAL_DOT: &str = include_str!("fixtures/teal_dot.txt");
    /// Only the changed settings, uncompressed: red pips around a small dot.
    pub(super) const RED_PIPS: &str = include_str!("fixtures/red_pips.txt");
}
