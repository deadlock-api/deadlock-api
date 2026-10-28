// public/bitvec.h
// static int bitsForBitnum[]
#[must_use]
#[inline]
pub const fn get_bit_for_bit_num(bit_num: usize) -> u64 {
    1 << (bit_num & 63)
}

// tier1/bitbuf.cpp
// uint32 g_ExtraMasks[32];
//
/// mask with the low `num_bits` bits set (all bits for `num_bits` >= 64).
#[must_use]
#[inline]
pub(crate) const fn extra_mask(num_bits: usize) -> u64 {
    if num_bits >= 64 {
        u64::MAX
    } else {
        !(u64::MAX << num_bits)
    }
}

// tier1/bitbuf.cpp
// uint32 g_BitWriteMasks[32][33];
//
/// mask that keeps every bit outside of `bits_left` bits starting at `start_bit`.
#[must_use]
#[inline]
pub(crate) const fn bit_write_mask(start_bit: usize, bits_left: usize) -> u64 {
    extra_mask(start_bit) | !extra_mask(start_bit.saturating_add(bits_left))
}
