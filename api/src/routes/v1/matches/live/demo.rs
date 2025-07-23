use core::time::Duration;

use async_stream::try_stream;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use bytes::Bytes;
use futures::Stream;
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use tracing::info;

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live::url::spectate_match;
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;

fn demo_stream(
    match_id: u64,
) -> impl Stream<Item = Result<Bytes, BroadcastHttpClientError<reqwest::Error>>> {
    let client = reqwest::Client::new();
    try_stream! {
        let mut demofile = BroadcastHttp::start_streaming(
            client,
            format!("https://dist1-ord1.steamcontent.com/tv/{match_id}"),
        ).await?;
        while let Some(chunk) = demofile.next_packet().await {
            info!("Received chunk");
            yield chunk?;
        }
    }
}

#[utoipa::path(
    get,
    path = "/demo",
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
pub(crate) async fn demo(
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

    // Check if the match could be live, by checking the match id from a match 4 hours ago
    let match_id_4_hours_ago = state
        .ch_client
        .query(
            "SELECT match_id FROM match_info WHERE created_at < now() - INTERVAL 4 HOUR ORDER BY \
             match_id DESC LIMIT 1",
        )
        .fetch_one::<u64>()
        .await?;

    if match_id < match_id_4_hours_ago {
        return Err(APIError::status_msg(
            reqwest::StatusCode::BAD_REQUEST,
            format!("Match {match_id} cannot be live"),
        ));
    }

    // Check if Match is already spectated, if not, spectate it
    if !state.steam_client.live_demo_exists(match_id).await {
        info!("Spectating match {match_id}");
        spectate_match(&state.steam_client, match_id).await?;
        // Wait for the demo to be available
        tryhard::retry_fn(|| async {
            state
                .steam_client
                .live_demo_exists(match_id)
                .await
                .then_some(())
                .ok_or(())
        })
        .retries(60)
        .fixed_backoff(Duration::from_millis(500))
        .await?;
    }

    let stream = demo_stream(match_id);
    Ok(Body::from_stream(stream))
}
