use axum::Json;
use axum::response::IntoResponse;

use crate::error::APIResult;

const BIG_PATCH_DAYS: &[&str] = &[
    "2025-07-29T22:22:52Z",
    "2025-07-04T20:03:43Z",
    "2025-05-08T19:43:20Z",
    "2025-02-25T21:51:13Z",
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
    summary = "Big Days",
    description = r#"
Returns a list of dates where Deadlock's "big" patch days were, usually bi-weekly.
The exact date is the time when the announcement forum post was published.

This list is manually maintained, and so new patch dates may be delayed by a few hours.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 100req/s |
| Key | - |
| Global | - |
    "#,
)]
pub(super) async fn big_patch_days() -> APIResult<impl IntoResponse> {
    Ok(Json(BIG_PATCH_DAYS))
}
