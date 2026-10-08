use async_stream::try_stream;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use bytes::Bytes;
use futures::Stream;
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use serde::Deserialize;
use tracing::{info, trace};

use crate::error::APIResult;
use crate::state::AppState;
use crate::utils::{match_broadcast_url, validate_broadcast_url, wait_for_live_demo};

fn demo_stream(
    client: reqwest::Client,
    broadcast_url: impl Into<String>,
) -> impl Stream<Item = Result<Bytes, BroadcastHttpClientError<reqwest::Error>>> {
    try_stream! {
        let mut demofile = BroadcastHttp::start_streaming(
            client,
            broadcast_url,
        ).await?;
        while let Some(chunk) = demofile.next_packet().await {
            trace!("Received chunk");
            yield chunk?;
        }
    }
}

pub(super) async fn demo(
    Path(match_id): Path<u64>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let broadcast_url = match_broadcast_url(&state, match_id).await?;
    Ok(Body::from_stream(demo_stream(
        state.http_client.clone(),
        broadcast_url,
    )))
}

#[derive(Deserialize)]
pub(super) struct BroadcastDemoQuery {
    broadcast_url: String,
}

pub(super) async fn demo_by_broadcast_url(
    Query(query): Query<BroadcastDemoQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    validate_broadcast_url(&query.broadcast_url)?;
    info!("Connecting to broadcast URL: {}", query.broadcast_url);
    wait_for_live_demo(&state.http_client, &query.broadcast_url).await?;

    Ok(Body::from_stream(demo_stream(
        state.http_client.clone(),
        query.broadcast_url,
    )))
}
