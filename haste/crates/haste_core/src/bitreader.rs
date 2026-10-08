use dungers::bitbuf;
use dungers::bitbuf::BitError;

// public/coordsize.h
//
// NOTE: since deadlock build 6712 servers send these values in
// `CSVCMsg_FlattenedSerializer.coord_size_params` (see
// [`crate::flattenedserializers::CoordSizeParams`]); the constants below are the engine defaults
// (and what older replays use).
pub(crate) const COORD_INTEGER_BITS: usize = 14;
pub(crate) const COORD_FRACTIONAL_BITS: usize = 5;
pub(crate) const COORD_INTEGER_BITS_MP: usize = 11;
pub(crate) const COORD_FRACTIONAL_BITS_MP: usize = 3;
pub(crate) const NORMAL_FRACTIONAL_BITS: usize = 11;
pub(crate) const ANGLE_BITS: usize = 20;

// BitRead is a port of valve's CBitRead(or/and old_bf_read) from valve's tier1 lib.
pub struct BitReader<'a> {
    inner: bitbuf::BitReader<'a>,
    did_check_overflow: bool,
}

/// rationale for using "unsafe" `_unchecked` methods of the underlying
/// [`dungers::bitbuf::BitReader`]:
///
/// what makes safe methods of [`dungers::bitbuf::BitReader`] safe is overflow checks.
///
/// bounds checking is not omitted, it is "deferred". custom [`Drop`] impl helps to ensure that it
/// is performed.
///
/// [`BitReader`]'s methods are called very frequently, there's absolutely no value in performing
/// bounds checking each time something is needed to be read because that is not going to help
/// detect corrupt data.
///
/// deferred bounds checking allows to eliminate a very significant amount of branches which
/// results in very noticable speed boost.
impl<'a> BitReader<'a> {
    #[must_use]
    #[inline]
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            inner: bitbuf::BitReader::new(data),
            did_check_overflow: false,
        }
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[must_use]
    #[inline]
    pub fn num_bits_left(&self) -> usize {
        self.inner.num_bits_left()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_ubit64(&mut self, num_bits: usize) -> Result<u64, BitError> {
        self.inner.read_ubit64(num_bits)
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_bool(&mut self) -> Result<bool, BitError> {
        self.inner.read_bool()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_byte(&mut self) -> Result<u8, BitError> {
        self.inner.read_byte()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_bits(&mut self, buf: &mut [u8], num_bits: usize) -> Result<(), BitError> {
        self.inner.read_bits(buf, num_bits)
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_bytes(&mut self, buf: &mut [u8]) -> Result<(), BitError> {
        self.inner.read_bytes(buf)
    }

    #[inline]
    pub fn is_overflowed(&mut self) -> Result<(), BitError> {
        self.did_check_overflow = true;
        self.inner.is_overflowed()
    }

    #[inline]
    pub fn skip_bits(&mut self, num_bits: usize) -> Result<(), BitError> {
        self.inner.seek_relative(num_bits as isize)?;
        Ok(())
    }

    #[must_use]
    #[inline]
    pub fn num_bits_read(&self) -> usize {
        self.inner.num_bits_read()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_uvarint32(&mut self) -> Result<u32, BitError> {
        self.inner.read_uvarint32()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_uvarint64(&mut self) -> Result<u64, BitError> {
        self.inner.read_uvarint()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_varint32(&mut self) -> Result<i32, BitError> {
        self.inner.read_varint32()
    }

    /// delegated from [`dungers::bitbuf::BitReader`].
    #[inline]
    pub fn read_varint64(&mut self) -> Result<i64, BitError> {
        self.inner.read_varint64()
    }

    // ubitvar is "valve's own variable-length integer encoding" (c) butterfly.
    //
    // valve's refs:
    // - [1] https://github.com/ValveSoftware/csgo-demoinfo/blob/049f8dbf49099d3cc544ec5061a7f7252cce7b82/demoinfogo/demofilebitbuf.cpp#L171
    // - [2]: https://github.com/ValveSoftware/source-sdk-2013/blob/0d8dceea4310fde5706b3ce1c70609d72a38efdf/sp/src/public/tier1/bitbuf.h#L756
    //
    // NOTE: butterfly, manta and clarity - all have same exact implementation.
    //
    // quote from clarity:
    // Thanks to Robin Dietrich for providing a clean version of this code :-)
    // The header looks like this: [XY00001111222233333333333333333333] where everything > 0 is optional.
    // The first 2 bits (X and Y) tell us how much (if any) to read other than the 6 initial bits:
    // Y set -> read 4
    // X set -> read 8
    // X + Y set -> read 28

    #[inline]
    pub fn read_ubitvar(&mut self) -> Result<u32, BitError> {
        let ret = self.read_ubit64(6)?;
        let ret = match ret & (16 | 32) {
            16 => (ret & 15) | (self.read_ubit64(4)? << 4),
            32 => (ret & 15) | (self.read_ubit64(8)? << 4),
            48 => (ret & 15) | (self.read_ubit64(32 - 4)? << 4),
            _ => ret,
        };
        ret.try_into().map_err(BitError::TryFromIntError)
    }

    #[inline]
    pub fn read_bitfloat(&mut self) -> Result<f32, BitError> {
        Ok(f32::from_bits(self.read_ubit64(32)?.try_into()?))
    }

    #[inline]
    pub fn read_bitcoord(&mut self) -> Result<f32, BitError> {
        self.read_bitcoord_with(COORD_INTEGER_BITS, COORD_FRACTIONAL_BITS)
    }

    /// same as [`Self::read_bitcoord`], but with custom integer / fractional bit counts (see
    /// `ProtoCoordSizeParams_t`).
    #[inline]
    pub fn read_bitcoord_with(
        &mut self,
        integer_bits: usize,
        fractional_bits: usize,
    ) -> Result<f32, BitError> {
        let mut value: f32 = 0.0;

        // Read the required integer and fraction flags
        let has_intval = self.read_bool()?;
        let has_fractval = self.read_bool()?;

        // If we got either parse them, otherwise it's a zero.
        if has_intval || has_fractval {
            // Read the sign bit
            let signbit = self.read_bool()?;

            // If there's an integer, read it in
            let mut intval = 0;
            if has_intval {
                // Adjust the integers from [0..MAX_COORD_VALUE-1] to [1..MAX_COORD_VALUE]
                intval = self.read_ubit64(integer_bits)? + 1;
            }

            // If there's a fraction, read it in
            let mut fractval = 0;
            if has_fractval {
                fractval = self.read_ubit64(fractional_bits)?;
            }

            // Calculate the correct floating point value
            let resolution = 1.0 / (1u64 << fractional_bits) as f32;
            value = intval as f32 + (fractval as f32 * resolution);

            // Fixup the sign if negative.
            if signbit {
                value = -value;
            }
        }

        Ok(value)
    }

    #[inline]
    pub fn read_bitnormal(&mut self) -> Result<f32, BitError> {
        self.read_bitnormal_with(NORMAL_FRACTIONAL_BITS)
    }

    /// same as [`Self::read_bitnormal`], but with a custom fractional bit count (see
    /// `ProtoCoordSizeParams_t`).
    #[inline]
    pub fn read_bitnormal_with(&mut self, fractional_bits: usize) -> Result<f32, BitError> {
        // read the sign bit
        let signbit = self.read_bool()?;

        // read the fractional part
        let fractval = self.read_ubit64(fractional_bits)?;

        // calculate the correct floating point value
        let resolution = 1.0 / ((1u64 << fractional_bits) - 1) as f32;
        let mut value = fractval as f32 * resolution;

        // fixup the sign if negative.
        if signbit {
            value = -value;
        }

        Ok(value)
    }

    #[inline]
    pub fn read_bitvec3coord(&mut self) -> Result<[f32; 3], BitError> {
        self.read_bitvec3coord_with(COORD_INTEGER_BITS, COORD_FRACTIONAL_BITS)
    }

    #[inline]
    pub fn read_bitvec3coord_with(
        &mut self,
        integer_bits: usize,
        fractional_bits: usize,
    ) -> Result<[f32; 3], BitError> {
        let mut fa = [0f32; 3];

        let xflag = self.read_bool()?;
        let yflag = self.read_bool()?;
        let zflag = self.read_bool()?;

        if xflag {
            fa[0] = self.read_bitcoord_with(integer_bits, fractional_bits)?;
        }
        if yflag {
            fa[1] = self.read_bitcoord_with(integer_bits, fractional_bits)?;
        }
        if zflag {
            fa[2] = self.read_bitcoord_with(integer_bits, fractional_bits)?;
        }

        Ok(fa)
    }

    #[inline]
    pub fn read_bitvec3normal(&mut self) -> Result<[f32; 3], BitError> {
        self.read_bitvec3normal_with(NORMAL_FRACTIONAL_BITS)
    }

    #[inline]
    pub fn read_bitvec3normal_with(
        &mut self,
        fractional_bits: usize,
    ) -> Result<[f32; 3], BitError> {
        let mut fa = [0f32; 3];

        let xflag = self.read_bool()?;
        let yflag = self.read_bool()?;

        if xflag {
            fa[0] = self.read_bitnormal_with(fractional_bits)?;
        }
        if yflag {
            fa[1] = self.read_bitnormal_with(fractional_bits)?;
        }

        // the first two imply the third (but not its sign)
        let znegative = self.read_bool()?;

        let fafafbfb = fa[0] * fa[0] + fa[1] * fa[1];
        if fafafbfb < 1.0 {
            fa[2] = (1.0 - fafafbfb).sqrt();
        }

        if znegative {
            fa[2] = -fa[2];
        }

        Ok(fa)
    }

    #[inline]
    pub fn read_bitangle(&mut self, num_bits: usize) -> Result<f32, BitError> {
        let shift = bitbuf::get_bit_for_bit_num(num_bits) as f32;

        let u = self.read_ubit64(num_bits)?;
        let ret = (u as f32) * (360.0 / shift);

        Ok(ret)
    }

    // Always reads to the end of the string (so you can read the next piece of data waiting).
    //
    // If line is true, it stops when it reaches a '\n' or a null-terminator.
    //
    // buf is always null-terminated (unless buf.len() is 0).
    //
    // Returns the number of characters left in out when the routine is complete (this will never
    // exceed buf.len()-1).
    #[inline]
    pub fn read_string(&mut self, buf: &mut [u8], line: bool) -> Result<usize, BitError> {
        if buf.is_empty() {
            return Err(BitError::BufferTooSmall);
        }

        let mut too_small = false;
        let mut num_chars = 0;
        loop {
            let val = self.read_byte()?;
            if val == 0 || (line && val == b'\n') {
                break;
            }

            if num_chars < (buf.len() - 1) {
                buf[num_chars] = val;
                num_chars += 1;
            } else {
                too_small = true;
            }
        }

        // make sure it's null-terminated.
        if num_chars >= buf.len() {
            return Err(BitError::BufferTooSmall);
        }
        buf[num_chars] = 0;

        // did it fit?
        if too_small {
            return Err(BitError::BufferTooSmall);
        }

        Ok(num_chars)
    }

    #[inline]
    pub fn read_string_to_end(&mut self, buf: &mut Vec<u8>, line: bool) -> Result<usize, BitError> {
        let mut num_chars = 0;
        loop {
            let val = self.read_byte()?;
            if val == 0 || (line && val == b'\n') {
                break;
            }
            buf.push(val);
            num_chars += 1;
        }
        Ok(num_chars)
    }

    #[inline]
    pub fn read_ubitvarfp(&mut self) -> Result<u32, BitError> {
        #[allow(clippy::same_functions_in_if_condition)]
        let ret = if self.read_bool()? {
            self.read_ubit64(2)?
        } else if self.read_bool()? {
            self.read_ubit64(4)?
        } else if self.read_bool()? {
            self.read_ubit64(10)?
        } else if self.read_bool()? {
            self.read_ubit64(17)?
        } else {
            self.read_ubit64(31)?
        };
        ret.try_into().map_err(BitError::TryFromIntError)
    }
}

#[cfg(test)]
// NOTE: the values compared below are exactly representable.
#[allow(clippy::float_cmp)]
mod test {
    use super::*;

    #[test]
    fn test_read_string() {
        let buf = b"Life's but a walking shadow, a poor player.\0";
        let mut br = BitReader::new(buf);

        let mut out = vec![0u8; buf.len()];
        let num_chars = br.read_string(&mut out, false).unwrap();
        assert_eq!(&out, &buf);
        assert_eq!(num_chars, buf.len() - 1);
    }

    fn write_bitcoord(
        bw: &mut bitbuf::BitWriter,
        value: f32,
        integer_bits: usize,
        fractional_bits: usize,
    ) {
        let abs = value.abs();
        let intval = abs.trunc() as u64;
        let fractval = ((abs - abs.trunc()) * (1u64 << fractional_bits) as f32) as u64;
        bw.write_ubit64(u64::from(intval != 0), 1).unwrap();
        bw.write_ubit64(u64::from(fractval != 0), 1).unwrap();
        if intval != 0 || fractval != 0 {
            bw.write_ubit64(u64::from(value < 0.0), 1).unwrap();
            if intval != 0 {
                bw.write_ubit64(intval - 1, integer_bits).unwrap();
            }
            if fractval != 0 {
                bw.write_ubit64(fractval, fractional_bits).unwrap();
            }
        }
    }

    #[test]
    fn test_read_bitcoord_default_params() {
        let mut buf = [0u8; 16];
        let mut bw = bitbuf::BitWriter::new(&mut buf);
        write_bitcoord(&mut bw, -1234.5, COORD_INTEGER_BITS, COORD_FRACTIONAL_BITS);
        write_bitcoord(&mut bw, 0.0, COORD_INTEGER_BITS, COORD_FRACTIONAL_BITS);

        let mut br = BitReader::new(&buf);
        assert_eq!(br.read_bitcoord().unwrap(), -1234.5);
        assert_eq!(br.read_bitcoord().unwrap(), 0.0);
    }

    #[test]
    fn test_read_bitcoord_custom_params() {
        let mut buf = [0u8; 16];
        let mut bw = bitbuf::BitWriter::new(&mut buf);
        write_bitcoord(&mut bw, 20000.125, 15, 3);

        let mut br = BitReader::new(&buf);
        assert_eq!(br.read_bitcoord_with(15, 3).unwrap(), 20000.125);
        // 3 flag bits + 15 integer bits + 3 fractional bits
        assert_eq!(br.num_bits_read(), 21);
    }

    #[test]
    fn test_read_bitnormal_custom_params() {
        let mut buf = [0u8; 8];
        let mut bw = bitbuf::BitWriter::new(&mut buf);
        // sign + 7 fractional bits; 127 / 127 == 1.0
        bw.write_ubit64(1, 1).unwrap();
        bw.write_ubit64(127, 7).unwrap();

        let mut br = BitReader::new(&buf);
        assert_eq!(br.read_bitnormal_with(7).unwrap(), -1.0);
        assert_eq!(br.num_bits_read(), 8);
    }
}
