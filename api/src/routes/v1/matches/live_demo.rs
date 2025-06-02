use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::live_url::spectate_match;
use crate::routes::v1::matches::types::MatchIdQuery;
use async_stream::try_stream;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use bytes::Bytes;
use futures::Stream;
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use std::time::Duration;
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
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    spectate_match(&state.steam_client, match_id).await?;

    // Wait for the demo to be available
    tryhard::retry_fn(|| async {
        state
            .http_client
            .head(format!(
                "https://dist1-ord1.steamcontent.com/tv/{}/sync",
                match_id
            ))
            .send()
            .await
            .and_then(|resp| resp.error_for_status())
    })
    .retries(20)
    .fixed_backoff(Duration::from_millis(200))
    .await?;

    let stream = demo_stream(match_id).await;
    Ok(Body::from_stream(stream))
}
