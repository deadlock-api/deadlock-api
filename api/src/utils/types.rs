use derive_more::Display;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(
    Copy, Clone, Debug, Serialize, Deserialize, ToSchema, Default, Display, Eq, PartialEq, Hash,
)]
#[serde(rename_all = "snake_case")]
pub enum SortDirectionAsc {
    /// Sort in descending order.
    #[display("desc")]
    Desc,
    /// Sort in ascending order. (default)
    #[default]
    #[display("asc")]
    Asc,
}

#[derive(
    Copy, Clone, Debug, Serialize, Deserialize, ToSchema, Default, Display, Eq, PartialEq, Hash,
)]
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
