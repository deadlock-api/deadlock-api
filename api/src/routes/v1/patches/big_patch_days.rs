use crate::error::APIResult;
use axum::response::IntoResponse;
use axum::Json;

const BIG_PATCH_DAYS: &[&str] = &[
    "2025-01-28T02:10:06Z",
    "2025-01-17T18:40:54Z",
    "2024-12-06T20:05:10Z",
    "2024-11-21T23:21:49Z",
    "2024-11-07T21:31:34Z",
    "2024-10-24T19:39:08Z",
    "2024-10-10T20:24:45Z",
    "2024-09-26T21:17:58Z",
];

#[utoipa::path(
    get,
    path = "/big-days",
    responses((status = OK, body = [String])),
    tags = ["Patches"],
    summary = "Big Patch Days",
    description = r#"
Returns a list of dates where Deadlock's "big" patch days were, usually bi-weekly.
The exact date is the time when the announcement forum post was published.

This list is manually maintained, and so new patch dates may be delayed by a few hours.
    "#,
)]
pub async fn big_patch_days() -> APIResult<impl IntoResponse> {
    Ok(Json(BIG_PATCH_DAYS))
}
