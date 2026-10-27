//! Deadlock's hero build codes: the text the game copies when a player copies a build, and reads
//! back when one is pasted. A code is the base64 of a zstd frame holding a `CMsgHeroBuild`
//! protobuf.
//!
//! [`decode`] and [`encode`] work on the protobuf type of `valveprotos`; on `wasm32` the crate
//! exports them to the website as `decode` / `encode` over JSON of the same type (see `wasm-abi`).

use std::fmt;
use std::io::Read;

use base64::Engine;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::{DecodePaddingMode, general_purpose};
use prost::Message;
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

#[derive(Debug)]
pub enum Error {
    Base64(base64::DecodeError),
    Zstd(String),
    TooLarge,
    Protobuf(prost::DecodeError),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Base64(e) => write!(f, "not a build code (base64: {e})"),
            Self::Zstd(e) => write!(f, "not a build code (zstd: {e})"),
            Self::TooLarge => write!(
                f,
                "not a build code (larger than {MAX_DECODED_BYTES} bytes)"
            ),
            Self::Protobuf(e) => write!(f, "not a build code (protobuf: {e})"),
        }
    }
}

impl std::error::Error for Error {}

/// Reads a build code as copied in game. Whitespace anywhere in it (a wrapped paste) is ignored.
pub fn decode(code: &str) -> Result<CMsgHeroBuild, Error> {
    let compact: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    let compressed = BASE64.decode(compact).map_err(Error::Base64)?;
    let decoder =
        StreamingDecoder::new(compressed.as_slice()).map_err(|e| Error::Zstd(e.to_string()))?;
    let mut bytes = Vec::new();
    decoder
        .take(MAX_DECODED_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| Error::Zstd(e.to_string()))?;
    if bytes.len() as u64 > MAX_DECODED_BYTES {
        return Err(Error::TooLarge);
    }
    CMsgHeroBuild::decode(bytes.as_slice()).map_err(Error::Protobuf)
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
    let descriptor = frame[DESCRIPTOR];
    let has_size = descriptor >> 6 != 0 || descriptor & 0b0010_0000 != 0;
    if has_size {
        return frame;
    }
    let window_bytes = 1;
    let dictionary_bytes = [0, 1, 2, 4][usize::from(descriptor & 0b11)];
    // Flag 1 stores the size less 256 in two bytes, flag 2 four bytes, flag 3 eight.
    let (flag, field) = if (256..=65_791).contains(&size) {
        (1, ((size - 256) as u16).to_le_bytes().to_vec())
    } else if let Ok(size) = u32::try_from(size) {
        (2, size.to_le_bytes().to_vec())
    } else {
        (3, size.to_le_bytes().to_vec())
    };
    frame[DESCRIPTOR] = descriptor | (flag << 6);
    let at = DESCRIPTOR + 1 + window_bytes + dictionary_bytes;
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
