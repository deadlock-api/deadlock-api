//! `DL.` crosshair share codes, as exported and imported by the game's crosshair settings.
//!
//! A code is `DL.` followed by base64 (with `.` and `_` in place of `+` and `/`) of:
//!
//! | bytes  | meaning                                              |
//! |--------|------------------------------------------------------|
//! | 0      | format version, always 1                             |
//! | 1      | flags, bit 0 set when the payload is zstd-compressed |
//! | 2..6   | little-endian CRC32 of the (decompressed) payload    |
//! | 6..    | payload                                              |
//!
//! The payload is a tree of `(tag, length, body)` records with varint tags and lengths. It holds a
//! record tagged 1 (a revision the game always writes as 6712) and a record tagged 2 listing the
//! settings. Every setting is a record tagged 2 holding a key record (the varint murmur2 hash of the
//! convar name without its `citadel_` prefix) and a value record (the value as a string).

use base64::Engine;
use base64::alphabet::Alphabet;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use prost::encoding::{decode_varint, encode_varint, encoded_len_varint};

use super::CrosshairError;
use super::settings::Settings;

pub(super) const PREFIX: &str = "DL.";
const VERSION: u8 = 1;
const FLAG_ZSTD: u8 = 1;
const HEADER_LEN: usize = 6;
const REVISION_TAG: u32 = 1;
const REVISION: u32 = 6712;
const SETTINGS_TAG: u32 = 2;
const KEY_TAG: u32 = 1;
const VALUE_TAG: u32 = 2;
/// Real codes decompress to well under 1 KiB; this only guards against decompression bombs.
const MAX_PAYLOAD_LEN: usize = 64 * 1024;

const ALPHABET: Alphabet =
    match Alphabet::new("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._") {
        Ok(alphabet) => alphabet,
        Err(_) => panic!("invalid crosshair code alphabet"),
    };

const BASE64: GeneralPurpose = GeneralPurpose::new(
    &ALPHABET,
    GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

/// Decodes a `DL.` code; the caller checks its length.
pub(super) fn decode(code: &str) -> Result<Settings, CrosshairError> {
    let payload = decode_payload(code)?;
    let mut settings = Settings::default();
    for group in Records::tagged(&payload, SETTINGS_TAG) {
        for entry in Records::tagged(group?, SETTINGS_TAG) {
            let mut fields = Records::new(entry?);
            let (Some(key), Some(value)) = (fields.next(), fields.next()) else {
                return Err(CrosshairError::Malformed);
            };
            let value = str::from_utf8(value?.1).map_err(|_| CrosshairError::Malformed)?;
            settings.apply(varint_value(key?.1), value);
        }
    }
    Ok(settings)
}

pub(crate) fn encode(settings: &Settings) -> String {
    let mut entries = Vec::new();
    let mut entry = Vec::new();
    for (key, value) in settings.entries() {
        entry.clear();
        write_varint_record(&mut entry, KEY_TAG, key);
        write_record(&mut entry, VALUE_TAG, value.as_bytes());
        write_record(&mut entries, SETTINGS_TAG, &entry);
    }
    let mut payload = Vec::new();
    write_varint_record(&mut payload, REVISION_TAG, REVISION);
    write_record(&mut payload, SETTINGS_TAG, &entries);

    // Like the game, only compress when that makes the code shorter.
    let checksum = crc32fast::hash(&payload).to_le_bytes();
    let (flags, body) = match zstd::bulk::compress(&payload, zstd::DEFAULT_COMPRESSION_LEVEL) {
        Ok(compressed) if compressed.len() < payload.len() => (FLAG_ZSTD, compressed),
        _ => (0, payload),
    };
    let mut raw = Vec::with_capacity(HEADER_LEN + body.len());
    raw.extend_from_slice(&[VERSION, flags]);
    raw.extend_from_slice(&checksum);
    raw.extend_from_slice(&body);
    format!("{PREFIX}{}", BASE64.encode(raw))
}

/// Strips the prefix, base64-decodes, decompresses and checksums the code, returning its payload.
fn decode_payload(code: &str) -> Result<Vec<u8>, CrosshairError> {
    let encoded = code
        .trim()
        .strip_prefix(PREFIX)
        .ok_or(CrosshairError::NotACode)?;
    let raw = BASE64.decode(encoded)?;
    let Some((&[version, flags, c0, c1, c2, c3], body)) = raw.split_first_chunk::<HEADER_LEN>()
    else {
        return Err(CrosshairError::Malformed);
    };
    if version != VERSION {
        return Err(CrosshairError::UnsupportedVersion(version));
    }
    let payload = if flags & FLAG_ZSTD == 0 {
        body.to_vec()
    } else {
        zstd::bulk::decompress(body, MAX_PAYLOAD_LEN).map_err(|_| CrosshairError::Decompress)?
    };
    if crc32fast::hash(&payload) != u32::from_le_bytes([c0, c1, c2, c3]) {
        return Err(CrosshairError::Checksum);
    }
    Ok(payload)
}

/// Reads a whole record body as one little-endian base-128 number, keeping the low 32 bits.
fn varint_value(bytes: &[u8]) -> u32 {
    bytes
        .iter()
        .rev()
        .fold(0, |acc, byte| acc << 7 | u32::from(byte & 0x7f))
}

fn write_record(out: &mut Vec<u8>, tag: u32, body: &[u8]) {
    encode_varint(tag.into(), out);
    encode_varint(body.len() as u64, out);
    out.extend_from_slice(body);
}

/// A record whose body is a single varint.
fn write_varint_record(out: &mut Vec<u8>, tag: u32, value: u32) {
    encode_varint(tag.into(), out);
    encode_varint(encoded_len_varint(value.into()) as u64, out);
    encode_varint(value.into(), out);
}

/// Iterator over the `(tag, body)` records laid out back to back in a buffer.
struct Records<'a> {
    buf: &'a [u8],
}

impl<'a> Records<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf }
    }

    /// Bodies of the records tagged `tag`.
    fn tagged(buf: &'a [u8], tag: u32) -> impl Iterator<Item = Result<&'a [u8], CrosshairError>> {
        Self::new(buf).filter_map(move |record| match record {
            Ok((t, body)) => (t == tag).then_some(Ok(body)),
            Err(e) => Some(Err(e)),
        })
    }

    fn read_varint(&mut self) -> Result<u32, CrosshairError> {
        decode_varint(&mut self.buf)
            .ok()
            .and_then(|value| u32::try_from(value).ok())
            .ok_or(CrosshairError::Malformed)
    }

    fn read_record(&mut self) -> Result<(u32, &'a [u8]), CrosshairError> {
        let tag = self.read_varint()?;
        let len = usize::try_from(self.read_varint()?).map_err(|_| CrosshairError::Malformed)?;
        let (body, rest) = self
            .buf
            .split_at_checked(len)
            .ok_or(CrosshairError::Malformed)?;
        self.buf = rest;
        Ok((tag, body))
    }
}

impl<'a> Iterator for Records<'a> {
    type Item = Result<(u32, &'a [u8]), CrosshairError>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.buf.is_empty() {
            return None;
        }
        let record = self.read_record();
        if record.is_err() {
            // Stop at the first error rather than resyncing on garbage.
            self.buf = &[];
        }
        Some(record)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::crosshair::fixtures::{RED_PIPS, TEAL_DOT};

    #[test]
    fn decodes_a_compressed_code() {
        assert_eq!(
            decode(TEAL_DOT).unwrap(),
            Settings {
                pip_opacity: 0.0,
                pip_outline_opacity: 0.0,
                dot_size: 6,
                dot_opacity: 1.0,
                color_r: 2,
                color_g: 255,
                color_b: 242,
                ..Settings::default()
            }
        );
    }

    #[test]
    fn decodes_an_uncompressed_partial_code() {
        assert_eq!(
            decode(RED_PIPS).unwrap(),
            Settings {
                pip_width: 3,
                pip_height: 10,
                pip_gap: 2,
                pip_opacity: 0.9,
                pip_outline_opacity: 1.0,
                dot_size: 2,
                color_r: 255,
                color_g: 40,
                color_b: 40,
                ..Settings::default()
            }
        );
    }

    #[test]
    fn encodes_the_payload_the_game_exports() {
        // The teal code lists every setting, so re-encoding it must reproduce its payload exactly.
        let settings = decode(TEAL_DOT).unwrap();
        let encoded = encode(&settings);
        assert_eq!(
            decode_payload(&encoded).unwrap(),
            decode_payload(TEAL_DOT).unwrap()
        );
        assert_eq!(decode(&encoded).unwrap(), settings);
    }

    #[test]
    fn rejects_bad_codes() {
        assert!(matches!(decode("AQDehwon"), Err(CrosshairError::NotACode)));
        assert!(matches!(decode("DL.!!!"), Err(CrosshairError::Base64(_))));
        assert!(matches!(decode("DL.AQDe"), Err(CrosshairError::Malformed)));
        assert!(matches!(
            decode(&format!("{PREFIX}{}", BASE64.encode([2, 0, 0, 0, 0, 0]))),
            Err(CrosshairError::UnsupportedVersion(2))
        ));
        let mut tampered = RED_PIPS.trim().to_owned();
        tampered.replace_range(20..21, "B");
        assert!(matches!(decode(&tampered), Err(CrosshairError::Checksum)));
    }

    #[test]
    fn rejects_truncated_records() {
        assert!(matches!(
            Records::new(&[2, 5, 1]).next(),
            Some(Err(CrosshairError::Malformed))
        ));
        assert!(matches!(
            Records::new(&[0xff, 0xff, 0xff, 0xff, 0xff, 0x01]).next(),
            Some(Err(CrosshairError::Malformed))
        ));
    }
}
