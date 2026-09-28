use core::fmt::Debug;
use core::str::Utf8Error;
use dungers::bitbuf::BitError;
use dyn_clone::DynClone;

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

// TODO: get rid of trait objects; find a better, more efficient, way to
// "attach" decoders to fields; but note that having separate decoding functions
// and attaching function "pointers" to fields is even worse.

// TODO(blukai): try to not box internal decoders (for example u64).

pub(crate) trait FieldDecode: DynClone + Debug + Send + Sync {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError>;

    #[allow(dead_code)]
    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        let _ = self.decode(ctx, br)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError>;
}

dyn_clone::clone_trait_object!(FieldDecode);

/// used during multi-phase initialization. never called.
#[derive(Debug, Clone, Default)]
pub(crate) struct InvalidDecoder;

impl FieldDecode for InvalidDecoder {
    #[cold]
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        _br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        unreachable!()
    }

    #[cold]
    fn skip_bits(&self, _br: &mut BitReader) -> Result<usize, DecoderError> {
        unreachable!()
    }
}

// ----

trait InternalFieldDecode<T>: DynClone + Debug + Send + Sync {
    fn decode(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<T, BitError>;

    #[allow(dead_code)]
    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), BitError> {
        let _ = self.decode(ctx, br)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError>;
}

dyn_clone::clone_trait_object!(<T> InternalFieldDecode<T>);

// ----

#[derive(Debug, Clone, Default)]
pub(crate) struct I64Decoder;

impl FieldDecode for I64Decoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(FieldValue::I64(br.read_varint64()?))
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let start = br.num_bits_read();
        let _ = br.read_varint64()?;
        Ok(br.num_bits_read() - start)
    }
}

// ----

#[derive(Debug, Clone, Default)]
struct InternalU64Decoder;

impl FieldDecode for InternalU64Decoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(FieldValue::U64(br.read_uvarint64()?))
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let start = br.num_bits_read();
        let _ = br.read_uvarint64()?;
        Ok(br.num_bits_read() - start)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalU64Fixed64Decoder;

impl FieldDecode for InternalU64Fixed64Decoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let mut buf = [0u8; 8];
        br.read_bytes(&mut buf)?;
        Ok(FieldValue::U64(u64::from_le_bytes(buf)))
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        br.skip_bits(64)?;
        Ok(64)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct U64Decoder {
    decoder: Box<dyn FieldDecode>,
}

// NOTE: default should only be used to decode dynamic array lengths. for everything else decoder
// must be constructed using U64Decoder's new method.
impl Default for U64Decoder {
    fn default() -> Self {
        Self {
            decoder: Box::<InternalU64Decoder>::default(),
        }
    }
}

impl U64Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Self {
        if field.var_encoder_heq(fxhash::hash_bytes(b"fixed64")) {
            Self {
                decoder: Box::<InternalU64Fixed64Decoder>::default(),
            }
        } else {
            Self::default()
        }
    }
}

impl FieldDecode for U64Decoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        self.decoder.decode(ctx, br)
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        self.decoder.skip_bits(br)
    }
}

// ----

#[derive(Debug, Clone, Default)]
pub(crate) struct BoolDecoder;

impl FieldDecode for BoolDecoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(FieldValue::Bool(br.read_bool()?))
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        br.skip_bits(1)?;
        Ok(1)
    }
}

// ----

#[derive(Debug, Clone, Default)]
pub(crate) struct StringDecoder;

impl FieldDecode for StringDecoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        // NOTE: string_buf must be cleared after use.
        assert!(ctx.string_buf.is_empty());
        let n = br.read_string_to_end(&mut ctx.string_buf, false)?;
        let ret = FieldValue::String(Box::from(&ctx.string_buf[..n]));
        ctx.string_buf.clear();
        Ok(ret)
    }

    fn skip(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        loop {
            let val = br.read_byte()?;
            if val == 0 {
                break;
            }
        }
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let start = br.num_bits_read();
        loop {
            let val = br.read_byte()?;
            if val == 0 {
                break;
            }
        }
        Ok(br.num_bits_read() - start)
    }
}

// ----

#[derive(Debug, Clone, Default)]
struct InternalF32SimulationTimeDecoder;

impl InternalFieldDecode<f32> for InternalF32SimulationTimeDecoder {
    fn decode(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        Ok(br.read_uvarint32()? as f32 * ctx.tick_interval)
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        let start = br.num_bits_read();
        let _ = br.read_uvarint32()?;
        Ok(br.num_bits_read() - start)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalF32CoordDecoder;

impl InternalFieldDecode<f32> for InternalF32CoordDecoder {
    fn decode(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        br.read_bitcoord()
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        let start = br.num_bits_read();
        let _ = br.read_bitcoord()?;
        Ok(br.num_bits_read() - start)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalF32NormalDecoder;

impl InternalFieldDecode<f32> for InternalF32NormalDecoder {
    fn decode(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        br.read_bitnormal()
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        br.skip_bits(12)?;
        Ok(12)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalF32NoScaleDecoder;

impl InternalFieldDecode<f32> for InternalF32NoScaleDecoder {
    fn decode(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        br.read_bitfloat()
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        br.skip_bits(32)?;
        Ok(32)
    }
}

#[derive(Debug, Clone)]
struct InternalQuantizedFloatDecoder {
    quantized_float: QuantizedFloat,
}

impl InternalQuantizedFloatDecoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        Ok(Self {
            quantized_float: QuantizedFloat::new(
                field.bit_count.unwrap_or_default(),
                field.encode_flags.unwrap_or_default(),
                field.low_value.unwrap_or_default(),
                field.high_value.unwrap_or_default(),
            )?,
        })
    }
}

impl InternalFieldDecode<f32> for InternalQuantizedFloatDecoder {
    fn decode(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        self.quantized_float.decode(br)
    }

    fn skip(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), BitError> {
        self.quantized_float.skip(br)
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        self.quantized_float.skip_bits(br)
    }
}

// ----

#[derive(Debug, Clone)]
pub(crate) struct InternalF32Decoder {
    decoder: Box<dyn InternalFieldDecode<f32>>,
}

impl InternalF32Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        if field.var_name.hash == fxhash::hash_bytes(b"m_flSimulationTime")
            || field.var_name.hash == fxhash::hash_bytes(b"m_flAnimTime")
        {
            return Ok(Self {
                decoder: Box::<InternalF32SimulationTimeDecoder>::default(),
            });
        }

        if let Some(var_encoder) = field.var_encoder.as_ref() {
            match var_encoder.hash {
                hash if hash == fxhash::hash_bytes(b"coord") => {
                    return Ok(Self {
                        decoder: Box::<InternalF32CoordDecoder>::default(),
                    });
                }
                hash if hash == fxhash::hash_bytes(b"normal") => {
                    return Ok(Self {
                        decoder: Box::<InternalF32NormalDecoder>::default(),
                    });
                }
                _ => unimplemented!("{:?}", var_encoder),
            }
        }

        let bit_count = field.bit_count.unwrap_or_default();
        // NOTE: that would mean that something is seriously wrong - in that case yell at me
        // loudly.
        debug_assert!((0..=32).contains(&bit_count));
        if bit_count == 0 || bit_count == 32 {
            return Ok(Self {
                decoder: Box::<InternalF32NoScaleDecoder>::default(),
            });
        }

        Ok(Self {
            decoder: Box::new(InternalQuantizedFloatDecoder::new(field)?),
        })
    }
}

impl InternalFieldDecode<f32> for InternalF32Decoder {
    fn decode(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<f32, BitError> {
        self.decoder.decode(ctx, br)
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), BitError> {
        self.decoder.skip(ctx, br)
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, BitError> {
        self.decoder.skip_bits(br)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct F32Decoder {
    decoder: Box<dyn InternalFieldDecode<f32>>,
}

impl F32Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        Ok(Self {
            decoder: Box::new(InternalF32Decoder::new(field)?),
        })
    }
}

impl FieldDecode for F32Decoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(FieldValue::F32(self.decoder.decode(ctx, br)?))
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        Ok(self.decoder.skip_bits(br)?)
    }
}

// ----

#[derive(Debug, Clone)]
struct InternalVector3DefaultDecoder {
    decoder: Box<dyn InternalFieldDecode<f32>>,
}

impl FieldDecode for InternalVector3DefaultDecoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let vec3 = [
            self.decoder.decode(ctx, br)?,
            self.decoder.decode(ctx, br)?,
            self.decoder.decode(ctx, br)?,
        ];
        Ok(FieldValue::Vector3(vec3))
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)?;
        self.decoder.skip(ctx, br)?;
        self.decoder.skip(ctx, br)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let mut total = 0;
        total += self.decoder.skip_bits(br)?;
        total += self.decoder.skip_bits(br)?;
        total += self.decoder.skip_bits(br)?;
        Ok(total)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalVector3NormalDecoder;

impl FieldDecode for InternalVector3NormalDecoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(FieldValue::Vector3(br.read_bitvec3normal()?))
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let start = br.num_bits_read();
        let _ = br.read_bitvec3normal()?;
        Ok(br.num_bits_read() - start)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct Vector3Decoder {
    decoder: Box<dyn FieldDecode>,
}

impl Vector3Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        if field.var_encoder_heq(fxhash::hash_bytes(b"normal")) {
            Ok(Self {
                decoder: Box::<InternalVector3NormalDecoder>::default(),
            })
        } else {
            Ok(Self {
                decoder: Box::new(InternalVector3DefaultDecoder {
                    decoder: Box::new(InternalF32Decoder::new(field)?),
                }),
            })
        }
    }
}

impl FieldDecode for Vector3Decoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        self.decoder.decode(ctx, br)
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        self.decoder.skip_bits(br)
    }
}

// ----

#[derive(Debug, Clone)]
pub(crate) struct Vector2Decoder {
    decoder: Box<dyn InternalFieldDecode<f32>>,
}

impl Vector2Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        Ok(Self {
            decoder: Box::new(InternalF32Decoder::new(field)?),
        })
    }
}

impl FieldDecode for Vector2Decoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let vec2 = [self.decoder.decode(ctx, br)?, self.decoder.decode(ctx, br)?];
        Ok(FieldValue::Vector2(vec2))
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)?;
        self.decoder.skip(ctx, br)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let mut total = 0;
        total += self.decoder.skip_bits(br)?;
        total += self.decoder.skip_bits(br)?;
        Ok(total)
    }
}

// ----

#[derive(Debug, Clone)]
pub(crate) struct Vector4Decoder {
    decoder: Box<dyn InternalFieldDecode<f32>>,
}

impl Vector4Decoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Result<Self, DecoderError> {
        Ok(Self {
            decoder: Box::new(InternalF32Decoder::new(field)?),
        })
    }
}

impl FieldDecode for Vector4Decoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let vec4 = [
            self.decoder.decode(ctx, br)?,
            self.decoder.decode(ctx, br)?,
            self.decoder.decode(ctx, br)?,
            self.decoder.decode(ctx, br)?,
        ];
        Ok(FieldValue::Vector4(vec4))
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)?;
        self.decoder.skip(ctx, br)?;
        self.decoder.skip(ctx, br)?;
        self.decoder.skip(ctx, br)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let mut total = 0;
        total += self.decoder.skip_bits(br)?;
        total += self.decoder.skip_bits(br)?;
        total += self.decoder.skip_bits(br)?;
        total += self.decoder.skip_bits(br)?;
        Ok(total)
    }
}

// ----

#[derive(Debug, Clone)]
struct InternalQAnglePitchYawDecoder {
    bit_count: usize,
}

impl FieldDecode for InternalQAnglePitchYawDecoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let vec3 = [
            br.read_bitangle(self.bit_count)?,
            br.read_bitangle(self.bit_count)?,
            0.0,
        ];
        Ok(FieldValue::QAngle(vec3))
    }

    fn skip(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        let _ = br.read_ubit64(self.bit_count)?;
        let _ = br.read_ubit64(self.bit_count)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let bits = self.bit_count * 2;
        br.skip_bits(bits)?;
        Ok(bits)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalQAngleNoBitCountDecoder;

impl FieldDecode for InternalQAngleNoBitCountDecoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        Ok(FieldValue::QAngle(br.read_bitvec3coord()?))
    }

    fn skip(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        let _ = br.read_bitvec3coord()?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let start = br.num_bits_read();
        let _ = br.read_bitvec3coord()?;
        Ok(br.num_bits_read() - start)
    }
}

#[derive(Debug, Clone, Default)]
struct InternalQAnglePreciseDecoder;

impl FieldDecode for InternalQAnglePreciseDecoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let mut vec3 = [0f32; 3];

        let rx = br.read_bool()?;
        let ry = br.read_bool()?;
        let rz = br.read_bool()?;

        if rx {
            vec3[0] = br.read_bitangle(20)?;
        }
        if ry {
            vec3[1] = br.read_bitangle(20)?;
        }
        if rz {
            vec3[2] = br.read_bitangle(20)?;
        }

        Ok(FieldValue::QAngle(vec3))
    }

    fn skip(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        let rx = br.read_bool()?;
        let ry = br.read_bool()?;
        let rz = br.read_bool()?;

        if rx {
            let _ = br.read_ubit64(20)?;
        }
        if ry {
            let _ = br.read_ubit64(20)?;
        }
        if rz {
            let _ = br.read_ubit64(20)?;
        }

        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let rx = br.read_bool()?;
        let ry = br.read_bool()?;
        let rz = br.read_bool()?;

        let value_bits = 20 * (usize::from(rx) + usize::from(ry) + usize::from(rz));
        br.skip_bits(value_bits)?;
        Ok(3 + value_bits)
    }
}

#[derive(Debug, Clone)]
struct InternalQAngleBitCountDecoder {
    bit_count: usize,
}

impl FieldDecode for InternalQAngleBitCountDecoder {
    fn decode(
        &self,
        _ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        let vec3 = [
            br.read_bitangle(self.bit_count)?,
            br.read_bitangle(self.bit_count)?,
            br.read_bitangle(self.bit_count)?,
        ];
        Ok(FieldValue::QAngle(vec3))
    }

    fn skip(&self, _ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        let _ = br.read_ubit64(self.bit_count)?;
        let _ = br.read_ubit64(self.bit_count)?;
        let _ = br.read_ubit64(self.bit_count)?;
        Ok(())
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        let bits = self.bit_count * 3;
        br.skip_bits(bits)?;
        Ok(bits)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct QAngleDecoder {
    decoder: Box<dyn FieldDecode>,
}

impl QAngleDecoder {
    pub(crate) fn new(field: &FlattenedSerializerField) -> Self {
        let bit_count = field.bit_count.unwrap_or_default() as usize;

        if let Some(var_encoder) = field.var_encoder.as_ref() {
            match var_encoder.hash {
                hash if hash == fxhash::hash_bytes(b"qangle_pitch_yaw") => {
                    return Self {
                        decoder: Box::new(InternalQAnglePitchYawDecoder { bit_count }),
                    };
                }
                hash if hash == fxhash::hash_bytes(b"qangle_precise") => {
                    return Self {
                        decoder: Box::<InternalQAnglePreciseDecoder>::default(),
                    };
                }

                hash if hash == fxhash::hash_bytes(b"qangle") => {}
                // NOTE(blukai): naming of var encoders seem inconsistent. found this pascal cased
                // name in dota 2 replay from 2018.
                hash if hash == fxhash::hash_bytes(b"QAngle") => {}

                _ => unimplemented!("{:?}", var_encoder),
            }
        }

        if bit_count == 0 {
            return Self {
                decoder: Box::<InternalQAngleNoBitCountDecoder>::default(),
            };
        }

        Self {
            decoder: Box::new(InternalQAngleBitCountDecoder { bit_count }),
        }
    }
}

impl FieldDecode for QAngleDecoder {
    fn decode(
        &self,
        ctx: &mut FieldDecodeContext,
        br: &mut BitReader,
    ) -> Result<FieldValue, DecoderError> {
        self.decoder.decode(ctx, br)
    }

    fn skip(&self, ctx: &mut FieldDecodeContext, br: &mut BitReader) -> Result<(), DecoderError> {
        self.decoder.skip(ctx, br)
    }

    fn skip_bits(&self, br: &mut BitReader) -> Result<usize, DecoderError> {
        self.decoder.skip_bits(br)
    }
}
