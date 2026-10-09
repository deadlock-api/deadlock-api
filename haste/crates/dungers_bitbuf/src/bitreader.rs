#[cfg(feature = "varint")]
use dungers_varint::{
    CONTINUE_BIT, PAYLOAD_BITS, max_varint_size, zigzag_decode32, zigzag_decode64,
};

use crate::{BitError, EXTRA_MASKS};

// NOTE(blukai): introduction of "caching" didn't yeild any performance inprovements, in fact quite
// the opposite happened. numbers were degraded.

pub struct BitReader<'a> {
    data: &'a [u8],
    num_bits: usize,
    cur_bit: usize,
}

impl<'a> BitReader<'a> {
    #[must_use]
    #[inline]
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            data,
            num_bits: data.len() << 3,
            cur_bit: 0,
        }
    }

    /// loads 8 little-endian bytes starting at `byte_idx`. bytes past the end of the buffer read
    /// as zero, so a load near the tail never goes out of bounds.
    #[inline]
    fn load_u64_le(&self, byte_idx: usize) -> u64 {
        let rest = self.data.get(byte_idx..).unwrap_or_default();
        if let Some(chunk) = rest.first_chunk::<8>() {
            u64::from_le_bytes(*chunk)
        } else {
            let mut buf = [0u8; 8];
            buf[..rest.len()].copy_from_slice(rest);
            u64::from_le_bytes(buf)
        }
    }

    #[must_use]
    #[inline]
    pub fn num_bits_left(&self) -> usize {
        self.num_bits - self.cur_bit
    }

    #[must_use]
    #[inline]
    pub fn num_bytes_left(&self) -> usize {
        self.num_bits_left() >> 3
    }

    #[must_use]
    #[inline]
    pub fn num_bits_read(&self) -> usize {
        self.cur_bit
    }

    #[must_use]
    #[inline]
    pub fn num_bytes_read(&self) -> usize {
        (self.cur_bit + 7) >> 3
    }

    /// seek to a specific bit.
    #[inline]
    pub fn seek(&mut self, bit: usize) -> Result<(), BitError> {
        if bit > self.num_bits {
            return Err(BitError::Overflow);
        }
        self.cur_bit = bit;
        Ok(())
    }

    /// seek to an offset from the current position.
    #[inline]
    pub fn seek_relative(&mut self, bit_delta: isize) -> Result<usize, BitError> {
        let bit = isize::try_from(self.cur_bit)? + bit_delta;
        self.seek(bit.try_into()?)?;
        Ok(self.cur_bit)
    }

    /// advances the reader by `num_bits`. returns [`BitError::Overflow`] (without moving) if fewer
    /// than `num_bits` bits are left.
    #[inline]
    pub fn skip(&mut self, num_bits: usize) -> Result<(), BitError> {
        if self.num_bits_left() < num_bits {
            return Err(BitError::Overflow);
        }
        self.cur_bit += num_bits;
        Ok(())
    }

    /// returns the next `num_bits` without consuming them. bits past the end of the buffer read as
    /// zero, so callers must check [`Self::num_bits_left`] (or let a following [`Self::skip`]
    /// fail) before trusting more bits than are left.
    ///
    /// a single load yields at least 57 bits; bits beyond that (`num_bits` > 57) may read as zero.
    #[must_use]
    #[inline]
    pub fn peek_ubit64_zero_extended(&self, num_bits: usize) -> u64 {
        debug_assert!(num_bits <= 57, "a single load only yields 57 usable bits");
        (self.load_u64_le(self.cur_bit >> 3) >> (self.cur_bit & 7)) & EXTRA_MASKS[num_bits.min(64)]
    }

    /// `read_ubit64` reads the specified number of bits into a `u64`. the function can read up to a
    /// maximum of 64 bits at a time. if the `num_bits` exceeds the number of remaining bits, the
    /// function returns an [`BitError::Overflow`] error.
    #[inline]
    pub fn read_ubit64(&mut self, num_bits: usize) -> Result<u64, BitError> {
        if num_bits > 64 || self.num_bits_left() < num_bits {
            return Err(BitError::Overflow);
        }

        let byte_idx = self.cur_bit >> 3;
        let shift = self.cur_bit & 7;

        // a single unaligned load yields at least 57 (64 - 7) usable bits.
        let mut ret = self.load_u64_le(byte_idx) >> shift;
        if num_bits + shift > 64 {
            // the remaining (at most 7) bits live in the 9th byte, which exists because of the
            // bounds check above.
            let next = self.data.get(byte_idx + 8).copied().unwrap_or_default();
            ret |= u64::from(next) << (64 - shift);
        }

        self.cur_bit += num_bits;
        Ok(ret & EXTRA_MASKS[num_bits])
    }

    #[inline]
    pub fn read_bool(&mut self) -> Result<bool, BitError> {
        let Some(&byte) = self.data.get(self.cur_bit >> 3) else {
            return Err(BitError::Overflow);
        };
        let one_bit = (byte >> (self.cur_bit & 7)) & 1;
        self.cur_bit += 1;
        Ok(one_bit == 1)
    }

    #[inline]
    pub fn read_byte(&mut self) -> Result<u8, BitError> {
        self.read_ubit64(8)
            .and_then(|b| b.try_into().map_err(BitError::TryFromIntError))
    }

    #[inline]
    pub fn read_bits(&mut self, buf: &mut [u8], num_bits: usize) -> Result<(), BitError> {
        if buf.len() << 3 < num_bits || self.num_bits_left() < num_bits {
            return Err(BitError::Overflow);
        }

        let start = self.cur_bit >> 3;
        let shift = self.cur_bit & 7;
        let num_bytes = num_bits >> 3;
        let dst = &mut buf[..num_bytes];

        if shift == 0 {
            // byte-aligned: a plain copy.
            let src = self
                .data
                .get(start..start + num_bytes)
                .ok_or(BitError::Overflow)?;
            dst.copy_from_slice(src);
        } else if num_bytes > 0 {
            // unaligned: every output byte is stitched together from two adjacent input bytes.
            // the last whole output byte ends at bit `cur_bit + 8 * num_bytes - 1`, which lives in
            // byte `start + num_bytes` (shift > 0), so `num_bytes + 1` input bytes are needed; the
            // bounds check above guarantees they exist.
            let src = self
                .data
                .get(start..=start + num_bytes)
                .ok_or(BitError::Overflow)?;
            for ((d, &lo), &hi) in dst.iter_mut().zip(src).zip(&src[1..]) {
                *d = (lo >> shift) | (hi << (8 - shift));
            }
        }
        self.cur_bit += num_bytes << 3;

        let rem_bits = num_bits & 7;
        if rem_bits > 0 {
            buf[num_bytes] = self.read_ubit64(rem_bits)?.try_into()?;
        }

        Ok(())
    }

    #[inline]
    pub fn read_bytes(&mut self, buf: &mut [u8]) -> Result<(), BitError> {
        self.read_bits(buf, buf.len() << 3)
    }

    #[cfg(feature = "varint")]
    #[inline]
    pub fn read_uvarint<T>(&mut self) -> Result<T, BitError>
    where
        T: From<u8> + core::ops::BitOrAssign + core::ops::Shl<usize, Output = T>,
    {
        // fast path: a single load yields at least 57 bits, i.e. 7 whole bytes; most varints are
        // shorter than that and are decoded without a bounds-checked read per byte.
        const FAST_BYTES: usize = 7;
        let bytes = (self.load_u64_le(self.cur_bit >> 3) >> (self.cur_bit & 7)).to_le_bytes();
        let mut value = T::from(0);
        for (count, &byte) in bytes
            .iter()
            .enumerate()
            .take(max_varint_size::<T>().min(FAST_BYTES))
        {
            value |= T::from(byte & PAYLOAD_BITS) << (count * 7);
            if (byte & CONTINUE_BIT) == 0 {
                // bytes past the end of the buffer load as zero (which would end the varint), so
                // only accept it if all of its bytes are actually there.
                let num_bits = (count + 1) << 3;
                if num_bits > self.num_bits_left() {
                    return Err(BitError::Overflow);
                }
                self.cur_bit += num_bits;
                return Ok(value);
            }
        }

        // slow path: longer (or malformed) varints are read byte by byte.
        let byte = self.read_byte()?;
        if (byte & CONTINUE_BIT) == 0 {
            return Ok(T::from(byte));
        }

        let mut value = T::from(byte & 0x7f);
        for count in 1..max_varint_size::<T>() {
            let byte = self.read_byte()?;
            value |= (T::from(byte & PAYLOAD_BITS)) << (count * 7);
            if (byte & CONTINUE_BIT) == 0 {
                return Ok(value);
            }
        }

        Err(BitError::MalformedVarint)
    }

    #[cfg(feature = "varint")]
    #[inline]
    pub fn read_varint64(&mut self) -> Result<i64, BitError> {
        self.read_uvarint().map(zigzag_decode64)
    }

    #[cfg(feature = "varint")]
    #[inline]
    pub fn read_uvarint32(&mut self) -> Result<u32, BitError> {
        self.read_uvarint()
    }

    #[cfg(feature = "varint")]
    #[inline]
    pub fn read_varint32(&mut self) -> Result<i32, BitError> {
        self.read_uvarint32().map(zigzag_decode32)
    }
}
