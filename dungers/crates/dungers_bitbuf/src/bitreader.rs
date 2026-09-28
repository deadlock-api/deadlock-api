#[cfg(feature = "varint")]
use dungers_varint::{
    CONTINUE_BIT, PAYLOAD_BITS, max_varint_size, zigzag_decode32, zigzag_decode64,
};

use crate::{BitError, EXTRA_MASKS};

// NOTE(blukai): introduction of "caching" didn't yeild any performance inprovements, in fact quite
// the opposite happened. numbers were degraded.

pub struct BitReader<'a> {
    num_bits: usize,
    data: &'a [u64],
    cur_bit: usize,
}

impl<'a> BitReader<'a> {
    #[must_use]
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            num_bits: data.len() << 3,
            #[allow(unsafe_code)]
            data: unsafe {
                // SAFETY: it is okay to transmute u8s into u64s here, even if slice of slice does
                // not contain enough (8 / size_of::<u64>()).
                //
                // that is because all "safe" methods carefully keep track of where the reading is
                // taking place and any out of bound read will result in an error.
                //
                // BUT! "unsafe" `unchecked` methods may allow out of bounds reads - that is ub. in
                // debug builds assertions will yell at you loudly if something is not right, but
                // those assertions will not be present in release builds.
                std::mem::transmute::<&[u8], &[u64]>(data)
            },
            cur_bit: 0,
        }
    }

    #[must_use]
    pub fn num_bits_left(&self) -> usize {
        self.num_bits - self.cur_bit
    }

    #[must_use]
    pub fn num_bytes_left(&self) -> usize {
        self.num_bits_left() >> 3
    }

    #[must_use]
    pub fn num_bits_read(&self) -> usize {
        self.cur_bit
    }

    #[must_use]
    pub fn num_bytes_read(&self) -> usize {
        (self.cur_bit + 7) >> 3
    }

    /// seek to a specific bit.
    pub fn seek(&mut self, bit: usize) -> Result<(), BitError> {
        if bit > self.num_bits {
            return Err(BitError::Overflow);
        }
        self.cur_bit = bit;
        Ok(())
    }

    /// seek to an offset from the current position.
    pub fn seek_relative(&mut self, bit_delta: isize) -> Result<usize, BitError> {
        let bit = isize::try_from(self.cur_bit)? + bit_delta;
        self.seek(bit.try_into()?)?;
        Ok(self.cur_bit)
    }

    /// `read_ubit64` reads the specified number of bits into a `u64`. the function can read up to a
    /// maximum of 64 bits at a time. if the `num_bits` exceeds the number of remaining bits, the
    /// function returns an [`Error::Overflow`] error.
    pub fn read_ubit64(&mut self, num_bits: usize) -> Result<u64, BitError> {
        if num_bits > 64 || self.num_bits_left() < num_bits {
            return Err(BitError::Overflow);
        }

        let block1_idx = self.cur_bit >> 6;

        let mut block1 = *self.data.get(block1_idx).ok_or(BitError::Overflow)?;
        // get the bits we're interested in
        block1 >>= self.cur_bit & 63;

        self.cur_bit += num_bits;
        let mut ret = block1;

        // does it span this block?
        if (self.cur_bit - 1) >> 6 == block1_idx {
            ret &= EXTRA_MASKS[num_bits];
        } else {
            let extra_bits = self.cur_bit & 63;

            let mut block2 = *self.data.get(block1_idx + 1).ok_or(BitError::Overflow)?;
            block2 &= EXTRA_MASKS[extra_bits];

            // no need to mask since we hit the end of the block. shift the second block's part
            // into the high bits.
            ret |= block2 << (num_bits - extra_bits);
        }

        Ok(ret)
    }

    pub fn read_bool(&mut self) -> Result<bool, BitError> {
        if self.num_bits_left() < 1 {
            return Err(BitError::Overflow);
        }

        let block1 = *self.data.get(self.cur_bit >> 6).ok_or(BitError::Overflow)?;
        let one_bit = block1 >> (self.cur_bit & 63) & 1;
        self.cur_bit += 1;
        Ok(one_bit == 1)
    }

    pub fn read_byte(&mut self) -> Result<u8, BitError> {
        self.read_ubit64(8)
            .and_then(|b| b.try_into().map_err(BitError::TryFromIntError))
    }

    pub fn read_bits(&mut self, buf: &mut [u8], num_bits: usize) -> Result<(), BitError> {
        if buf.len() << 3 < num_bits || self.num_bits_left() < num_bits {
            return Err(BitError::Overflow);
        }

        let mut bits_left = num_bits;
        let mut bytes_written = 0;

        while bits_left >= 64 {
            let value = self.read_ubit64(64)?;
            let bytes = value.to_ne_bytes();

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

    pub fn read_bytes(&mut self, buf: &mut [u8]) -> Result<(), BitError> {
        self.read_bits(buf, buf.len() << 3)
    }

    /// this can save your ass when you're using `_unchecked` methods. once you're done reading
    /// from buf call this to see if any bits were read from kyokai no kanata.
    ///
    /// returns [`Error::Overflow`] if overflowed (which means you are skrewed).
    ///
    /// i figured that returning result would be more convenient than a bool because it can be
    /// questionmarked; plus, in some cases, this would eliminate a need of coming up with a custom
    /// error.
    pub fn is_overflowed(&self) -> Result<(), BitError> {
        if self.cur_bit > self.num_bits {
            Err(BitError::Overflow)
        } else {
            Ok(())
        }
    }

    #[cfg(feature = "varint")]
    pub fn read_uvarint<T>(&mut self) -> Result<T, BitError>
    where
        T: From<u8> + core::ops::BitOrAssign + core::ops::Shl<usize, Output = T>,
    {
        let byte = self.read_byte()?;
        if (byte & CONTINUE_BIT) == 0 {
            return Ok(T::from(byte));
        }

        let mut value = T::from(byte & 0x7f);
        for count in 1..=max_varint_size::<T>() {
            let byte = self.read_byte()?;
            value |= (T::from(byte & PAYLOAD_BITS)) << (count * 7);
            if (byte & CONTINUE_BIT) == 0 {
                return Ok(value);
            }
        }

        Err(BitError::MalformedVarint)
    }

    #[cfg(feature = "varint")]
    pub fn read_varint64(&mut self) -> Result<i64, BitError> {
        self.read_uvarint().map(zigzag_decode64)
    }

    #[cfg(feature = "varint")]
    pub fn read_uvarint32(&mut self) -> Result<u32, BitError> {
        self.read_uvarint()
    }

    #[cfg(feature = "varint")]
    pub fn read_varint32(&mut self) -> Result<i32, BitError> {
        self.read_uvarint32().map(zigzag_decode32)
    }
}
