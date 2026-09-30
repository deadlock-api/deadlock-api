//! Rasterises crosshair settings the way the game's HUD draws them.
//!
//! The layout mirrors the reticle panels in `client.dll`: a round dot with a ring outline in the
//! centre and four pips around it, each with a rectangular outline. Lengths are in units of 1/1080
//! of the screen height. Each pixel is covered by a 16x16 grid of samples.

#![expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    reason = "pixel geometry is computed in f32 and converted back to image coordinates"
)]

use core::ops::Range;

use image::RgbaImage;

use super::CrosshairError;
use super::settings::Settings;

/// Samples per pixel along each axis.
const SUBSAMPLES: usize = 16;
const SAMPLES: f32 = (SUBSAMPLES * SUBSAMPLES) as f32;
/// Layout units per screen: lengths scale with `screen_height / REFERENCE_HEIGHT`.
const REFERENCE_HEIGHT: f32 = 1080.0;
/// Transparent padding around the crosshair, in pixels.
const PADDING: usize = 2;
/// Largest image edge we render; real crosshairs are well under 200 px even at 4K.
pub(crate) const MAX_IMAGE_SIZE: usize = 1024;

/// One filled shape, or a hollow one when `border > 0`, centred at `center` in layout units.
#[derive(Debug, Clone, Copy)]
struct Shape {
    center: (f32, f32),
    size: (f32, f32),
    border: f32,
    round: bool,
    color: [f32; 3],
    opacity: f32,
}

impl Shape {
    /// The size of the hole of a hollow shape.
    fn hole(&self) -> Option<(f32, f32)> {
        let (w, h) = self.size;
        (self.border > 0.0 && w > 2.0 * self.border)
            .then_some((w - 2.0 * self.border, h - 2.0 * self.border))
    }
}

pub(crate) fn render(settings: &Settings, screen_height: f32) -> Result<RgbaImage, CrosshairError> {
    let scale = screen_height / REFERENCE_HEIGHT;
    let shapes = layout(settings, screen_height);

    // How far the visible shapes reach from the centre, in pixels.
    let extent = shapes
        .iter()
        .filter(|s| s.opacity > 0.0)
        .map(|s| (s.center.0.abs() + s.size.0 / 2.0).max(s.center.1.abs() + s.size.1 / 2.0) * scale)
        .fold(0.0f32, f32::max)
        .ceil();
    if extent > (MAX_IMAGE_SIZE / 2 - PADDING) as f32 {
        return Err(CrosshairError::TooLarge);
    }
    let grid = Grid::new(extent as usize + PADDING, scale);

    let mut canvas = vec![[0.0f32; 4]; grid.size * grid.size];
    for shape in shapes
        .iter()
        .filter(|s| s.opacity > 0.0 && s.size.0 > 0.0 && s.size.1 > 0.0)
    {
        paint(&mut canvas, &grid, shape);
    }
    Ok(to_image(&canvas, grid.size))
}

/// The shapes making up the crosshair, in the order the game paints them.
fn layout(s: &Settings, screen_height: f32) -> [Shape; 10] {
    let color = [s.color_r, s.color_g, s.color_b].map(|c| f32::from(c) / 255.0);
    let outline_color =
        [s.outline_color_r, s.outline_color_g, s.outline_color_b].map(|c| f32::from(c) / 255.0);
    let opacity = |o: f32| o.clamp(0.0, 1.0);
    let outline_opacity = |border: f32, o: f32| if border > 0.0 { opacity(o) } else { 0.0 };

    let dot = s.dot_size as f32;
    let dot_border = s.dot_outline_border as f32;
    let dot_ring = 2.0 * dot_border + s.dot_outline_gap as f32 + dot;

    // Pips sit round(3H/480) + max(gap, -14) + 4 units from the centre. A static gap applies the
    // -14 floor to the sum instead.
    let base = (3.0 * screen_height / 480.0).round_ties_even();
    let gap = s.pip_gap as f32;
    let offset = 4.0
        + if s.pip_gap_static {
            (base + gap).max(base - 14.0)
        } else {
            base + gap.max(-14.0)
        };
    let (pip_w, pip_h) = (s.pip_width as f32, s.pip_height as f32);
    let pip_border = s.pip_outline_border as f32;
    let pip_grow = 2.0 * pip_border + s.pip_outline_gap as f32;

    let pip = |center: (f32, f32), horizontal: bool| {
        let (w, h) = if horizontal {
            (pip_h, pip_w)
        } else {
            (pip_w, pip_h)
        };
        let fill = Shape {
            center,
            size: (w, h),
            border: 0.0,
            round: false,
            color,
            opacity: opacity(s.pip_opacity),
        };
        let outline = Shape {
            size: (w + pip_grow, h + pip_grow),
            border: pip_border,
            color: outline_color,
            opacity: outline_opacity(pip_border, s.pip_outline_opacity),
            ..fill
        };
        [fill, outline]
    };
    let [top, top_outline] = pip((0.0, -offset), false);
    let [right, right_outline] = pip((offset, 0.0), true);
    let [bottom, bottom_outline] = pip((0.0, offset), false);
    let [left, left_outline] = pip((-offset, 0.0), true);

    [
        Shape {
            center: (0.0, 0.0),
            size: (dot_ring, dot_ring),
            border: dot_border,
            round: true,
            color: outline_color,
            opacity: outline_opacity(dot_border, s.dot_outline_opacity),
        },
        Shape {
            center: (0.0, 0.0),
            size: (dot, dot),
            border: 0.0,
            round: true,
            color,
            opacity: opacity(s.dot_opacity),
        },
        top,
        top_outline,
        right,
        right_outline,
        bottom,
        bottom_outline,
        left,
        left_outline,
    ]
}

/// A square image of `size` pixels whose centre is the crosshair's centre.
struct Grid {
    size: usize,
    half: f32,
    scale: f32,
}

impl Grid {
    fn new(half: usize, scale: f32) -> Self {
        Self {
            size: 2 * half,
            half: half as f32,
            scale,
        }
    }

    /// Layout-unit coordinate of sample `sub` of `pixel`, relative to `center`.
    fn sample(&self, pixel: usize, sub: usize, center: f32) -> f32 {
        (pixel as f32 + sub as f32 / SUBSAMPLES as f32 + 0.5 / SUBSAMPLES as f32 - self.half)
            / self.scale
            - center
    }

    /// The pixels along one axis that can hold samples within `reach` units of `center`, with a
    /// margin so rounding never clips coverage.
    fn span(&self, center: f32, reach: f32) -> Range<usize> {
        let to_pixel = |unit: f32| unit * self.scale + self.half;
        let start = (to_pixel(center - reach).floor() - 2.0).max(0.0) as usize;
        let end = (to_pixel(center + reach).ceil() + 2.0).max(0.0) as usize;
        start.min(self.size)..end.min(self.size)
    }
}

/// Composites `shape` over the premultiplied canvas.
fn paint(canvas: &mut [[f32; 4]], grid: &Grid, shape: &Shape) {
    let (w, h) = shape.size;
    let columns = grid.span(shape.center.0, w / 2.0);
    let rows = grid.span(shape.center.1, h / 2.0);
    let coverage = if shape.round {
        round_coverage(grid, shape, &columns, &rows)
    } else {
        rect_coverage(grid, shape, &columns, &rows)
    };

    for (y, row) in rows.clone().zip(coverage.chunks_exact(columns.len())) {
        for (x, &hits) in columns.clone().zip(row) {
            if hits == 0 {
                continue;
            }
            let alpha = shape.opacity * f32::from(hits) / SAMPLES;
            let pixel = &mut canvas[y * grid.size + x];
            for (channel, color) in pixel.iter_mut().zip(shape.color) {
                *channel = color * alpha + *channel * (1.0 - alpha);
            }
            pixel[3] = alpha + pixel[3] * (1.0 - alpha);
        }
    }
}

/// Covered samples per pixel of an axis-aligned rectangle, row-major over `columns` x `rows`.
///
/// Rectangles are separable: a sample is inside when its x and its y both are, so the count is the
/// product of per-axis counts, minus the samples that also fall in the hole.
fn rect_coverage(
    grid: &Grid,
    shape: &Shape,
    columns: &Range<usize>,
    rows: &Range<usize>,
) -> Vec<u16> {
    let (w, h) = shape.size;
    let (hole_w, hole_h) = shape.hole().unzip();
    let axis = |range: &Range<usize>, center: f32, outer: f32, hole: Option<f32>| {
        range
            .clone()
            .map(|pixel| {
                let (mut inside, mut in_hole) = (0u16, 0u16);
                for sub in 0..SUBSAMPLES {
                    let v = grid.sample(pixel, sub, center).abs();
                    if v <= outer / 2.0 {
                        inside += 1;
                        in_hole += u16::from(hole.is_some_and(|hole| v <= hole / 2.0));
                    }
                }
                (inside, in_hole)
            })
            .collect::<Vec<_>>()
    };
    let xs = axis(columns, shape.center.0, w, hole_w);
    let ys = axis(rows, shape.center.1, h, hole_h);
    ys.iter()
        .flat_map(|&(y, y_hole)| xs.iter().map(move |&(x, x_hole)| x * y - x_hole * y_hole))
        .collect()
}

/// Squared sample offsets of one pixel along one axis, with their extremes.
struct Squares {
    values: [f32; SUBSAMPLES],
    min: f32,
    max: f32,
}

/// Covered samples per pixel of a disc or ring, row-major over `columns` x `rows`.
///
/// Float addition is monotonic, so a pixel whose nearest sample is outside a circle or whose
/// farthest sample is inside it is decided without visiting every sample. Only pixels on an edge
/// are sampled in full, which keeps large dots cheap while staying exact.
fn round_coverage(
    grid: &Grid,
    shape: &Shape,
    columns: &Range<usize>,
    rows: &Range<usize>,
) -> Vec<u16> {
    let (w, _) = shape.size;
    let radius_sq = w * w / 4.0;
    let hole_sq = shape.hole().map(|(hole, _)| hole * hole / 4.0);
    let squares = |range: &Range<usize>, center: f32| {
        range
            .clone()
            .map(|pixel| {
                let values = core::array::from_fn(|sub| {
                    let v = grid.sample(pixel, sub, center);
                    v * v
                });
                Squares {
                    values,
                    min: values.into_iter().fold(f32::INFINITY, f32::min),
                    max: values.into_iter().fold(0.0, f32::max),
                }
            })
            .collect::<Vec<_>>()
    };
    // Samples of the pixel within `limit`: all, none, or `None` when the pixel straddles it.
    let bulk = |x: &Squares, y: &Squares, limit: f32| {
        if x.min + y.min > limit {
            Some(0)
        } else if x.max + y.max <= limit {
            Some(SUBSAMPLES * SUBSAMPLES)
        } else {
            None
        }
    };
    let xs = squares(columns, shape.center.0);
    let ys = squares(rows, shape.center.1);
    ys.iter()
        .flat_map(|y| {
            xs.iter().map(move |x| {
                match (
                    bulk(x, y, radius_sq),
                    hole_sq.map_or(Some(0), |hole| bulk(x, y, hole)),
                ) {
                    (Some(0), _) => return 0,
                    // Every sample is inside the circle, so the hole's samples are all it loses.
                    (Some(inside), Some(in_hole)) => return (inside - in_hole) as u16,
                    _ => {}
                }
                let mut hits = 0u16;
                for &yy in &y.values {
                    for &xx in &x.values {
                        let d = xx + yy;
                        hits += u16::from(d <= radius_sq && !hole_sq.is_some_and(|hole| d <= hole));
                    }
                }
                hits
            })
        })
        .collect()
}

/// Un-premultiplies the canvas into 8-bit RGBA.
fn to_image(canvas: &[[f32; 4]], size: usize) -> RgbaImage {
    let to_byte = |v: f32| (v * 255.0).round().clamp(0.0, 255.0) as u8;
    let raw = canvas
        .iter()
        .flat_map(|&[r, g, b, a]| {
            let divisor = a.max(1e-9);
            [
                to_byte(r / divisor),
                to_byte(g / divisor),
                to_byte(b / divisor),
                to_byte(a),
            ]
        })
        .collect();
    let size = u32::try_from(size).unwrap_or(u32::MAX);
    RgbaImage::from_raw(size, size, raw).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;
    use crate::services::crosshair::code;
    use crate::services::crosshair::fixtures::{RED_PIPS, TEAL_DOT};

    /// The fixtures were rendered by the reference implementation this module was ported from.
    #[rstest]
    #[case::teal_dot_1080(TEAL_DOT, 1080, include_bytes!("fixtures/teal_dot_1080.png").as_slice())]
    #[case::teal_dot_1440(TEAL_DOT, 1440, include_bytes!("fixtures/teal_dot_1440.png").as_slice())]
    #[case::teal_dot_2160(TEAL_DOT, 2160, include_bytes!("fixtures/teal_dot_2160.png").as_slice())]
    #[case::red_pips_1080(RED_PIPS, 1080, include_bytes!("fixtures/red_pips_1080.png").as_slice())]
    #[case::red_pips_1440(RED_PIPS, 1440, include_bytes!("fixtures/red_pips_1440.png").as_slice())]
    #[case::red_pips_2160(RED_PIPS, 2160, include_bytes!("fixtures/red_pips_2160.png").as_slice())]
    fn matches_reference_render(#[case] code: &str, #[case] height: u16, #[case] expected: &[u8]) {
        let settings = code::decode(code).unwrap();
        let rendered = render(&settings, f32::from(height)).unwrap();
        let expected = image::load_from_memory(expected).unwrap().to_rgba8();
        assert_eq!(rendered.dimensions(), expected.dimensions());
        assert!(
            rendered == expected,
            "pixels differ from the reference render"
        );
    }

    #[test]
    fn hollow_shapes_leave_their_hole_empty() {
        let settings = Settings {
            dot_opacity: 0.0,
            pip_opacity: 0.0,
            pip_outline_opacity: 0.0,
            dot_size: 20,
            dot_outline_border: 2,
            dot_outline_opacity: 1.0,
            ..Settings::default()
        };
        let image = render(&settings, 1080.0).unwrap();
        let center = image.width() / 2;
        assert_eq!(image.get_pixel(center, center)[3], 0);
        assert_eq!(image.get_pixel(center, center - 11)[3], 255);
    }

    #[test]
    fn rejects_huge_crosshairs() {
        let settings = Settings {
            dot_size: 100_000,
            ..Settings::default()
        };
        assert!(matches!(
            render(&settings, 1080.0),
            Err(CrosshairError::TooLarge)
        ));
    }

    #[test]
    fn invisible_crosshair_is_just_padding() {
        let settings = Settings {
            pip_opacity: 0.0,
            pip_outline_opacity: 0.0,
            dot_opacity: 0.0,
            dot_outline_opacity: 0.0,
            ..Settings::default()
        };
        let image = render(&settings, 1080.0).unwrap();
        assert_eq!(image.dimensions(), (4, 4));
        assert!(image.pixels().all(|p| p[3] == 0));
    }
}
