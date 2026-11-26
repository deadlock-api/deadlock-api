//! The sidecar (`.idx`) of a pack: a fixed-width little-endian header, one entry per file sorted
//! by `(match_id, kind)`, and a crc32 of everything before it.
//!
//! ```text
//! header  80 B  magic "DLMPIDX1" | version u16 | flags u16 | entries u32 | pack_id u64 | pack_len u64
//!               | pack_sha256 [32] | created_unix u64 | reserved [8]
//! entry   48 B  match_id u64 | offset u64 | length u32 | crc32 u32 | codec u8 | kind u8 | reserved [2]
//!               | md5 [16] (the source object's `ETag`) | reserved [4]
//! trailer  4 B  crc32 of header and entries
//! ```
//!
//! Files are stored in entry order with no gaps, so every offset is the sum of the lengths before
//! it and the lengths add up to the pack's size; [`decode_sidecar`] checks both.

use object_store::path::Path;

use crate::{Codec, Kind};

pub const MAGIC: [u8; 8] = *b"DLMPIDX1";
pub const VERSION: u16 = 1;
const HEADER_LEN: usize = 80;
const ENTRY_LEN: usize = 48;
const TRAILER_LEN: usize = 4;

/// The pack-level fields of a sidecar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackHeader {
    pub pack_id: u64,
    pub pack_len: u64,
    pub pack_sha256: [u8; 32],
    pub created_unix: u64,
}

/// One file of a pack.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub match_id: u64,
    pub kind: Kind,
    pub offset: u64,
    pub length: u32,
    pub crc32: u32,
    pub codec: Codec,
    /// md5 of the file, equal to the single-part `ETag` of the object it was packed from.
    pub md5: [u8; 16],
}

impl Entry {
    /// The byte range of the file in its pack, `None` if it overflows.
    #[must_use]
    pub fn range(&self) -> Option<core::ops::Range<u64>> {
        Some(self.offset..self.offset.checked_add(u64::from(self.length))?)
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FormatError {
    #[error("sidecar is truncated")]
    Truncated,
    #[error("not a pack sidecar (bad magic)")]
    BadMagic,
    #[error("unsupported sidecar version {0}")]
    UnsupportedVersion(u16),
    #[error("sidecar checksum mismatch")]
    Checksum,
    #[error("sidecar holds {actual} bytes, its header implies {expected}")]
    Length { expected: usize, actual: usize },
    #[error("entry {0} has an unknown kind or codec")]
    UnknownEnum(usize),
    #[error("entry {0} is out of order or duplicates the one before it")]
    Order(usize),
    #[error("entry {0} does not start where the previous one ends")]
    Gap(usize),
    #[error("entries add up to {actual} bytes, the header says {expected}")]
    PackLength { expected: u64, actual: u64 },
    #[error("too many entries")]
    TooMany,
}

/// Encodes a sidecar. The entries must already be sorted and contiguous (see [`crate::build_pack`]).
pub fn encode_sidecar(header: &PackHeader, entries: &[Entry]) -> Result<Vec<u8>, FormatError> {
    let count = u32::try_from(entries.len())
        .ok()
        .ok_or(FormatError::TooMany)?;
    let mut out = Vec::with_capacity(sidecar_len(entries.len()).ok_or(FormatError::TooMany)?);
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&VERSION.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&header.pack_id.to_le_bytes());
    out.extend_from_slice(&header.pack_len.to_le_bytes());
    out.extend_from_slice(&header.pack_sha256);
    out.extend_from_slice(&header.created_unix.to_le_bytes());
    out.extend_from_slice(&[0; 8]);
    for e in entries {
        out.extend_from_slice(&e.match_id.to_le_bytes());
        out.extend_from_slice(&e.offset.to_le_bytes());
        out.extend_from_slice(&e.length.to_le_bytes());
        out.extend_from_slice(&e.crc32.to_le_bytes());
        out.push(e.codec.as_u8());
        out.push(e.kind.as_u8());
        out.extend_from_slice(&[0; 2]);
        out.extend_from_slice(&e.md5);
        out.extend_from_slice(&[0; 4]);
    }
    let crc = crc32fast::hash(&out);
    out.extend_from_slice(&crc.to_le_bytes());
    Ok(out)
}

fn sidecar_len(entries: usize) -> Option<usize> {
    entries
        .checked_mul(ENTRY_LEN)?
        .checked_add(HEADER_LEN)?
        .checked_add(TRAILER_LEN)
}

/// Reads fixed-width fields off the front of a slice.
struct Fields<'a>(&'a [u8]);

impl<'a> Fields<'a> {
    fn take<const N: usize>(&mut self) -> Result<[u8; N], FormatError> {
        let (head, rest) = self.0.split_at_checked(N).ok_or(FormatError::Truncated)?;
        self.0 = rest;
        <[u8; N]>::try_from(head).ok().ok_or(FormatError::Truncated)
    }

    fn u8(&mut self) -> Result<u8, FormatError> {
        Ok(u8::from_le_bytes(self.take()?))
    }

    fn u16(&mut self) -> Result<u16, FormatError> {
        Ok(u16::from_le_bytes(self.take()?))
    }

    fn u32(&mut self) -> Result<u32, FormatError> {
        Ok(u32::from_le_bytes(self.take()?))
    }

    fn u64(&mut self) -> Result<u64, FormatError> {
        Ok(u64::from_le_bytes(self.take()?))
    }

    const fn rest(&self) -> &'a [u8] {
        self.0
    }
}

/// Decodes and validates a sidecar.
pub fn decode_sidecar(data: &[u8]) -> Result<(PackHeader, Vec<Entry>), FormatError> {
    let body_len = data
        .len()
        .checked_sub(TRAILER_LEN)
        .ok_or(FormatError::Truncated)?;
    let (body, trailer) = data
        .split_at_checked(body_len)
        .ok_or(FormatError::Truncated)?;
    let mut f = Fields(body);
    if f.take::<8>()? != MAGIC {
        return Err(FormatError::BadMagic);
    }
    let version = f.u16()?;
    if version != VERSION {
        return Err(FormatError::UnsupportedVersion(version));
    }
    let stored_crc = u32::from_le_bytes(
        <[u8; 4]>::try_from(trailer)
            .ok()
            .ok_or(FormatError::Truncated)?,
    );
    if crc32fast::hash(body) != stored_crc {
        return Err(FormatError::Checksum);
    }
    let _flags = f.u16()?;
    let count = usize::try_from(f.u32()?).ok().ok_or(FormatError::TooMany)?;
    let expected = sidecar_len(count).ok_or(FormatError::TooMany)?;
    if expected != data.len() {
        return Err(FormatError::Length {
            expected,
            actual: data.len(),
        });
    }
    let header = PackHeader {
        pack_id: f.u64()?,
        pack_len: f.u64()?,
        pack_sha256: f.take()?,
        created_unix: f.u64()?,
    };
    let _reserved: [u8; 8] = f.take()?;
    let mut entries = Vec::with_capacity(count);
    let mut next_offset = 0u64;
    for i in 0..count {
        let match_id = f.u64()?;
        let offset = f.u64()?;
        let length = f.u32()?;
        let crc32 = f.u32()?;
        let codec = Codec::from_u8(f.u8()?).ok_or(FormatError::UnknownEnum(i))?;
        let kind = Kind::from_u8(f.u8()?).ok_or(FormatError::UnknownEnum(i))?;
        let _reserved: [u8; 2] = f.take()?;
        let md5 = f.take()?;
        let _reserved: [u8; 4] = f.take()?;
        let entry = Entry {
            match_id,
            kind,
            offset,
            length,
            crc32,
            codec,
            md5,
        };
        if entries
            .last()
            .is_some_and(|prev: &Entry| (prev.match_id, prev.kind) >= (match_id, kind))
        {
            return Err(FormatError::Order(i));
        }
        if offset != next_offset {
            return Err(FormatError::Gap(i));
        }
        next_offset = entry.range().ok_or(FormatError::Gap(i))?.end;
        entries.push(entry);
    }
    if !f.rest().is_empty() {
        return Err(FormatError::Truncated);
    }
    if next_offset != header.pack_len {
        return Err(FormatError::PackLength {
            expected: header.pack_len,
            actual: next_offset,
        });
    }
    Ok((header, entries))
}

/// `{prefix}/{pack_id:010}.pack`
#[must_use]
pub fn pack_key(prefix: &str, pack_id: u64) -> Path {
    Path::from(format!("{prefix}/{pack_id:010}.pack"))
}

/// `{prefix}/{pack_id:010}.idx`
#[must_use]
pub fn sidecar_key(prefix: &str, pack_id: u64) -> Path {
    Path::from(format!("{prefix}/{pack_id:010}.idx"))
}

/// The pack id and whether the key is a sidecar (`true`) or a pack (`false`), for keys under
/// `prefix`.
#[must_use]
pub fn parse_pack_key(prefix: &str, key: &str) -> Option<(u64, bool)> {
    let name = key.strip_prefix(prefix)?.strip_prefix('/')?;
    let (id, is_sidecar) = if let Some(id) = name.strip_suffix(".idx") {
        (id, true)
    } else {
        (name.strip_suffix(".pack")?, false)
    };
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((id.parse().ok()?, is_sidecar))
}

/// Lower-case hex of `bytes`.
#[must_use]
pub fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len().saturating_mul(2));
    for b in bytes {
        for nibble in [b >> 4, b & 0x0f] {
            if let Some(d) = DIGITS.get(usize::from(nibble)) {
                out.push(char::from(*d));
            }
        }
    }
    out
}

/// The md5 of a single-part upload's `ETag` (quotes optional); `None` for multipart `ETag`s.
#[must_use]
pub fn parse_md5_etag(etag: &str) -> Option<[u8; 16]> {
    let etag = etag.trim_matches('"');
    if etag.len() != 32 {
        return None;
    }
    let mut out = [0u8; 16];
    for (i, byte) in out.iter_mut().enumerate() {
        let start = i.checked_mul(2)?;
        let pair = etag.get(start..start.checked_add(2)?)?;
        *byte = u8::from_str_radix(pair, 16).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(match_id: u64, kind: Kind, offset: u64, length: u32) -> Entry {
        Entry {
            match_id,
            kind,
            offset,
            length,
            crc32: 7,
            codec: Codec::Bzip2,
            md5: [3; 16],
        }
    }

    fn sample() -> (PackHeader, Vec<Entry>) {
        let entries = vec![
            entry(5, Kind::Salt, 0, 10),
            entry(5, Kind::Hltv, 10, 4),
            entry(9, Kind::FailedSalt, 14, 1),
        ];
        let header = PackHeader {
            pack_id: 42,
            pack_len: 15,
            pack_sha256: [9; 32],
            created_unix: 1_700_000_000,
        };
        (header, entries)
    }

    #[test]
    fn round_trips() {
        let (header, entries) = sample();
        let bytes = encode_sidecar(&header, &entries).unwrap();
        assert_eq!(bytes.len(), 80 + 3 * 48 + 4);
        assert_eq!(decode_sidecar(&bytes).unwrap(), (header, entries));
    }

    #[test]
    fn rejects_corruption() {
        let (header, entries) = sample();
        let bytes = encode_sidecar(&header, &entries).unwrap();
        let mut flipped = bytes.clone();
        flipped[100] ^= 1;
        assert_eq!(decode_sidecar(&flipped), Err(FormatError::Checksum));
        assert_eq!(
            decode_sidecar(&bytes[..bytes.len() - 1]),
            Err(FormatError::Checksum)
        );
        assert_eq!(decode_sidecar(&bytes[..3]), Err(FormatError::Truncated));
        let mut magic = bytes;
        magic[0] = b'X';
        assert_eq!(decode_sidecar(&magic), Err(FormatError::BadMagic));
    }

    #[test]
    fn rejects_gaps_order_and_length() {
        let (header, mut entries) = sample();
        entries[1].offset = 11;
        let bytes = encode_sidecar(&header, &entries).unwrap();
        assert_eq!(decode_sidecar(&bytes), Err(FormatError::Gap(1)));

        let (header, mut entries) = sample();
        entries.swap(0, 1);
        entries[0].offset = 0;
        entries[1].offset = 4;
        let bytes = encode_sidecar(&header, &entries).unwrap();
        assert_eq!(decode_sidecar(&bytes), Err(FormatError::Order(1)));

        let (mut header, entries) = sample();
        header.pack_len = 16;
        let bytes = encode_sidecar(&header, &entries).unwrap();
        assert_eq!(
            decode_sidecar(&bytes),
            Err(FormatError::PackLength {
                expected: 16,
                actual: 15
            })
        );
    }

    #[test]
    fn pack_keys() {
        assert_eq!(pack_key("packs/v1", 7).as_ref(), "packs/v1/0000000007.pack");
        assert_eq!(
            sidecar_key("packs/v1", 7).as_ref(),
            "packs/v1/0000000007.idx"
        );
        assert_eq!(
            parse_pack_key("packs/v1", "packs/v1/0000000007.idx"),
            Some((7, true))
        );
        assert_eq!(
            parse_pack_key("packs/v1", "packs/v1/0000000007.pack"),
            Some((7, false))
        );
        assert_eq!(parse_pack_key("packs/v1", "packs/v2/0000000007.pack"), None);
        assert_eq!(parse_pack_key("packs/v1", "packs/v1/x.pack"), None);
    }

    #[test]
    fn md5_etags() {
        let md5 = parse_md5_etag("\"0123456789abcdef0123456789ABCDEF\"").unwrap();
        assert_eq!(hex(&md5), "0123456789abcdef0123456789abcdef");
        assert_eq!(parse_md5_etag("1e7e82bea72f8e60581399a8cc1df785-2"), None);
        assert_eq!(parse_md5_etag("zz23456789abcdef0123456789abcdef"), None);
    }
}
