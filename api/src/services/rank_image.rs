//! Rank badges composed on demand from the published tier badge artwork.
//!
//! Valve ships the tier badge and the division numeral as separate Panorama assets and only the
//! badge is published to the assets bucket, so the numeral is drawn as text here. Geometry and
//! styling mirror the `.rank-badge` component on deadlock-api.com: the badge is cropped to its
//! visible area and the roman numeral is centred at 79% of that height, white with a heavy
//! darkened-metal stroke.

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
use image::{ImageEncoder, Rgba, RgbaImage, imageops};
use object_store::ObjectStoreExt;
use object_store::path::Path as ObjectPath;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::context::AppState;
use crate::error::{APIError, APIResult};

/// A tier/division badge only changes when a new asset build lands, so both the composition
/// below and the responses that serve it are cached for a day.
pub(crate) const CACHE_TTL: Duration = Duration::from_hours(24);

const FONT_KEY: &str = "assets-api-res/fonts/valveoracle-semibold.ttf";

const ROMAN: [&str; 6] = ["I", "II", "III", "IV", "V", "VI"];

/// Visible badge area inside the published artwork, as fractions of the source image. The badges
/// carry a wide transparent margin that the game crops away in Panorama.
const CROP: (f32, f32, f32, f32) = (0.228, 0.082_985, 0.53, 0.906_844);

/// Numeral centre, as fractions of the cropped badge.
const NUMERAL_CENTER: (f32, f32) = (0.5, 0.79);
/// Numeral font size, as a fraction of the cropped badge width.
const NUMERAL_SIZE: f32 = 0.643_11;
/// Letter spacing and stroke width, as fractions of the numeral font size.
const NUMERAL_LETTER_SPACING: f32 = 0.04;
const NUMERAL_STROKE: f32 = 0.05;

/// The numeral outline is the badge's own metal, darkened. Measured against the reference
/// rendering: Sentinel's badge averages `#7d4c2c`, which lands on its `#674423` outline.
const STROKE_DARKEN: f32 = 0.83;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RankImageFormat {
    #[default]
    Png,
    Webp,
}

impl RankImageFormat {
    /// Suffix of the matching `images` key in the ranks asset metadata.
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

/// Compose the badge for `badge`, which must carry a division (`badge % 10` in `1..=6`). There are
/// only 66 of these per format, and they change only when a new asset build lands, so the result is
/// cached for [`CACHE_TTL`].
#[cached(
    ttl = 86400,
    convert = "{ (badge, format) }",
    key = "(u32, RankImageFormat)",
    sync_writes = "by_key"
)]
pub(crate) async fn render(
    state: &AppState,
    badge: u32,
    format: RankImageFormat,
) -> Result<Bytes, APIError> {
    let subrank = badge % 10;
    let numeral = ROMAN.get(subrank.wrapping_sub(1) as usize).ok_or_else(|| {
        APIError::status_msg(StatusCode::NOT_FOUND, "No image available for the rank.")
    })?;

    let mut image = cropped_badge(state, badge).await?;
    let font = font(state).await?;
    draw_numeral(&mut image, &font, numeral);
    encode(&image, format)
}

/// The tier badge exactly as published in the assets bucket.
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

/// The published tier badge, decoded and cropped to its visible area.
async fn cropped_badge(state: &AppState, badge: u32) -> APIResult<RgbaImage> {
    let png = fetch_tier_image(state, badge, RankImageFormat::Png).await?;
    let source = image::load_from_memory_with_format(&png, image::ImageFormat::Png)
        .map_err(|e| APIError::internal(format!("Failed to decode rank badge: {e}")))?
        .to_rgba8();
    Ok(crop_badge(&source))
}

fn crop_badge(source: &RgbaImage) -> RgbaImage {
    let (x, y, width, height) = (
        (CROP.0 * source.width() as f32) as u32,
        (CROP.1 * source.height() as f32) as u32,
        (CROP.2 * source.width() as f32) as u32,
        (CROP.3 * source.height() as f32) as u32,
    );
    imageops::crop_imm(source, x, y, width, height).to_image()
}

/// Mean colour of the opaque badge pixels, darkened into the numeral's outline colour.
fn stroke_color(badge: &RgbaImage) -> Rgba<u8> {
    let mut total = [0u64; 3];
    let mut count = 0u64;
    for pixel in badge.pixels().filter(|p| p[3] > 200) {
        for (sum, channel) in total.iter_mut().zip(pixel.0) {
            *sum += u64::from(channel);
        }
        count += 1;
    }
    if count == 0 {
        return Rgba([0, 0, 0, 255]);
    }
    let channel = |sum: u64| (sum as f32 / count as f32 * STROKE_DARKEN) as u8;
    Rgba([channel(total[0]), channel(total[1]), channel(total[2]), 255])
}

fn draw_numeral(image: &mut RgbaImage, font: &FontVec, numeral: &str) {
    let (width, height) = (image.width() as f32, image.height() as f32);
    let size = NUMERAL_SIZE * width;
    let stroke = stroke_color(image);

    let text = Text::layout(font, numeral, size, NUMERAL_LETTER_SPACING * size);
    let origin = (
        NUMERAL_CENTER.0 * width - text.width / 2.0,
        NUMERAL_CENTER.1 * height,
    );
    // `paint-order: stroke` puts the outline under the fill, so only its outer half shows.
    text.draw(image, font, origin, stroke, NUMERAL_STROKE * size);
    text.draw(image, font, origin, Rgba([255, 255, 255, 255]), 0.0);
}

/// A laid-out run of glyphs, positioned relative to the text origin (left edge, baseline).
struct Text {
    glyphs: Vec<Glyph>,
    width: f32,
}

impl Text {
    fn layout(font: &FontVec, text: &str, size: f32, letter_spacing: f32) -> Self {
        let scaled = font.as_scaled(PxScale::from(size));
        let mut glyphs = Vec::with_capacity(text.chars().count());
        let mut pen = 0.0;
        let mut previous = None;
        for character in text.chars() {
            let id = scaled.glyph_id(character);
            if let Some(previous) = previous {
                pen += scaled.kern(previous, id);
            }
            glyphs.push(id.with_scale_and_position(size, point(pen, 0.0)));
            pen += scaled.h_advance(id) + letter_spacing;
            previous = Some(id);
        }
        Self {
            width: (pen - letter_spacing).max(0.0),
            glyphs,
        }
    }

    /// Blend the run onto `canvas` at `origin`. A non-zero `stroke` dilates the glyph coverage by
    /// that radius, which is how the outline is drawn.
    fn draw(
        &self,
        canvas: &mut RgbaImage,
        font: &FontVec,
        origin: (f32, f32),
        color: Rgba<u8>,
        stroke: f32,
    ) {
        let (width, height) = (canvas.width() as usize, canvas.height() as usize);
        let mut coverage = vec![0f32; width * height];

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
                if x >= 0 && y >= 0 && (x as usize) < width && (y as usize) < height {
                    let slot = &mut coverage[y as usize * width + x as usize];
                    *slot = slot.max(value);
                }
            });
        }

        if stroke > 0.0 {
            coverage = dilate(&coverage, width, height, stroke);
        }

        for (index, value) in coverage.iter().enumerate() {
            if *value > 0.0 {
                let (x, y) = ((index % width) as u32, (index / width) as u32);
                blend(canvas.get_pixel_mut(x, y), color, *value);
            }
        }
    }
}

/// Grow a coverage mask by `radius` pixels, taking the maximum over a disc.
fn dilate(coverage: &[f32], width: usize, height: usize, radius: f32) -> Vec<f32> {
    let limit = radius.ceil() as i32;
    let disc: Vec<(i32, i32)> = (-limit..=limit)
        .flat_map(|dy| (-limit..=limit).map(move |dx| (dx, dy)))
        .filter(|(dx, dy)| {
            let distance = ((dx * dx + dy * dy) as f32).sqrt();
            distance <= radius
        })
        .collect();

    let mut out = vec![0f32; coverage.len()];
    for y in 0..height {
        for x in 0..width {
            let (x, y) = (x as i32, y as i32);
            let mut best = 0f32;
            for (dx, dy) in &disc {
                let (sx, sy) = (x + dx, y + dy);
                if sx >= 0 && sy >= 0 && (sx as usize) < width && (sy as usize) < height {
                    best = best.max(coverage[sy as usize * width + sx as usize]);
                }
            }
            out[y as usize * width + x as usize] = best;
        }
    }
    out
}

/// Source-over blend of `color` at `alpha` coverage onto `target`.
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
    {
        target[3] = (out_alpha * 255.0).round() as u8;
    }
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

/// The game's own display font, published alongside the images.
#[cached(ttl = 86400, key = "u8", convert = "{ 0 }", sync_writes = "default")]
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

    #[test]
    fn numeral_stroke_matches_the_reference_rendering() {
        // Sentinel's badge averages #7d4c2c; the reference outline is #674423.
        let badge = RgbaImage::from_pixel(4, 4, Rgba([0x7d, 0x4c, 0x2c, 255]));
        let Rgba([r, g, b, _]) = stroke_color(&badge);
        assert!(r.abs_diff(0x67) <= 6, "red {r:#04x}");
        assert!(g.abs_diff(0x44) <= 6, "green {g:#04x}");
        assert!(b.abs_diff(0x23) <= 6, "blue {b:#04x}");
    }

    #[test]
    fn stroke_ignores_transparent_padding() {
        let mut badge = RgbaImage::from_pixel(4, 4, Rgba([255, 255, 255, 0]));
        badge.put_pixel(0, 0, Rgba([100, 100, 100, 255]));
        assert_eq!(stroke_color(&badge), Rgba([83, 83, 83, 255]));
    }
}
