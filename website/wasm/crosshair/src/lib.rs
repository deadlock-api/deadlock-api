//! The `crosshair` crate for the website: on `wasm32` it exports `decode`, `encode` and `render`
//! over JSON (see `wasm-abi`), so the crosshair editor reads, writes and draws crosshairs with the
//! API's own code, without a request.
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use base64::Engine as _;
use base64::engine::general_purpose;
use crosshair::Settings;
use serde::{Deserialize, Serialize};

#[cfg(target_arch = "wasm32")]
mod ffi {
    wasm_abi::export!(
        decode => crate::decode_json,
        encode => crate::encode_json,
        render => crate::render_json,
    );
}

/// What [`render_json`] reads.
#[derive(Debug, Deserialize)]
struct RenderRequest {
    settings: Settings,
    screen_height: u32,
}

/// What [`render_json`] answers: a square image `size` pixels wide, as base64 of its RGBA bytes,
/// row by row.
#[derive(Debug, Serialize)]
struct RenderedImage {
    size: u32,
    pixels: String,
}

/// [`crosshair::decode`] of a share code or console commands, answered as JSON of every setting.
pub fn decode_json(code: &str) -> Result<String, String> {
    let settings = crosshair::decode(code).map_err(|e| e.to_string())?;
    serde_json::to_string(&settings).map_err(|e| e.to_string())
}

/// [`crosshair::encode`] of JSON settings; settings left out keep the game's defaults.
pub fn encode_json(json: &str) -> Result<String, String> {
    let settings: Settings =
        serde_json::from_str(json).map_err(|e| format!("not crosshair settings: {e}"))?;
    Ok(crosshair::encode(&settings))
}

/// [`crosshair::render`] of `{"settings": …, "screen_height": …}`, answered as JSON of the image.
pub fn render_json(json: &str) -> Result<String, String> {
    let request: RenderRequest =
        serde_json::from_str(json).map_err(|e| format!("not a render request: {e}"))?;
    let image =
        crosshair::render(&request.settings, request.screen_height).map_err(|e| e.to_string())?;
    serde_json::to_string(&RenderedImage {
        size: image.width(),
        pixels: general_purpose::STANDARD.encode(image.as_raw()),
    })
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RED_PIPS: &str =
        include_str!("../../../../util-crates/crosshair/src/fixtures/red_pips.txt");

    #[test]
    fn round_trips_settings_through_json() {
        let settings = decode_json(RED_PIPS).unwrap();
        let code = encode_json(&settings).unwrap();
        assert_eq!(decode_json(&code).unwrap(), settings);
        assert_eq!(
            encode_json("{}").unwrap(),
            crosshair::encode(&Settings::default())
        );
        decode_json("not a code").unwrap_err();
        encode_json(r#""DL.""#).unwrap_err();
    }

    #[test]
    fn renders_rgba_pixels() {
        let settings = decode_json(RED_PIPS).unwrap();
        let json = render_json(&format!(
            r#"{{"settings":{settings},"screen_height":1080}}"#
        ))
        .unwrap();
        let image: serde_json::Value = serde_json::from_str(&json).unwrap();
        let expected = crosshair::render(&crosshair::decode(RED_PIPS).unwrap(), 1080).unwrap();
        assert_eq!(image["size"], expected.width());
        assert_eq!(
            general_purpose::STANDARD
                .decode(image["pixels"].as_str().unwrap())
                .unwrap(),
            expected.as_raw().as_slice()
        );
        let too_large = r#"{"settings":{"dot_size":100000},"screen_height":1080}"#;
        assert_eq!(
            render_json(too_large).unwrap_err(),
            "Crosshair is too large to render"
        );
    }
}
