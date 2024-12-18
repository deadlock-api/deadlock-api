use axum::Json;

#[utoipa::path(
    get,
    path = "/big-patch-days",
    responses((status = OK, body = [String])),
    tags = ["V1"],
)]
pub async fn big_patch_days() -> Json<Vec<&'static str>> {
    Json(vec![
        "2024-12-06T20:05:10Z",
        "2024-11-21T23:21:49Z",
        "2024-11-07T21:31:34Z",
        "2024-10-24T19:39:08Z",
        "2024-10-10T20:24:45Z",
        "2024-09-26T21:17:58Z",
    ])
}
