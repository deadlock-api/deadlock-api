use core::fmt::Debug;
use core::str::Utf8Error;
use dungers::bitbuf::BitError;
use std::sync::Arc;

use crate::bitreader::BitReader;
use crate::fieldvalue::FieldValue;
use crate::flattenedserializers::FlattenedSerializerField;
use crate::fxhash;
use crate::quantizedfloat::{QuantizedFloat, QuantizedFloatError};

// NOTE: PropTypeFns (from csgo source code) is what you are looking for, it has all the encoders,
// decoders, proxies and all of the stuff.

#[derive(thiserror::Error, Debug)]
pub enum DecoderError {
    #[error(transparent)]
    QuantizedFloat(#[from] QuantizedFloatError),
    #[error(transparent)]
    Bit(#[from] BitError),
    #[error(transparent)]
    UTF8(#[from] Utf8Error),
    #[error("unsupported var encoder (hash {0})")]
    UnsupportedVarEncoder(u64),
    #[error("field has no decoder")]
    NoDecoder,
}

// ----

// public/dt_common.h
//
// NOTE(blukai): all pieces of public code define DT_MAX_STRING_BITS to 9, but that does not appear
// to be enough for deadlock (the game):
// https://github.com/blukai/haste/issues/4
//
// deadlock's `CCitadelPlayerPawn` entity has a field `m_sHeroBuildSerialized` of type
// `CUtlString`, but this does not appear to be a valid utf8 string, but as the name suggests some
// serialized data.
// for more info on that see FieldValue::String's comment.
const DT_MAX_STRING_BITS: u32 = 9;
/// maximum length of a string that can be sent.
const DT_MAX_STRING_BUFFERSIZE: u32 = 1 << DT_MAX_STRING_BITS;

#[derive(Debug)]
pub(crate) struct FieldDecodeContext {
    pub(crate) tick_interval: f32,
    pub(crate) string_buf: Vec<u8>,
}

impl Default for FieldDecodeContext {
    fn default() -> Self {
        Self {
            // NOTE(blukai): tick interval needs to be read from SvcServerInfo packet message. it
            // becomes available "later"; it is okay to initialize it to 0.0.
            tick_interval: 0.0,
            string_buf: Vec::with_capacity(DT_MAX_STRING_BUFFERSIZE as usize),
        }
    }
}

// ----

/// decoder for a single f32 component (of a float field or of a vector).
#[derive(Debug, Clone)]
pub(crate) enum F32Decoder {
    /// `m_flSimulationTime` / `m_flAnimTime`: a tick count (uvarint) scaled by the tick interval.
    SimulationTime,
    Coord {
        integer_bits: usize,
        fractional_bits: usize,
    },
    Normal {
        fractional_bits: usize,
    },
    /// raw 32 bit float.
    NoScale,
    Quantized(QuantizedFloat),
}

impl F32Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        if field.var_name.hash == fxhash::hash_bytes(b"m_flSimulationTime")
            || field.var_name.hash == fxhash::hash_bytes(b"m_flAnimTime")
        {
            return Ok(Self::SimulationTime);
        }

        if let Some(var_encoder) = field.var_encoder.as_ref() {
            return match var_encoder.hash {
                hash if hash == fxhash::hash_bytes(b"coord") => Ok(Self::Coord {
                    integer_bits: field.coord_size_params.coord_integer_bits,
                    fractional_bits: field.coord_size_params.coord_fractional_bits,
                }),
                hash if hash == fxhash::hash_bytes(b"normal") => Ok(Self::Normal {
                    fractional_bits: field.coord_size_params.normal_fractional_bits,
                }),
                hash => Err(DecoderError::UnsupportedVarEncoder(hash)),
            };
        }

        let bit_count = field.bit_count.unwrap_or_default();
        // NOTE: that would mean that something is seriously wrong - in that case yell at me
        // loudly.
        debug_assert!((0..=32).contains(&bit_count));
        if bit_count == 0 || bit_count == 32 {
            return Ok(Self::NoScale);
        }

        Ok(Self::Quantized(QuantizedFloat::new(
            bit_count,
            field.encode_flags.unwrap_or_default(),
            field.low_value.unwrap_or_default(),
            field.high_value.unwrap_or_default(),
        )?))
    }

    #[inline]
    fn decode(&self, ctx: &FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        match self {
            Self::SimulationTime => Ok(br.read_uvarint32()? as f32 * ctx.tick_interval),
            Self::Coord {
                integer_bits,
                fractional_bits,
            } => br.read_bitcoord_with(*integer_bits, *fractional_bits),
            Self::Normal { fractional_bits } => br.read_bitnormal_with(*fractional_bits),
            Self::NoScale => br.read_bitfloat(),
            Self::Quantized(qf) => qf.decode(br),
        }
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        match self {
            Self::SimulationTime => {
                let start = br.num_bits_read();
                br.read_uvarint32()?;
                Ok(br.num_bits_read() - start)
            }
            Self::Coord {
                integer_bits,
                fractional_bits,
            } => {
                let start = br.num_bits_read();
                br.read_bitcoord_with(*integer_bits, *fractional_bits)?;
                Ok(br.num_bits_read() - start)
            }
            Self::Normal { fractional_bits } => {
                // sign bit + fractional part
                let bits = 1 + fractional_bits;
                br.skip_bits(bits)?;
                Ok(bits)
            }
            Self::NoScale => {
                br.skip_bits(32)?;
                Ok(32)
            }
            Self::Quantized(qf) => qf.skip_bits(br),
        }
    }
}

// ----

/// decoder of a field value; one flat enum so that decoding is a single match (no dynamic
/// dispatch, no boxed decoder chains).
#[derive(Debug, Clone)]
pub(crate) enum FieldDecoder {
    /// placeholder for fields that carry no value of their own (used during multi-phase
    /// initialization and for dynamic serializer array elements).
    None,

    /// zigzag varint.
    I64,
    /// `fixed8` var encoder: 8 raw bits, sign-extended.
    ///
    /// deadlock started to use this encoder for small integer fields (int8) in build 6712;
    /// previously such fields were sent as varints.
    I64Fixed8,

    /// varint.
    U64,
    /// `fixed64` var encoder: 8 raw little-endian bytes.
    U64Fixed64,
    /// `fixed8` var encoder: 8 raw bits.
    ///
    /// deadlock started to use this encoder for uint8 fields and 8 bit enums (e.g. `MoveType_t`)
    /// in build 6712; previously such fields were sent as varints.
    U64Fixed8,

    Bool,
    /// null-terminated string.
    String,
    /// `CUtlBinaryBlock` values: a varint byte length followed by that many raw bytes.
    ///
    /// deadlock networks such fields as of build 6712 (e.g.
    /// `AnimGraph2SerializedPoseRecipeSlot_t.m_topology`).
    BinaryBlock,

    F32(F32Decoder),
    Vector2(F32Decoder),
    Vector3(F32Decoder),
    Vector3Normal {
        fractional_bits: usize,
    },
    Vector4(F32Decoder),

    QAnglePitchYaw {
        bit_count: usize,
    },
    QAngleNoBitCount {
        integer_bits: usize,
        fractional_bits: usize,
    },
    QAnglePrecise {
        angle_bits: usize,
    },
    QAngleBitCount {
        bit_count: usize,
    },
}

impl FieldDecoder {
    /// returns a decoder for a signed integer field, honoring its var encoder.
    pub(crate) fn new_i64(field: &FlattenedSerializerField) -> Self {
        if field.var_encoder_heq(fxhash::hash_bytes(b"fixed8")) {
            Self::I64Fixed8
        } else {
            Self::I64
        }
    }

    /// returns a decoder for an unsigned integer field, honoring its var encoder.
    ///
    /// NOTE: [`FieldDecoder::U64`] alone should only be used to decode dynamic array lengths.
    pub(crate) fn new_u64(field: &FlattenedSerializerField) -> Self {
        if field.var_encoder_heq(fxhash::hash_bytes(b"fixed64")) {
            Self::U64Fixed64
        } else if field.var_encoder_heq(fxhash::hash_bytes(b"fixed8")) {
            Self::U64Fixed8
        } else {
            Self::U64
        }
    }

    pub(crate) fn new_f32(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        F32Decoder::new(field).map(Self::F32)
    }

    pub(crate) fn new_vector2(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        F32Decoder::new(field).map(Self::Vector2)
    }

    pub(crate) fn new_vector3(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        if field.var_encoder_heq(fxhash::hash_bytes(b"normal")) {
            Ok(Self::Vector3Normal {
                fractional_bits: field.coord_size_params.normal_fractional_bits,
            })
        } else {
            F32Decoder::new(field).map(Self::Vector3)
        }
    }

    pub(crate) fn new_vector4(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        F32Decoder::new(field).map(Self::Vector4)
    }

    pub(crate) fn new_qangle(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        let bit_count = field.bit_count.unwrap_or_default() as usize;

        if let Some(var_encoder) = field.var_encoder.as_ref() {
            match var_encoder.hash {
                hash if hash == fxhash::hash_bytes(b"qangle_pitch_yaw") => {
                    return Ok(Self::QAnglePitchYaw { bit_count });
                }
                hash if hash == fxhash::hash_bytes(b"qangle_precise") => {
                    return Ok(Self::QAnglePrecise {
                        angle_bits: field.coord_size_params.angle_bits,
                    });
                }

                hash if hash == fxhash::hash_bytes(b"qangle") => {}
                // NOTE(blukai): naming of var encoders seem inconsistent. found this pascal cased
                // name in dota 2 replay from 2018.
                hash if hash == fxhash::hash_bytes(b"QAngle") => {}

                hash => return Err(DecoderError::UnsupportedVarEncoder(hash)),
            }
        }

        if bit_count == 0 {
            return Ok(Self::QAngleNoBitCount {
                integer_bits: field.coord_size_params.coord_integer_bits,
                fractional_bits: field.coord_size_params.coord_fractional_bits,
            });
        }

        Ok(Self::QAngleBitCount { bit_count })
    }

    #[inline]
    pub(crate) fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(match self {
            Self::None => return Err(DecoderError::NoDecoder),

            Self::I64 => FieldValue::I64(br.read_varint64()?),
            Self::I64Fixed8 => FieldValue::I64(i64::from(br.read_byte()? as i8)),

            Self::U64 => FieldValue::U64(br.read_uvarint64()?),
            Self::U64Fixed64 => {
                let mut buf = [0u8; 8];
                br.read_bytes(&mut buf)?;
                FieldValue::U64(u64::from_le_bytes(buf))
            }
            Self::U64Fixed8 => FieldValue::U64(u64::from(br.read_byte()?)),

            Self::Bool => FieldValue::Bool(br.read_bool()?),
            Self::String => {
                // NOTE: string_buf must be cleared after use.
                assert_eq!(ctx.string_buf, [] as [u8; 0]);
                let n = br.read_string_to_end(&mut ctx.string_buf, false)?;
                let ret = FieldValue::String(Arc::from(&ctx.string_buf[..n]));
                ctx.string_buf.clear();
                ret
            }
            Self::BinaryBlock => {
                let len = br.read_uvarint32()? as usize;
                let mut buf = vec![0u8; len];
                br.read_bytes(&mut buf)?;
                FieldValue::String(Arc::from(buf))
            }

            Self::F32(d) => FieldValue::F32(d.decode(ctx, br)?),
            Self::Vector2(d) => FieldValue::Vector2([d.decode(ctx, br)?, d.decode(ctx, br)?]),
            Self::Vector3(d) => {
                FieldValue::Vector3([d.decode(ctx, br)?, d.decode(ctx, br)?, d.decode(ctx, br)?])
            }
            Self::Vector3Normal { fractional_bits } => {
                FieldValue::Vector3(br.read_bitvec3normal_with(*fractional_bits)?)
            }
            Self::Vector4(d) => FieldValue::Vector4([
                d.decode(ctx, br)?,
                d.decode(ctx, br)?,
                d.decode(ctx, br)?,
                d.decode(ctx, br)?,
            ]),

            Self::QAnglePitchYaw { bit_count } => FieldValue::QAngle([
                br.read_bitangle(*bit_count)?,
                br.read_bitangle(*bit_count)?,
                0.0,
            ]),
            Self::QAngleNoBitCount {
                integer_bits,
                fractional_bits,
            } => FieldValue::QAngle(br.read_bitvec3coord_with(*integer_bits, *fractional_bits)?),
            Self::QAnglePrecise { angle_bits } => {
                let mut vec3 = [0f32; 3];

                let rx = br.read_bool()?;
                let ry = br.read_bool()?;
                let rz = br.read_bool()?;

                if rx {
                    vec3[0] = br.read_bitangle(*angle_bits)?;
                }
                if ry {
                    vec3[1] = br.read_bitangle(*angle_bits)?;
                }
                if rz {
                    vec3[2] = br.read_bitangle(*angle_bits)?;
                }

                FieldValue::QAngle(vec3)
            }
            Self::QAngleBitCount { bit_count } => FieldValue::QAngle([
                br.read_bitangle(*bit_count)?,
                br.read_bitangle(*bit_count)?,
                br.read_bitangle(*bit_count)?,
            ]),
        })
    }

    /// advances the reader past a value without materializing it; returns the number of bits
    /// skipped.
    pub(crate) fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let fixed = |br: &mut BitReader, bits: usize| -> Result<usize, DecoderError> {
            br.skip_bits(bits)?;
            Ok(bits)
        };
        let start = br.num_bits_read();
        match self {
            Self::None => return Err(DecoderError::NoDecoder),

            Self::I64 => {
                br.read_varint64()?;
            }
            Self::I64Fixed8 | Self::U64Fixed8 => return fixed(br, 8),

            Self::U64 => {
                br.read_uvarint64()?;
            }
            Self::U64Fixed64 => return fixed(br, 64),

            Self::Bool => return fixed(br, 1),
            Self::String => while br.read_byte()? != 0 {},
            Self::BinaryBlock => {
                let len = br.read_uvarint32()? as usize;
                br.skip_bits(len * 8)?;
            }

            Self::F32(d) => return Ok(d.skip_bits(br)?),
            Self::Vector2(d) => return Ok(d.skip_bits(br)? + d.skip_bits(br)?),
            Self::Vector3(d) => {
                return Ok(d.skip_bits(br)? + d.skip_bits(br)? + d.skip_bits(br)?);
            }
            Self::Vector3Normal { fractional_bits } => {
                br.read_bitvec3normal_with(*fractional_bits)?;
            }
            Self::Vector4(d) => {
                return Ok(d.skip_bits(br)?
                    + d.skip_bits(br)?
                    + d.skip_bits(br)?
                    + d.skip_bits(br)?);
            }

            Self::QAnglePitchYaw { bit_count } => return fixed(br, bit_count * 2),
            Self::QAngleNoBitCount {
                integer_bits,
                fractional_bits,
            } => {
                br.read_bitvec3coord_with(*integer_bits, *fractional_bits)?;
            }
            Self::QAnglePrecise { angle_bits } => {
                let rx = br.read_bool()?;
                let ry = br.read_bool()?;
                let rz = br.read_bool()?;
                let value_bits = angle_bits * (usize::from(rx) + usize::from(ry) + usize::from(rz));
                br.skip_bits(value_bits)?;
            }
            Self::QAngleBitCount { bit_count } => return fixed(br, bit_count * 3),
        }
        Ok(br.num_bits_read() - start)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::flattenedserializers::Symbol;

    fn field_with_encoder(var_encoder: &[u8]) -> FlattenedSerializerField {
        FlattenedSerializerField {
            var_encoder: Some(Symbol {
                hash: fxhash::hash_bytes(var_encoder),
            }),
            ..Default::default()
        }
    }

    fn decode(decoder: &FieldDecoder, buf: &[u8]) -> (FieldValue, usize) {
        let mut ctx = FieldDecodeContext::default();
        let mut br = BitReader::new(buf);
        let value = decoder.decode(&mut ctx, &mut br).unwrap();
        let mut br_skip = BitReader::new(buf);
        let skipped = decoder.skip_bits(&mut br_skip).unwrap();
        assert_eq!(skipped, br.num_bits_read());
        assert_eq!(skipped, br_skip.num_bits_read());
        (value, skipped)
    }

    #[test]
    fn test_fixed8_unsigned() {
        let field = field_with_encoder(b"fixed8");
        // NOTE: 0xfe as a varint would be an incomplete (multi byte) varint.
        let (value, bits) = decode(&FieldDecoder::new_u64(&field), &[0xfe, 0x01, 0, 0]);
        assert!(matches!(value, FieldValue::U64(254)));
        assert_eq!(bits, 8);
    }

    #[test]
    fn test_fixed8_signed() {
        let field = field_with_encoder(b"fixed8");
        let (value, bits) = decode(&FieldDecoder::new_i64(&field), &[0xfe, 0, 0, 0]);
        assert!(matches!(value, FieldValue::I64(-2)));
        assert_eq!(bits, 8);

        // without the encoder int8 is still a zigzag varint.
        let field = FlattenedSerializerField::default();
        let (value, bits) = decode(&FieldDecoder::new_i64(&field), &[0x03, 0, 0, 0]);
        assert!(matches!(value, FieldValue::I64(-2)));
        assert_eq!(bits, 8);
    }

    #[test]
    fn test_binary_block() {
        let (value, bits) = decode(&FieldDecoder::BinaryBlock, &[3, 0xaa, 0x00, 0xbb, 0xff]);
        let FieldValue::String(bytes) = value else {
            panic!("unexpected value type");
        };
        assert_eq!(&bytes[..], &[0xaa, 0x00, 0xbb]);
        assert_eq!(bits, 32);
    }

    #[test]
    fn test_string() {
        let (value, bits) = decode(&FieldDecoder::String, b"abc\0zz");
        let FieldValue::String(bytes) = value else {
            panic!("unexpected value type");
        };
        assert_eq!(&bytes[..], b"abc");
        assert_eq!(bits, 32);
    }

    #[test]
    fn test_unsupported_var_encoder_is_an_error() {
        let field = field_with_encoder(b"definitely_not_an_encoder");
        assert!(matches!(
            FieldDecoder::new_f32(&field),
            Err(DecoderError::UnsupportedVarEncoder(_))
        ));
        assert!(matches!(
            FieldDecoder::new_qangle(&field),
            Err(DecoderError::UnsupportedVarEncoder(_))
        ));
    }
}
