#[cfg(feature = "varint")]
use dungers_varint::{CONTINUE_BIT, PAYLOAD_BITS, zigzag_encode64};

use crate::{BIT_WRITE_MASKS, BitError, EXTRA_MASKS};

pub struct BitWriter<'a> {
    data_bits: usize,
    data: &'a mut [u64],
    cur_bit: usize,
}

impl<'a> BitWriter<'a> {
    pub fn new(buf: &'a mut [u8]) -> Self {
        Self {
            data_bits: buf.len() << 3,
            data: bytemuck::cast_slice_mut(buf),
            cur_bit: 0,
        }
    }

    #[must_use]
    pub fn num_bits_left(&self) -> usize {
        self.data_bits - self.cur_bit
    }

    #[must_use]
    pub fn num_bytes_left(&self) -> usize {
        self.num_bits_left() >> 3
    }

    #[must_use]
    pub fn num_bits_written(&self) -> usize {
        self.cur_bit
    }

    #[must_use]
    pub fn num_bytes_written(&self) -> usize {
        (self.cur_bit + 7) >> 3
    }

    /// seek to a specific bit.
    pub fn seek(&mut self, bit: usize) -> Result<(), BitError> {
        if bit > self.data_bits {
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

    pub fn write_ubit64(&mut self, data: u64, n: usize) -> Result<(), BitError> {
        // make sure that the requested number of bits to write is in bounds of u64.
        debug_assert!(n <= 64);

        if self.cur_bit + n > self.data_bits {
            return Err(BitError::Overflow);
        }

        // erase bits at n and higher positions
        let data = data & EXTRA_MASKS[n];

        let block1_idx = self.cur_bit >> 6;
        let bit_offset = self.cur_bit & 63;

        // SAFETY: assert and check above ensure that we'll not go out of bounds.

        let mut block1 = *self.data.get(block1_idx).ok_or(BitError::Overflow)?;
        block1 &= BIT_WRITE_MASKS[bit_offset][n];
        block1 |= data << bit_offset;
        *self.data.get_mut(block1_idx).ok_or(BitError::Overflow)? = block1;

        // did it span a block?
        let bits_written = 64 - bit_offset;
        if bits_written < n {
            let data = data >> bits_written;
            let n = n - bits_written;

            let block2_idx = block1_idx + 1;

            let mut block2 = *self.data.get(block2_idx).ok_or(BitError::Overflow)?;
            block2 &= BIT_WRITE_MASKS[0][n];
            block2 |= data;
            *self.data.get_mut(block2_idx).ok_or(BitError::Overflow)? = block2;
        }

        self.cur_bit += n;

        Ok(())
    }

    pub fn write_byte(&mut self, data: u8) -> Result<(), BitError> {
        self.write_ubit64(u64::from(data), 8)
    }

    // NOTE: ref impl for varints:
    // https://github.com/rust-lang/rust/blob/e5b3e68abf170556b9d56c6f9028318e53c9f06b/compiler/rustc_serialize/src/leb128.rs

    // TODO: varint funcs can be faster

    #[cfg(feature = "varint")]
    pub fn write_uvarint64(&mut self, mut value: u64) -> Result<(), BitError> {
        loop {
            if value < u64::from(CONTINUE_BIT) {
                self.write_byte(value.try_into()?)?;
                break;
            }

            self.write_byte(u8::try_from(
                (value & u64::from(PAYLOAD_BITS)) | u64::from(CONTINUE_BIT),
            )?)?;
            value >>= 7;
        }

        Ok(())
    }

    #[cfg(feature = "varint")]
    pub fn write_varint64(&mut self, data: i64) -> Result<(), BitError> {
        self.write_uvarint64(zigzag_encode64(data))
    }
}
