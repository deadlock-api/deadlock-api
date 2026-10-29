//! Deadlock's hero build codes: the text the game copies when a player copies a build, and reads
//! back when one is pasted. A code is the base64 of a zstd frame holding a `CMsgHeroBuild`
//! protobuf.
//!
//! [`decode`] and [`encode`] work on the protobuf type of `valveprotos`; on `wasm32` the crate
//! exports them to the website as `decode` / `encode` over JSON of the same type (see `wasm-abi`).
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

use std::io::Read as _;

use base64::Engine as _;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::{DecodePaddingMode, general_purpose};
use prost::Message as _;
use ruzstd::decoding::StreamingDecoder;
use ruzstd::encoding::{CompressionLevel, compress_to_vec};
use valveprotos::deadlock::CMsgHeroBuild;

#[cfg(target_arch = "wasm32")]
mod ffi {
    wasm_abi::export!(decode => crate::decode_json, encode => crate::encode_json);
}

/// The proto caps a build at 16000 bytes (`maximum_size_bytes`); anything that inflates past this
/// is not a build.
const MAX_DECODED_BYTES: u64 = 64 * 1024;

/// Pasted codes may have lost their padding on the way.
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("not a build code (base64: {0})")]
    Base64(base64::DecodeError),
    #[error("not a build code (zstd: {0})")]
    Zstd(String),
    #[error("not a build code (larger than {MAX_DECODED_BYTES} bytes)")]
    TooLarge,
    #[error("not a build code (protobuf: {0})")]
    Protobuf(prost::DecodeError),
}

/// Reads a build code as copied in game. Whitespace anywhere in it (a wrapped paste) is ignored.
pub fn decode(code: &str) -> Result<CMsgHeroBuild, DecodeError> {
    let compact: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    let compressed = BASE64.decode(compact).map_err(DecodeError::Base64)?;
    let decoder = StreamingDecoder::new(compressed.as_slice())
        .map_err(|e| DecodeError::Zstd(e.to_string()))?;
    let mut bytes = Vec::new();
    decoder
        .take(MAX_DECODED_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| DecodeError::Zstd(e.to_string()))?;
    if bytes.len() as u64 > MAX_DECODED_BYTES {
        return Err(DecodeError::TooLarge);
    }
    CMsgHeroBuild::decode(bytes.as_slice()).map_err(DecodeError::Protobuf)
}

/// Writes a build as a code the game accepts on paste.
#[must_use]
pub fn encode(build: &CMsgHeroBuild) -> String {
    let bytes = build.encode_to_vec();
    let frame = compress_to_vec(bytes.as_slice(), CompressionLevel::Fastest);
    general_purpose::STANDARD.encode(with_content_size(frame, bytes.len() as u64))
}

/// Declares the decompressed size in a zstd frame's header, as the game's own codes do (a reader
/// may size its buffer from it). ruzstd leaves it out; the header has room for it after the window
/// and dictionary fields.
fn with_content_size(mut frame: Vec<u8>, size: u64) -> Vec<u8> {
    // https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md#frame_header
    const DESCRIPTOR: usize = 4;
    // The size field follows the descriptor, the one window byte, and the dictionary id.
    const AFTER_WINDOW: usize = DESCRIPTOR + 2;
    let Some(&descriptor) = frame.get(DESCRIPTOR) else {
        return frame;
    };
    let has_size = descriptor >> 6 != 0 || descriptor & 0b0010_0000 != 0;
    if has_size {
        return frame;
    }
    let at = match descriptor & 0b11 {
        0 => AFTER_WINDOW,
        1 => AFTER_WINDOW + 1,
        2 => AFTER_WINDOW + 2,
        _ => AFTER_WINDOW + 4,
    };
    if at > frame.len() {
        return frame;
    }
    // Flag 1 stores the size less 256 in two bytes, flag 2 four bytes, flag 3 eight.
    let less_256 = size
        .checked_sub(256)
        .and_then(|less| u16::try_from(less).ok());
    let (flag, field) = match (less_256, u32::try_from(size)) {
        (Some(less_256), _) => (1, less_256.to_le_bytes().to_vec()),
        (None, Ok(size)) => (2, size.to_le_bytes().to_vec()),
        (None, Err(_)) => (3, size.to_le_bytes().to_vec()),
    };
    if let Some(byte) = frame.get_mut(DESCRIPTOR) {
        *byte = descriptor | (flag << 6);
    }
    frame.splice(at..at, field);
    frame
}

/// [`decode`], answered as JSON of `CMsgHeroBuild` (field names as in the proto, absent fields
/// `null`).
pub fn decode_json(code: &str) -> Result<String, String> {
    let build = decode(code).map_err(|e| e.to_string())?;
    serde_json::to_string(&build).map_err(|e| e.to_string())
}

/// [`encode`], from JSON of `CMsgHeroBuild` as [`decode_json`] writes it.
pub fn encode_json(json: &str) -> Result<String, String> {
    let build: CMsgHeroBuild =
        serde_json::from_str(json).map_err(|e| format!("not a hero build: {e}"))?;
    Ok(encode(&build))
}
