//! Rank badges composed on demand from the published tier badge artwork.
//!
//! Panorama draws the division numeral as a text label over the tier badge, so this reproduces
//! that layout. Every constant below is taken from `.BadgeImage .Subrank` in
//! `panorama/styles/citadel_ranked_badge.vcss` (client 6670).

#![expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    reason = "pixel geometry is computed in f32 and converted back to image coordinates"
)]

use core::time::Duration;
use std::sync::Arc;

use ab_glyph::{Font, FontVec, Glyph, PxScale, ScaleFont, point};
use axum::body::Bytes;
use axum::http::StatusCode;
use cached::macros::cached;
use image::{ImageEncoder, Rgba, RgbaImage};
use object_store::ObjectStoreExt;
use object_store::path::Path as ObjectPath;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};

/// There are only 66 badges per format and they change only when a new asset build lands.
pub(crate) const CACHE_TTL: Duration = Duration::from_hours(24);

const FONT_KEY: &str = "assets-api-res/fonts/valveoracle-semibold.ttf";

const ROMAN: [&str; 6] = ["I", "II", "III", "IV", "V", "VI"];

/// Panorama lays the badge out in a 256x256 `.BadgeImage` panel with `background-size: contain`,
/// so every length below is in that space and scales with the source artwork.
const LAYOUT_BOX: f32 = 256.0;

/// `text-shadow: 0px 1px`, in layout-box pixels.
const SHADOW_DROP: f32 = 1.0;

/// Placement of `.Subrank` for one tier: the `translateX`/`translateY` applied to the label, its
/// `font-size`, and the `color`/`text-shadow` colours.
struct Numeral {
    offset: (f32, f32),
    size: f32,
    color: Rgba<u8>,
    shadow: Rgba<u8>,
}

const fn rgba(hex: u32) -> Rgba<u8> {
    Rgba([
        (hex >> 24) as u8,
        (hex >> 16) as u8,
        (hex >> 8) as u8,
        hex as u8,
    ])
}

const fn numeral(offset: (f32, f32), size: f32, color: u32, shadow: u32) -> Numeral {
    Numeral {
        offset,
        size,
        color: rgba(color),
        shadow: rgba(shadow),
    }
}

/// Indexed by tier - 1. Tiers 9-11 use the larger winged artwork and a smaller numeral.
const NUMERALS: [Numeral; 11] = [
    numeral((-1.0, 46.0), 30.0, 0x0000_00dd, 0x7856_31ff),
    numeral((-2.0, 52.0), 30.0, 0x0000_00dd, 0x7c6e_63ff),
    numeral((-1.0, 36.0), 30.0, 0x0000_00dd, 0x8b90_92ff),
    numeral((-2.0, 40.0), 30.0, 0x0000_00dd, 0xa579_41ff),
    numeral((-2.0, 48.0), 30.0, 0x0000_00dd, 0xb9d0_e0ff),
    numeral((-1.0, 40.0), 30.0, 0x0000_00dd, 0xddb8_54ff),
    numeral((-1.0, 50.0), 30.0, 0x050a_27dd, 0xe3ea_deff),
    numeral((-1.0, 48.0), 30.0, 0x0000_00dd, 0xd7e1_ebff),
    numeral((0.0, 77.0), 24.0, 0x0000_00cc, 0xd2dc_efff),
    numeral((0.0, 76.0), 24.0, 0x0000_00cc, 0xf2fe_d6ff),
    numeral((0.0, 76.0), 24.0, 0x0000_00cc, 0xfafd_fcff),
];

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankImageFormat {
    #[default]
    Png,
    Webp,
}

impl RankImageFormat {
    fn suffix(self) -> &'static str {
        match self {
            Self::Png => "",
            Self::Webp => "_webp",
        }
    }

    pub(crate) fn content_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Webp => "image/webp",
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Deserialize, utoipa::IntoParams)]
pub(crate) struct RankImageQuery {
    /// Image format. Defaults to `png`. Supported: `png`, `webp`.
    #[serde(default)]
    #[param(inline)]
    pub(crate) format: RankImageFormat,
}

#[cached(
    ttl_secs = 86400,
    convert = "{ (badge, format) }",
    key = "(u32, RankImageFormat)",
    sync_writes = "by_key"
)]
pub(crate) async fn render(
    state: &AppState,
    badge: u32,
    format: RankImageFormat,
) -> Result<Bytes, APIError> {
    let (Some(numeral), Some(spec)) = (
        ROMAN.get((badge % 10).wrapping_sub(1) as usize),
        NUMERALS.get((badge / 10).wrapping_sub(1) as usize),
    ) else {
        return Err(APIError::status_msg(
            StatusCode::NOT_FOUND,
            "No image available for the rank.",
        ));
    };

    let mut image = badge_image(state, badge).await?;
    let font = font(state).await?;
    draw_numeral(&mut image, &font, spec, numeral);
    encode(&image, format)
}

pub(crate) async fn fetch_tier_image(
    state: &AppState,
    badge: u32,
    format: RankImageFormat,
) -> APIResult<Bytes> {
    let rank = badge / 10;
    let suffix = format.suffix();

    let image_url = state
        .assets_client
        .fetch_ranks()
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch ranks: {e}")))?
        .iter()
        .find(|r| r.tier == rank)
        .and_then(|r| r.images.get(&format!("large{suffix}")).cloned())
        .ok_or_else(|| {
            APIError::status_msg(StatusCode::NOT_FOUND, "No image available for the rank.")
        })?;

    let response = reqwest::get(&image_url)
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch rank image: {e}")))?;

    if !response.status().is_success() {
        return Err(APIError::internal(format!(
            "Rank image request failed with status {}",
            response.status()
        )));
    }

    response
        .bytes()
        .await
        .map_err(|e| APIError::internal(format!("Failed to read rank image bytes: {e}")))
}

async fn badge_image(state: &AppState, badge: u32) -> APIResult<RgbaImage> {
    let png = fetch_tier_image(state, badge, RankImageFormat::Png).await?;
    Ok(
        image::load_from_memory_with_format(&png, image::ImageFormat::Png)
            .map_err(|e| APIError::internal(format!("Failed to decode rank badge: {e}")))?
            .to_rgba8(),
    )
}

/// Centre of the numeral's line box, mapping the layout box onto the artwork the way
/// `background-size: contain` does.
fn numeral_center(spec: &Numeral, width: f32, height: f32, scale: f32) -> (f32, f32) {
    (
        width / 2.0 + spec.offset.0 * scale,
        height / 2.0 + spec.offset.1 * scale,
    )
}

/// `PxScale` scales glyphs by the font's ascent-to-descent height, whereas a CSS `font-size` is
/// the em size. Without this the numeral renders at `units_per_em / height` of its intended size.
fn px_scale(font: &FontVec, size: f32) -> PxScale {
    font.units_per_em().map_or_else(
        || PxScale::from(size),
        |em| PxScale::from(size * font.height_unscaled() / em),
    )
}

fn draw_numeral(image: &mut RgbaImage, font: &FontVec, spec: &Numeral, numeral: &str) {
    let (width, height) = (image.width() as f32, image.height() as f32);
    let scale = width.max(height) / LAYOUT_BOX;
    let font_scale = px_scale(font, spec.size * scale);

    let text = Text::layout(font, numeral, font_scale);
    let scaled = font.as_scaled(font_scale);
    // `vertical-align: middle` centres the line box, which sits above the baseline.
    let center = numeral_center(spec, width, height, scale);
    let origin = (
        center.0 - text.width / 2.0,
        center.1 + f32::midpoint(scaled.ascent(), scaled.descent()),
    );

    text.draw(
        image,
        font,
        (origin.0, origin.1 + SHADOW_DROP * scale),
        spec.shadow,
    );
    text.draw(image, font, origin, spec.color);
}

/// Glyphs positioned relative to the text origin, which is its left edge on the baseline.
struct Text {
    glyphs: Vec<Glyph>,
    width: f32,
}

impl Text {
    fn layout(font: &FontVec, text: &str, scale: PxScale) -> Self {
        let scaled = font.as_scaled(scale);
        let mut glyphs = Vec::with_capacity(text.chars().count());
        let mut pen = 0.0;
        let mut previous = None;
        for character in text.chars() {
            let id = scaled.glyph_id(character);
            if let Some(previous) = previous {
                pen += scaled.kern(previous, id);
            }
            glyphs.push(id.with_scale_and_position(scale, point(pen, 0.0)));
            pen += scaled.h_advance(id);
            previous = Some(id);
        }
        Self { width: pen, glyphs }
    }

    fn draw(&self, canvas: &mut RgbaImage, font: &FontVec, origin: (f32, f32), color: Rgba<u8>) {
        let (width, height) = (canvas.width() as i32, canvas.height() as i32);
        let alpha = f32::from(color[3]) / 255.0;

        for glyph in &self.glyphs {
            let mut glyph = glyph.clone();
            glyph.position.x += origin.0;
            glyph.position.y += origin.1;
            let Some(outline) = font.outline_glyph(glyph) else {
                continue;
            };
            let bounds = outline.px_bounds();
            let (min_x, min_y) = (bounds.min.x as i32, bounds.min.y as i32);
            outline.draw(|x, y, value| {
                let (x, y) = (min_x + x as i32, min_y + y as i32);
                if x >= 0 && y >= 0 && x < width && y < height {
                    blend(
                        canvas.get_pixel_mut(x as u32, y as u32),
                        color,
                        value * alpha,
                    );
                }
            });
        }
    }
}

fn blend(target: &mut Rgba<u8>, color: Rgba<u8>, alpha: f32) {
    let source_alpha = alpha.clamp(0.0, 1.0);
    let target_alpha = f32::from(target[3]) / 255.0;
    let out_alpha = source_alpha + target_alpha * (1.0 - source_alpha);
    if out_alpha <= 0.0 {
        *target = Rgba([0, 0, 0, 0]);
        return;
    }
    for index in 0..3 {
        let source = f32::from(color[index]) * source_alpha;
        let existing = f32::from(target[index]) * target_alpha * (1.0 - source_alpha);
        target[index] = ((source + existing) / out_alpha).round() as u8;
    }
    target[3] = (out_alpha * 255.0).round() as u8;
}

fn encode(image: &RgbaImage, format: RankImageFormat) -> APIResult<Bytes> {
    let (raw, width, height) = (image.as_raw(), image.width(), image.height());
    let color = image::ExtendedColorType::Rgba8;
    let mut out = Vec::new();
    match format {
        RankImageFormat::Png => {
            image::codecs::png::PngEncoder::new(&mut out).write_image(raw, width, height, color)
        }
        RankImageFormat::Webp => image::codecs::webp::WebPEncoder::new_lossless(&mut out)
            .write_image(raw, width, height, color),
    }
    .map_err(|e| APIError::internal(format!("Failed to encode rank image: {e}")))?;
    Ok(Bytes::from(out))
}

#[cached(
    ttl_secs = 86400,
    key = "u8",
    convert = "{ 0 }",
    result_fallback = true
)]
async fn font(state: &AppState) -> Result<Arc<FontVec>, APIError> {
    let bytes = state
        .r2_client
        .get(&ObjectPath::from(FONT_KEY))
        .await
        .map_err(|e| APIError::internal(format!("Failed to fetch rank font: {e}")))?
        .bytes()
        .await
        .map_err(|e| APIError::internal(format!("Failed to read rank font: {e}")))?;
    FontVec::try_from_vec(bytes.to_vec())
        .map(Arc::new)
        .map_err(|e| APIError::internal(format!("Failed to parse rank font: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reproduces Panorama's `contain` fit for one tier's published artwork.
    fn center_for(tier: usize, width: f32, height: f32) -> (f32, f32) {
        let spec = &NUMERALS[tier - 1];
        numeral_center(spec, width, height, width.max(height) / LAYOUT_BOX)
    }

    #[test]
    fn numeral_sits_on_the_plate_of_the_small_artwork() {
        // rank01_lg.png is 404x324, so the 256px layout box scales by 1.578.
        let (x, y) = center_for(1, 404.0, 324.0);
        assert!((x - 200.4).abs() < 0.1, "x {x}");
        assert!((y - 234.6).abs() < 0.1, "y {y}");
    }

    #[test]
    fn numeral_sits_on_the_plate_of_the_winged_artwork() {
        // rank11_lg.png is 512x404, so the layout box scales by exactly 2.
        let (x, y) = center_for(11, 512.0, 404.0);
        assert!((x - 256.0).abs() < 0.1, "x {x}");
        assert!((y - 354.0).abs() < 0.1, "y {y}");
    }

    #[test]
    fn every_tier_has_a_placement() {
        assert_eq!(NUMERALS.len(), 11);
    }
}
