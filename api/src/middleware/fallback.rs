use crate::error::{APIError, APIResult};
use axum::http::{StatusCode, Uri};

pub async fn fallback(uri: Uri) -> APIResult<()> {
    Err(APIError::status_msg(
        StatusCode::NOT_FOUND,
        format!("No route found for {uri}"),
    ))
}
