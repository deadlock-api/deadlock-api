use crate::fielddecoder::{DecoderError, FieldDecoder};
use crate::flattenedserializers::FlattenedSerializerField;
use crate::vartype::{self, Expr, Lit};

#[derive(thiserror::Error, Debug)]
pub enum FieldMetadataError {
    #[error(transparent)]
    VarTypeParseError(#[from] vartype::Error),
    #[error(transparent)]
    FieldDecoderConstructionError(#[from] DecoderError),
    #[error("unknown array length ident: {0}")]
    UnknownArrayLengthIdent(String),
    #[error("field not found")]
    FieldNotFound,
    #[error("unsupported var type")]
    UnsupportedVarType,
}

// NOTE: Clone is derived because FlattenedSerializerField needs to be clonable.
#[derive(Debug, Clone)]
pub(crate) enum FieldSpecialDescriptor {
    FixedArray {
        length: usize,
    },

    /// this variant differs from [`FieldSpecialDescriptor::DynamicSerializerArray`] in that it can
    /// contain primitive values (e.g., u8, bool) and more complex types (e.g., `Vector4D`, Vector),
    /// but it can not contain other serializers.
    ///
    /// example entity fields:
    /// ```txt
    /// m_PathNodes_Position: CNetworkUtlVectorBase< Vector > = 2
    /// m_PathNodes_Position.0: Vector = [0.0, 0.0, 0.0]
    /// m_PathNodes_Position.1: Vector = [-736.0029, 596.5974, 384.0]
    /// ```
    DynamicArray {
        /// decoder for the items of the dynamic array.
        ///
        /// decoder must be capable of decoding the type specified in the array's generic argument.
        /// for example, if the var type is `CNetworkUtlVectorBase< Vector >`, the decoder must be
        /// able to decode `Vector` values.
        decoder: FieldDecoder,
    },

    /// represents a dynamic array of fields that must be deserialized by the serializer specified
    /// by `field_serializer_name`.
    ///
    /// this variant differs from [`FieldSpecialDescriptor::DynamicArray`] in that it houses other
    /// serializers.
    ///
    /// example entity fields:
    /// ```txt
    /// m_vecStatViewerModifierValues: CUtlVectorEmbeddedNetworkVar< StatViewerModifierValues_t > = 2
    /// m_vecStatViewerModifierValues.0.m_SourceModifierID: CUtlStringToken = 1058891786
    /// m_vecStatViewerModifierValues.0.m_eValType: EModifierValue = 11
    /// m_vecStatViewerModifierValues.0.m_flValue: float32 = 3.0
    /// m_vecStatViewerModifierValues.1.m_SourceModifierID: CUtlStringToken = 2201601853
    /// m_vecStatViewerModifierValues.1.m_eValType: EModifierValue = 161
    /// m_vecStatViewerModifierValues.1.m_flValue: float32 = 2.0
    /// ```
    DynamicSerializerArray,

    // TODO: make use of the poiter special type (atm it's useless; but it's
    // supposed to be used to determine whether a new "entity" must be created
    // (and deserialized value of the pointer field (/bool) must not be
    // stored)).
    Pointer,
}

impl FieldSpecialDescriptor {
    pub(crate) fn is_dynamic_array(&self) -> bool {
        matches!(
            self,
            Self::DynamicArray { .. } | Self::DynamicSerializerArray
        )
    }

    pub(crate) fn is_fixed_array(&self) -> bool {
        matches!(self, Self::FixedArray { .. })
    }

    pub(crate) fn is_pointer(&self) -> bool {
        matches!(self, Self::Pointer)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct FieldMetadata {
    pub(crate) special_descriptor: Option<FieldSpecialDescriptor>,
    pub(crate) decoder: FieldDecoder,
}

impl Default for FieldMetadata {
    fn default() -> Self {
        Self {
            special_descriptor: None,
            decoder: FieldDecoder::None,
        }
    }
}

/// metadata of pointer fields: a bool that tells whether the pointee is present.
const POINTER: FieldMetadata = FieldMetadata {
    special_descriptor: Some(FieldSpecialDescriptor::Pointer),
    decoder: FieldDecoder::Bool,
};

fn visit_ident(
    ident: &str,
    field: &FlattenedSerializerField,
) -> Result<FieldMetadata, FieldMetadataError> {
    macro_rules! non_special {
        ($decoder:expr) => {
            Ok(FieldMetadata {
                special_descriptor: None,
                decoder: $decoder,
            })
        };
    }

    #[allow(clippy::match_same_arms)]
    match ident {
        // primitives
        "int8" | "int16" | "int32" | "int64" => non_special!(FieldDecoder::new_i64(field)),
        "bool" => non_special!(FieldDecoder::Bool),
        "float32" => non_special!(FieldDecoder::new_f32(field)?),

        // pointers (?)
        // https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/core/tools/demoinfo2/demoinfo2.txt#L130
        "CBodyComponentDCGBaseAnimating"
        | "CBodyComponentBaseAnimating"
        | "CBodyComponentBaseAnimatingOverlay"
        | "CBodyComponentBaseModelEntity"
        | "CBodyComponent"
        | "CBodyComponentSkeletonInstance"
        | "CBodyComponentPoint"
        | "CLightComponent"
        | "CRenderComponent"
        // https://github.com/SteamDatabase/GameTracking-Deadlock/blob/1e09d0e1289914e776b8d5783834478782a67468/game/core/pak01_dir/scripts/replay_compatability_settings.txt#L56
        | "C_BodyComponentBaseAnimating"
        | "C_BodyComponentBaseAnimatingOverlay"
        | "CPhysicsComponent" => Ok(POINTER),

        // other custom types
        "CUtlSymbolLarge" | "CUtlString" => non_special!(FieldDecoder::String),
        "CUtlBinaryBlock" => non_special!(FieldDecoder::BinaryBlock),
        // public/mathlib/vector.h
        "QAngle" => non_special!(FieldDecoder::new_qangle(field)?),
        // NOTE: not all quantized floats are actually quantized (if bit_count is 0 or 32 it's
        // not!) FieldDecoder::new_f32 will determine which kind of f32 decoder to use.
        "CNetworkedQuantizedFloat" => non_special!(FieldDecoder::new_f32(field)?),
        "GameTime_t" => non_special!(FieldDecoder::new_f32(field)?),
        // public/mathlib/vector.h
        "Vector" => non_special!(FieldDecoder::new_vector3(field)?),
        // QUOTE:
        // > this is a hack for now since VectorWS curently derives or shares the same
        // > memory layout as Vector.  Once we build a more shippable version of VectorWS
        // > we will need to add in some code to know how to convert old replay Vector to
        // > VectorWS etc.  ywb 8/15/2025
        // - https://github.com/SteamDatabase/GameTracking-Deadlock/blob/429d362a65725f0f068606a33efae46ddb3b315a/game/core/pak01_dir/scripts/replay_compatability_settings.txt#L36
        "VectorWS" => non_special!(FieldDecoder::new_vector3(field)?),
        // public/mathlib/vector2d.h
        "Vector2D" => non_special!(FieldDecoder::new_vector2(field)?),
        // public/mathlib/vector4d.h
        "Vector4D" => non_special!(FieldDecoder::new_vector4(field)?),

        // exceptional specials xd
        "m_SpeechBubbles" | "DOTA_CombatLogQueryProgress" => Ok(FieldMetadata {
            special_descriptor: Some(FieldSpecialDescriptor::DynamicSerializerArray),
            decoder: FieldDecoder::U64,
        }),

        // enums that are flagged as signed (see `proto_enum_info_t`).
        _ if field.is_signed_enum => non_special!(FieldDecoder::new_i64(field)),

        // default
        _ => non_special!(FieldDecoder::new_u64(field)),
    }
}

fn visit_template(
    expr: &Expr,
    arg: Expr,
    field: &FlattenedSerializerField,
) -> Result<FieldMetadata, FieldMetadataError> {
    // NOTE: the var type comes from the (untrusted) demo; e.g. `A*<B>` parses fine.
    let Expr::Ident(ident) = expr else {
        return Err(FieldMetadataError::UnsupportedVarType);
    };

    if matches!(
        ident,
        &"CNetworkUtlVectorBase" | &"CUtlVectorEmbeddedNetworkVar" | &"CUtlVector"
    ) {
        if field.field_serializer_name.is_some() {
            return Ok(FieldMetadata {
                special_descriptor: Some(FieldSpecialDescriptor::DynamicSerializerArray),
                decoder: FieldDecoder::U64,
            });
        }

        return visit_any(arg, field).map(|field_metadata| FieldMetadata {
            special_descriptor: Some(FieldSpecialDescriptor::DynamicArray {
                decoder: field_metadata.decoder,
            }),
            decoder: FieldDecoder::U64,
        });
    }

    visit_ident(ident, field)
}

fn visit_array(
    expr: Expr,
    len: &Expr,
    field: &FlattenedSerializerField,
) -> Result<FieldMetadata, FieldMetadataError> {
    if let Expr::Ident(ident) = expr
        && ident == "char"
    {
        return Ok(FieldMetadata {
            special_descriptor: None,
            decoder: FieldDecoder::String,
        });
    }

    let length = match len {
        Expr::Ident(ident) => match ident {
            // NOTE: it seems like this was changed from array to vec, see
            // https://github.com/SteamDatabase/GameTracking-CS2/blob/6b3bf6ad44266e3ee4440a0b9b2fee1268812840/game/core/tools/demoinfo2/demoinfo2.txt#L160
            // TODO: test ability draft game
            &"MAX_ABILITY_DRAFT_ABILITIES" => Ok(48),
            _ => Err(FieldMetadataError::UnknownArrayLengthIdent(
                (*ident).to_owned(),
            )),
        },
        Expr::Lit(Lit::Num(length)) => Ok(*length),
        _ => Err(FieldMetadataError::UnsupportedVarType),
    }?;

    visit_any(expr, field).map(|field_metadata| FieldMetadata {
        special_descriptor: Some(FieldSpecialDescriptor::FixedArray { length }),
        decoder: field_metadata.decoder,
    })
}

fn visit_any(
    expr: Expr,
    field: &FlattenedSerializerField,
) -> Result<FieldMetadata, FieldMetadataError> {
    match expr {
        Expr::Ident(ident) => visit_ident(ident, field),
        Expr::Template { expr, arg } => visit_template(&expr, *arg, field),
        Expr::Array { expr, len } => visit_array(*expr, &len, field),
        Expr::Pointer(_) => Ok(POINTER),
        Expr::Lit(_) => Err(FieldMetadataError::UnsupportedVarType),
    }
}

pub(crate) fn get_field_metadata(
    field: &FlattenedSerializerField,
    var_type: &str,
) -> Result<FieldMetadata, FieldMetadataError> {
    let expr = vartype::parse(var_type)?;
    visit_any(expr, field)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unexpected_type_shapes_are_errors() {
        let field = FlattenedSerializerField::default();
        for var_type in [
            "A*<B>",
            "A<B><C>",
            "A[2]<B>",
            "CUtlVector< A*<B> >",
            "A*<B>[2]",
        ] {
            assert!(
                matches!(
                    get_field_metadata(&field, var_type),
                    Err(FieldMetadataError::UnsupportedVarType)
                ),
                "{var_type}"
            );
        }
        assert!(get_field_metadata(&field, "CUtlVector< int32 >").is_ok());
        assert!(get_field_metadata(&field, "uint8[4]").is_ok());
        assert!(get_field_metadata(&field, "CBodyComponent*").is_ok());
    }
}
