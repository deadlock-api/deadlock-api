use crate::error::{APIError, APIResult};
use axum::http::{StatusCode, Uri};

pub async fn fallback(uri: Uri) -> APIResult<()> {
    Err(APIError::StatusMsg {
        status: StatusCode::NOT_FOUND,
        message: format!("No route found for {}", uri),
    })
}
