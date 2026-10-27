#![forbid(unsafe_code)]
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

use std::io;

pub const CONTINUE_BIT: u8 = 0x80;
pub const PAYLOAD_BITS: u8 = 0x7f;

#[derive(Debug, thiserror::Error)]
pub enum VarintError {
    #[error(transparent)]
    IoError(#[from] io::Error),
    #[error("malformed varint")]
    MalformedVarint,
}

// ZigZag Transform:  Encodes signed integers so that they can be effectively
// used with varint encoding.
//
// varint operates on unsigned integers, encoding smaller numbers into fewer
// bytes.  If you try to use it on a signed integer, it will treat this number
// as a very large unsigned integer, which means that even small signed numbers
// like -1 will take the maximum number of bytes (10) to encode.  ZigZagEncode()
// maps signed integers to unsigned in such a way that those with a small
// absolute value will have smaller encoded values, making them appropriate for
// encoding using varint.
//
//       int32 ->     uint32
// -------------------------
//           0 ->          0
//          -1 ->          1
//           1 ->          2
//          -2 ->          3
//         ... ->        ...
//  2147483647 -> 4294967294 -2147483648 -> 4294967295
//
//        >> encode >>
//        << decode <<
#[must_use]
#[inline]
pub const fn zigzag_encode64(n: i64) -> u64 {
    ((n << 1) ^ (n >> 63)).cast_unsigned()
}
#[must_use]
#[inline]
pub const fn zigzag_decode64(n: u64) -> i64 {
    (n >> 1).cast_signed() ^ (n & 1).cast_signed().wrapping_neg()
}

#[must_use]
#[inline]
pub const fn zigzag_encode32(n: i32) -> u32 {
    ((n << 1) ^ (n >> 31)).cast_unsigned()
}

#[must_use]
#[inline]
pub const fn zigzag_decode32(n: u32) -> i32 {
    (n >> 1).cast_signed() ^ (n & 1).cast_signed().wrapping_neg()
}

// Each byte in the varint has a continuation bit that indicates if the byte
// that follows it is part of the varint. This is the most significant bit (MSB)
// of the byte. The lower 7 bits are a payload; the resulting integer is built
// by appending together the 7-bit payloads of its constituent bytes.
// This allows variable size numbers to be stored with tolerable
// efficiency. Numbers sizes that can be stored for various numbers of
// encoded bits are:
//  8-bits: 0-127
// 16-bits: 128-16383
// 24-bits: 16384-2097151
// 32-bits: 2097152-268435455
// 40-bits: 268435456-0xFFFFFFFF

/// returns the max size (in bytes) of varint encoded number for `T`, assuming `T` is an integer
/// type.
#[must_use]
#[inline]
pub const fn max_varint_size<T>() -> usize {
    // The longest varint encoding for an integer uses 7 bits per byte.
    size_of::<T>().saturating_mul(8).div_ceil(7)
}

#[inline]
pub fn write_uvarint64<W: io::Write>(mut w: W, mut value: u64) -> Result<usize, VarintError> {
    let mut buf = [0u8; max_varint_size::<u64>()];
    let mut len = None;

    // a u64 always fits into `buf`, so the loop always sets `len`.
    for (count, slot) in (1_usize..).zip(&mut buf) {
        let [low, ..] = value.to_le_bytes();
        if value < u64::from(CONTINUE_BIT) {
            *slot = low;
            len = Some(count);
            break;
        }

        *slot = (low & PAYLOAD_BITS) | CONTINUE_BIT;
        value >>= 7;
    }

    let encoded = len
        .and_then(|len| buf.get(..len))
        .ok_or(VarintError::MalformedVarint)?;
    w.write_all(encoded)?;
    Ok(encoded.len())
}

#[inline]
pub fn write_varint64<W: io::Write>(w: W, value: i64) -> Result<usize, VarintError> {
    write_uvarint64(w, zigzag_encode64(value))
}

/// unsigned integer types that varints can be decoded into.
pub trait VarintInt: From<u8> + core::ops::BitOrAssign {
    /// shifts left, dropping bits shifted past the type's width. `shift` is always below the
    /// type's bit width (see [`max_varint_size`]).
    #[must_use]
    fn wrapping_shl(self, shift: u32) -> Self;
}

impl VarintInt for u32 {
    #[inline]
    fn wrapping_shl(self, shift: u32) -> Self {
        Self::wrapping_shl(self, shift)
    }
}

impl VarintInt for u64 {
    #[inline]
    fn wrapping_shl(self, shift: u32) -> Self {
        Self::wrapping_shl(self, shift)
    }
}

#[inline]
fn read_uvarint<R: io::Read, T: VarintInt>(rdr: &mut R) -> Result<(T, usize), VarintError> {
    let mut buf = [0u8; 1];

    // NOTE: small values are more common then large ones, this is a performance win.
    rdr.read_exact(&mut buf)?;
    let [byte] = buf;
    if (byte & CONTINUE_BIT) == 0 {
        return Ok((T::from(byte), 1));
    }

    let mut value = T::from(byte & PAYLOAD_BITS);
    // `len` is the number of bytes read including this one, `shift` the payload offset.
    for (len, shift) in (2..=max_varint_size::<T>()).zip((7_u32..).step_by(7)) {
        rdr.read_exact(&mut buf)?;
        let [byte] = buf;
        value |= T::from(byte & PAYLOAD_BITS).wrapping_shl(shift);
        if (byte & CONTINUE_BIT) == 0 {
            return Ok((value, len));
        }
    }

    Err(VarintError::MalformedVarint)
}

#[inline]
pub fn read_uvarint64<R: io::Read>(rdr: &mut R) -> Result<(u64, usize), VarintError> {
    read_uvarint(rdr)
}

#[inline]
pub fn read_varint64<R: io::Read>(rdr: &mut R) -> Result<(i64, usize), VarintError> {
    read_uvarint64(rdr).map(|(value, n)| (zigzag_decode64(value), n))
}

#[inline]
pub fn read_uvarint32<R: io::Read>(rdr: &mut R) -> Result<(u32, usize), VarintError> {
    read_uvarint(rdr)
}

#[inline]
pub fn read_varint32<R: io::Read>(rdr: &mut R) -> Result<(i32, usize), VarintError> {
    read_uvarint32(rdr).map(|(value, n)| (zigzag_decode32(value), n))
}
