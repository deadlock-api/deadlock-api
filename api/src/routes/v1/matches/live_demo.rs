use crate::routes::v1::matches::types::MatchIdQuery;
use async_stream::try_stream;
use axum::body::Body;
use axum::extract::Path;
use axum::response::IntoResponse;
use bytes::Bytes;
use futures::Stream;
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use tracing::{error, info};

async fn demo_stream(
    match_id: u64,
) -> impl Stream<Item = Result<Bytes, BroadcastHttpClientError<reqwest::Error>>> {
    let client = reqwest::Client::new();
    try_stream! {
        let mut demofile = match BroadcastHttp::start_streaming(
            client,
            format!("https://dist1-ord1.steamcontent.com/tv/{match_id}"),
        ).await{
            Ok(demofile) => Ok(demofile),
            Err(e) => {
                error!("Failed to start streaming: {e:?}");
                Err(e)
            }
        }?;
        while let Some(chunk) = demofile.next_packet().await {
            info!("Received chunk");
            yield chunk?;
        }
    }
}

#[utoipa::path(
    get,
    path = "/{match_id}/demo/live",
    params(MatchIdQuery),
    responses(
        (status = OK, body = [u8], description = "Live demo stream."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR)
    ),
    tags = ["Matches"],
    summary = "Live Demo",
    description = "Streams the live demo of a match."
)]
pub(super) async fn live_demo(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
) -> impl IntoResponse {
    let stream = demo_stream(match_id).await;
    Body::from_stream(stream)
}
