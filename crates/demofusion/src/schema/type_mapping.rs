use std::sync::Arc;

use datafusion::arrow::datatypes::{DataType, Field};

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum FieldType {
    Scalar(DataType),
    Vector2 { base: DataType },
    Vector3 { base: DataType },
    Vector4 { base: DataType },
    FixedArray { element: Box<Self>, length: usize },
    DynamicArray { element: Box<Self> },
    Nested { serializer_name: String },
}

impl FieldType {
    pub(crate) fn to_arrow_type(&self) -> DataType {
        match self {
            Self::Scalar(dt) => dt.clone(),
            Self::Vector2 { base } | Self::Vector3 { base } | Self::Vector4 { base } => {
                base.clone()
            }
            Self::FixedArray { element, length } => {
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_possible_wrap,
                    reason = "fixed-array length comes from proto descriptors and fits in i32"
                )]
                let length = *length as i32;
                DataType::FixedSizeList(
                    Arc::new(Field::new("item", element.to_arrow_type(), true)),
                    length,
                )
            }
            Self::DynamicArray { element } => {
                DataType::List(Arc::new(Field::new("item", element.to_arrow_type(), true)))
            }
            Self::Nested { .. } => DataType::Null,
        }
    }

    pub(crate) const fn component_suffixes(&self) -> &'static [&'static str] {
        match self {
            Self::Vector2 { .. } => &["__x", "__y"],
            Self::Vector3 { .. } => &["__x", "__y", "__z"],
            Self::Vector4 { .. } => &["__x", "__y", "__z", "__w"],
            _ => &[""],
        }
    }
}

pub(crate) fn parse_var_type(var_type: &str) -> FieldType {
    let var_type = var_type.trim();

    if let Some(inner) = extract_generic(var_type, "CNetworkUtlVectorBase") {
        return FieldType::DynamicArray {
            element: Box::new(parse_var_type(inner)),
        };
    }

    if let Some(inner) = extract_generic(var_type, "CUtlVectorEmbeddedNetworkVar") {
        return FieldType::DynamicArray {
            element: Box::new(parse_var_type(inner)),
        };
    }

    if extract_generic(var_type, "CHandle").is_some() {
        return FieldType::Scalar(DataType::UInt32);
    }

    if extract_generic(var_type, "CStrongHandle").is_some() {
        return FieldType::Scalar(DataType::UInt64);
    }

    // Fixed-size C strings (e.g. `char[128]` player names) are one string, not an array.
    if var_type.starts_with("char[") {
        return FieldType::Scalar(DataType::Utf8);
    }

    if let Some((element_type, length)) = extract_fixed_array(var_type) {
        return FieldType::FixedArray {
            element: Box::new(parse_var_type(element_type)),
            length,
        };
    }

    match var_type {
        "int8" | "int16" | "int32" | "int64" => FieldType::Scalar(DataType::Int64),

        "uint8" | "uint16" | "uint32" | "uint64" | "CEntityIndex" => {
            FieldType::Scalar(DataType::UInt64)
        }

        "float32" | "float" | "GameTime_t" | "GameTick_t" | "CNetworkedQuantizedFloat" => {
            FieldType::Scalar(DataType::Float32)
        }

        "float64" | "double" => FieldType::Scalar(DataType::Float64),

        "bool" => FieldType::Scalar(DataType::Boolean),

        "CUtlString" | "CUtlStringToken" | "CUtlSymbolLarge" | "char*" => {
            FieldType::Scalar(DataType::Binary)
        }

        "Vector" | "Vector3D" | "QAngle" => FieldType::Vector3 {
            base: DataType::Float32,
        },

        "Vector2D" => FieldType::Vector2 {
            base: DataType::Float32,
        },

        "Vector4D" | "Quaternion" => FieldType::Vector4 {
            base: DataType::Float32,
        },

        "Color" => FieldType::Scalar(DataType::UInt32),

        "HSequence" | "AbilityID_t" | "ItemDefID_t" | "HeroID_t" => {
            FieldType::Scalar(DataType::Int32)
        }

        _ => {
            if var_type.starts_with('C') && var_type.chars().nth(1).is_some_and(char::is_uppercase)
            {
                FieldType::Nested {
                    serializer_name: var_type.to_owned(),
                }
            } else {
                FieldType::Scalar(DataType::Binary)
            }
        }
    }
}

fn extract_generic<'a>(var_type: &'a str, generic_name: &str) -> Option<&'a str> {
    if !var_type.starts_with(generic_name) {
        return None;
    }
    let (_, rest) = var_type.split_once('<')?;
    let (inner, _) = rest.rsplit_once('>')?;
    (!inner.is_empty()).then_some(inner)
}

fn extract_fixed_array(var_type: &str) -> Option<(&str, usize)> {
    let (element_type, length_str) = var_type.strip_suffix(']')?.rsplit_once('[')?;
    let length = length_str.parse().ok()?;
    Some((element_type, length))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_scalar_types() {
        assert_eq!(parse_var_type("int32"), FieldType::Scalar(DataType::Int64));
        assert_eq!(
            parse_var_type("uint64"),
            FieldType::Scalar(DataType::UInt64)
        );
        assert_eq!(
            parse_var_type("float32"),
            FieldType::Scalar(DataType::Float32)
        );
        assert_eq!(parse_var_type("bool"), FieldType::Scalar(DataType::Boolean));
    }

    #[test]
    fn test_parse_quantized_float_and_char_string() {
        // CBodyComponent.m_vecX/Y/Z (positions within a cell)
        assert_eq!(
            parse_var_type("CNetworkedQuantizedFloat"),
            FieldType::Scalar(DataType::Float32)
        );
        // CCitadelPlayerController.m_iszPlayerName
        assert_eq!(
            parse_var_type("char[128]"),
            FieldType::Scalar(DataType::Utf8)
        );
    }

    #[test]
    fn test_parse_vector_types() {
        assert_eq!(
            parse_var_type("Vector"),
            FieldType::Vector3 {
                base: DataType::Float32
            }
        );
        assert_eq!(
            parse_var_type("Vector2D"),
            FieldType::Vector2 {
                base: DataType::Float32
            }
        );
        assert_eq!(
            parse_var_type("QAngle"),
            FieldType::Vector3 {
                base: DataType::Float32
            }
        );
    }

    #[test]
    fn test_parse_handle_types() {
        assert_eq!(
            parse_var_type("CHandle<CBaseEntity>"),
            FieldType::Scalar(DataType::UInt32)
        );
        assert_eq!(
            parse_var_type("CStrongHandle<InfoForResourceTypeIMaterial2>"),
            FieldType::Scalar(DataType::UInt64)
        );
    }

    #[test]
    fn test_parse_dynamic_array() {
        match parse_var_type("CNetworkUtlVectorBase<int32>") {
            FieldType::DynamicArray { element } => {
                assert_eq!(*element, FieldType::Scalar(DataType::Int64));
            }
            _ => panic!("Expected DynamicArray"),
        }
    }

    #[test]
    fn test_parse_fixed_array() {
        match parse_var_type("float32[3]") {
            FieldType::FixedArray { element, length } => {
                assert_eq!(*element, FieldType::Scalar(DataType::Float32));
                assert_eq!(length, 3);
            }
            _ => panic!("Expected FixedArray"),
        }
    }

    #[test]
    fn test_component_suffixes() {
        let v3 = FieldType::Vector3 {
            base: DataType::Float32,
        };
        assert_eq!(v3.component_suffixes(), &["__x", "__y", "__z"]);

        let scalar = FieldType::Scalar(DataType::Int64);
        assert_eq!(scalar.component_suffixes(), &[""]);
    }
}
