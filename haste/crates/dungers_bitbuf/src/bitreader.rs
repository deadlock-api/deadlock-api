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

        // byte-aligned fast path: a plain copy.
        if self.cur_bit.is_multiple_of(8) {
            let start = self.cur_bit >> 3;
            let num_bytes = num_bits >> 3;
            let src = self
                .data
                .get(start..start + num_bytes)
                .ok_or(BitError::Overflow)?;
            buf[..num_bytes].copy_from_slice(src);
            self.cur_bit += num_bytes << 3;
            let rem_bits = num_bits & 7;
            if rem_bits > 0 {
                buf[num_bytes] = self.read_ubit64(rem_bits)?.try_into()?;
            }
            return Ok(());
        }

        let mut bits_left = num_bits;
        let mut bytes_written = 0;

        while bits_left >= 64 {
            let value = self.read_ubit64(64)?;
            let bytes = value.to_le_bytes();

            let dest_range = bytes_written..bytes_written + 8;
            buf[dest_range].copy_from_slice(&bytes);

            bytes_written += 8;
            bits_left -= 64;
        }

        while bits_left >= 8 {
            buf[bytes_written] = self.read_ubit64(8)?.try_into()?;
            bytes_written += 1;
            bits_left -= 8;
        }

        if bits_left > 0 {
            buf[bytes_written] = self.read_ubit64(bits_left)?.try_into()?;
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
