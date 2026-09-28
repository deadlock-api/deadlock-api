// public/bitvec.h
// static int bitsForBitnum[]
pub(crate) const BITS_FOR_BIT_NUM: [u64; 64] = {
    let mut bits_for_bit_num = [0; 64];
    let mut i: usize = 0;
    while i < 64 {
        bits_for_bit_num[i] = 1 << i;
        i += 1;
    }
    bits_for_bit_num
};

#[must_use]
pub const fn get_bit_for_bit_num(bit_num: usize) -> u64 {
    BITS_FOR_BIT_NUM[bit_num & 63]
}

// tier1/bitbuf.cpp
// uint32 g_BitWriteMasks[32][33];
pub(crate) static BIT_WRITE_MASKS: [[u64; 65]; 64] = {
    let mut bit_write_masks = [[0; 65]; 64];
    let mut start_bit = 0;
    while start_bit < 64 {
        let mut bits_left = 0;
        while bits_left < 65 {
            let end_bit = start_bit + bits_left;
            bit_write_masks[start_bit][bits_left] = get_bit_for_bit_num(start_bit) - 1;
            if end_bit < 64 {
                bit_write_masks[start_bit][bits_left] |= !(get_bit_for_bit_num(end_bit) - 1);
            }
            bits_left += 1;
        }
        start_bit += 1;
    }
    bit_write_masks
};

// tier1/bitbuf.cpp
// uint32 g_ExtraMasks[32];
pub(crate) const EXTRA_MASKS: [u64; 65] = {
    let mut extra_masks = [0; 65];
    let mut mask_bit = 0;
    while mask_bit < 65 {
        extra_masks[mask_bit] = if mask_bit == 64 {
            u64::MAX
        } else {
            get_bit_for_bit_num(mask_bit) - 1
        };
        mask_bit += 1;
    }
    extra_masks
};
