use derive_more::Display;
use serde::Deserialize;
use utoipa::ToSchema;

#[derive(Copy, Clone, Debug, Deserialize, ToSchema, Default, Display, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SortDirectionAsc {
    /// Sort in descending order.
    #[display("desc")]
    Desc,
    /// Sort in ascending order. (default)
    #[default]
    #[display("asc")]
    Asc,
}

#[derive(Copy, Clone, Debug, Deserialize, ToSchema, Default, Display, Eq, PartialEq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SortDirectionDesc {
    /// Sort in descending order. (default)
    #[default]
    #[display("desc")]
    Desc,
    /// Sort in ascending order.
    #[display("asc")]
    Asc,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sort_direction_asc() {
        assert_eq!(SortDirectionAsc::default().to_string(), "asc");
        assert_eq!(SortDirectionAsc::Asc.to_string(), "asc");
        assert_eq!(SortDirectionAsc::Desc.to_string(), "desc");
    }

    #[test]
    fn test_sort_direction_desc() {
        assert_eq!(SortDirectionDesc::default().to_string(), "desc");
        assert_eq!(SortDirectionDesc::Desc.to_string(), "desc");
        assert_eq!(SortDirectionDesc::Asc.to_string(), "asc");
    }
}
