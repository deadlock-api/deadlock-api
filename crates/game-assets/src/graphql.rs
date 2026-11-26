//! GraphQL scalars for the asset types, also used by the API's own GraphQL types.

use async_graphql::{InputValueError, InputValueResult, Scalar, ScalarType, Value};

/// An unsigned 32-bit integer, serialized as a JSON number.
///
/// GraphQL's `Int` is signed 32-bit, but item and ability ids are `murmurhash2` values over the
/// whole `u32` range: clients that check `Int` (graphql-js, typed clients) reject ids above
/// 2^31 (#732).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct UInt32(pub u32);

impl From<u32> for UInt32 {
    fn from(value: u32) -> Self {
        Self(value)
    }
}

#[Scalar(name = "UInt32")]
impl ScalarType for UInt32 {
    fn parse(value: Value) -> InputValueResult<Self> {
        if let Value::Number(n) = &value
            && let Some(v) = n.as_u64().and_then(|v| u32::try_from(v).ok())
        {
            return Ok(Self(v));
        }
        Err(InputValueError::expected_type(value))
    }

    fn is_valid(value: &Value) -> bool {
        matches!(value, Value::Number(n) if n.as_u64().is_some_and(|v| u32::try_from(v).is_ok()))
    }

    fn to_value(&self) -> Value {
        Value::Number(self.0.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_the_whole_range() {
        for v in [0, 2_351_041_382, u32::MAX] {
            let value = UInt32(v).to_value();
            assert_eq!(UInt32::parse(value).unwrap(), UInt32(v));
        }
    }

    #[test]
    fn rejects_out_of_range() {
        for v in [
            Value::from(-1),
            Value::from(u64::from(u32::MAX) + 1),
            Value::from(1.5),
        ] {
            assert!(!UInt32::is_valid(&v));
            UInt32::parse(v).unwrap_err();
        }
    }
}
