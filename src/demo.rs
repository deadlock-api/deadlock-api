use core::time::Duration;

use async_stream::try_stream;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use bytes::Bytes;
use futures::Stream;
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use serde::Deserialize;
use tracing::info;

use crate::error::APIResult;
use crate::state::AppState;
use crate::utils::{spectate_match, wait_for_live_demo};

fn demo_stream(
    broadcast_url: impl Into<String>,
) -> impl Stream<Item = Result<Bytes, BroadcastHttpClientError<reqwest::Error>>> {
    let client = reqwest::Client::new();
    try_stream! {
        let mut demofile = BroadcastHttp::start_streaming(
            client,
            broadcast_url,
        ).await?;
        while let Some(chunk) = demofile.next_packet().await {
            info!("Received chunk");
            yield chunk?;
        }
    }
}

pub(super) async fn demo(
    Path(match_id): Path<u64>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    info!("Spectating match {match_id}");
    let response = tryhard::retry_fn(|| {
        spectate_match(
            &state.http_client,
            match_id,
            state.config.deadlock_api_key.as_ref().map(AsRef::as_ref),
        )
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(200))
    .await?;

    wait_for_live_demo(&state.http_client, &response.broadcast_url).await?;

    Ok(Body::from_stream(demo_stream(response.broadcast_url)))
}

#[derive(Deserialize)]
pub(super) struct BroadcastDemoQuery {
    broadcast_url: String,
}

pub(super) async fn demo_by_broadcast_url(
    Query(query): Query<BroadcastDemoQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    info!("Connecting to broadcast URL: {}", query.broadcast_url);
    wait_for_live_demo(&state.http_client, &query.broadcast_url).await?;

    Ok(Body::from_stream(demo_stream(query.broadcast_url)))
}
