use std::sync::Arc;

use datafusion::arrow::datatypes::{DataType, Field};

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum FieldType {
    Scalar(DataType),
    Vector2 {
        base: DataType,
    },
    Vector3 {
        base: DataType,
    },
    Vector4 {
        base: DataType,
    },
    FixedArray {
        element: Box<FieldType>,
        length: usize,
    },
    DynamicArray {
        element: Box<FieldType>,
    },
    Nested {
        serializer_name: String,
    },
}

impl FieldType {
    pub(crate) fn to_arrow_type(&self) -> DataType {
        match self {
            FieldType::Scalar(dt) => dt.clone(),
            FieldType::Vector2 { base }
            | FieldType::Vector3 { base }
            | FieldType::Vector4 { base } => base.clone(),
            FieldType::FixedArray { element, length } => {
                #[allow(
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
            FieldType::DynamicArray { element } => {
                DataType::List(Arc::new(Field::new("item", element.to_arrow_type(), true)))
            }
            FieldType::Nested { .. } => DataType::Null,
        }
    }

    pub(crate) fn component_suffixes(&self) -> &'static [&'static str] {
        match self {
            FieldType::Vector2 { .. } => &["__x", "__y"],
            FieldType::Vector3 { .. } => &["__x", "__y", "__z"],
            FieldType::Vector4 { .. } => &["__x", "__y", "__z", "__w"],
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

        "float32" | "float" | "GameTime_t" | "GameTick_t" => FieldType::Scalar(DataType::Float32),

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
                    serializer_name: var_type.to_string(),
                }
            } else {
                FieldType::Scalar(DataType::Binary)
            }
        }
    }
}

fn extract_generic<'a>(var_type: &'a str, generic_name: &str) -> Option<&'a str> {
    if var_type.starts_with(generic_name) && var_type.contains('<') {
        let start = var_type.find('<')? + 1;
        let end = var_type.rfind('>')?;
        if start < end {
            return Some(&var_type[start..end]);
        }
    }
    None
}

fn extract_fixed_array(var_type: &str) -> Option<(&str, usize)> {
    if var_type.ends_with(']') {
        let bracket_start = var_type.rfind('[')?;
        let element_type = &var_type[..bracket_start];
        let length_str = &var_type[bracket_start + 1..var_type.len() - 1];
        let length = length_str.parse().ok()?;
        Some((element_type, length))
    } else {
        None
    }
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
