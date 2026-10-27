#[cfg(feature = "varint")]
use dungers_varint::{CONTINUE_BIT, PAYLOAD_BITS, zigzag_encode64};

use crate::{BitError, bit_write_mask, extra_mask};

pub struct BitWriter<'a> {
    data_bits: usize,
    /// written in little-endian 64-bit blocks; a trailing partial block can't be written to.
    data: &'a mut [u8],
    cur_bit: usize,
}

impl<'a> BitWriter<'a> {
    pub const fn new(buf: &'a mut [u8]) -> Self {
        Self {
            data_bits: buf.len() << 3,
            data: buf,
            cur_bit: 0,
        }
    }

    /// returns the 64-bit block at `idx`.
    fn block_mut(&mut self, idx: usize) -> Result<&mut [u8; 8], BitError> {
        self.data
            .as_chunks_mut::<8>()
            .0
            .get_mut(idx)
            .ok_or(BitError::Overflow)
    }

    #[must_use]
    pub const fn num_bits_left(&self) -> usize {
        // `cur_bit` never moves past `data_bits`.
        self.data_bits.saturating_sub(self.cur_bit)
    }

    #[must_use]
    pub const fn num_bytes_left(&self) -> usize {
        self.num_bits_left() >> 3
    }

    #[must_use]
    pub const fn num_bits_written(&self) -> usize {
        self.cur_bit
    }

    #[must_use]
    pub const fn num_bytes_written(&self) -> usize {
        self.cur_bit.div_ceil(8)
    }

    /// seek to a specific bit.
    pub const fn seek(&mut self, bit: usize) -> Result<(), BitError> {
        if bit > self.data_bits {
            return Err(BitError::Overflow);
        }
        self.cur_bit = bit;
        Ok(())
    }

    /// seek to an offset from the current position.
    pub fn seek_relative(&mut self, bit_delta: isize) -> Result<usize, BitError> {
        let bit = isize::try_from(self.cur_bit)?
            .checked_add(bit_delta)
            .ok_or(BitError::Overflow)?;
        self.seek(bit.try_into()?)?;
        Ok(self.cur_bit)
    }

    pub fn write_ubit64(&mut self, data: u64, n: usize) -> Result<(), BitError> {
        // make sure that the requested number of bits to write is in bounds of u64.
        if n > 64 || n > self.num_bits_left() {
            return Err(BitError::Overflow);
        }

        // erase bits at n and higher positions
        let data = data & extra_mask(n);

        let block1_idx = self.cur_bit >> 6;
        let bit_offset = self.cur_bit & 63;

        let block1 = self.block_mut(block1_idx)?;
        let mut value = u64::from_le_bytes(*block1);
        value &= bit_write_mask(bit_offset, n);
        value |= data << bit_offset;
        *block1 = value.to_le_bytes();

        // did it span a block? (`bit_offset` < 64)
        let bits_written = 64_usize.saturating_sub(bit_offset);
        if bits_written < n {
            let data = data >> bits_written;
            let n = n.saturating_sub(bits_written);

            let block2 = self.block_mut(block1_idx.saturating_add(1))?;
            let mut value = u64::from_le_bytes(*block2);
            value &= bit_write_mask(0, n);
            value |= data;
            *block2 = value.to_le_bytes();
        }

        self.cur_bit = self.cur_bit.saturating_add(n);

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
