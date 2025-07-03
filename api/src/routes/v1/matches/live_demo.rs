use crate::context::AppState;
use crate::error::APIResult;
use crate::routes::v1::matches::live_url::spectate_match;
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use async_stream::try_stream;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use bytes::Bytes;
use core::time::Duration;
use futures::Stream;
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use tracing::{error, info};

fn demo_stream(
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
    description = "
Streams the live demo of a match.

### Rate Limits:
| Type | Limit |
| ---- | ----- |
| IP | 10req/30mins |
| Key | 60req/min |
| Global | 100req/10s |
    "
)]
pub(super) async fn live_demo(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    rate_limit_key: RateLimitKey,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "spectate",
            &[
                Quota::ip_limit(10, Duration::from_secs(30 * 60)),
                Quota::key_limit(60, Duration::from_secs(60)),
                Quota::global_limit(100, Duration::from_secs(10)),
            ],
        )
        .await?;

    spectate_match(&state.steam_client, match_id).await?;

    // Wait for the demo to be available
    tryhard::retry_fn(|| state.steam_client.live_demo_exists(match_id))
        .retries(20)
        .fixed_backoff(Duration::from_millis(200))
        .await?;

    let stream = demo_stream(match_id);
    Ok(Body::from_stream(stream))
}
