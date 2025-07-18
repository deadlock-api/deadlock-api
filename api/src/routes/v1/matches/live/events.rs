use core::time::Duration;

use async_stream::try_stream;
use axum::extract::{Path, State};
use axum::response::sse::{Event, KeepAlive};
use axum::response::{IntoResponse, Sse};
use futures::{Stream, TryStreamExt};
use haste::broadcast::BroadcastHttp;
use haste::parser::Parser;
use tracing::{debug, error, info, warn};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live::parser::StreamParseError;
use crate::routes::v1::matches::live::parser::visitor::EventVisitor;
use crate::routes::v1::matches::live::url::spectate_match;
use crate::routes::v1::matches::types::MatchIdQuery;

async fn demo_event_stream(
    match_id: u64,
) -> Result<impl Stream<Item = Result<Event, StreamParseError>>, StreamParseError> {
    let client = reqwest::Client::new();
    let demo_stream = BroadcastHttp::start_streaming(
        client,
        format!("https://dist1-ord1.steamcontent.com/tv/{match_id}"),
    )
    .await?;
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    let visitor = EventVisitor::new(sender.clone());
    let mut parser = Parser::from_stream_with_visitor(demo_stream, visitor)?;
    tokio::spawn(async move {
        loop {
            let demo_stream = parser.demo_stream_mut();
            debug!("Waiting for next packet in demo stream");
            match demo_stream.next_packet().await {
                Some(Ok(_)) => {
                    if let Err(e) = parser.run_to_end().await {
                        error!("Error while parsing demo stream: {e}");
                        return;
                    }
                }
                Some(Err(err)) => {
                    error!("Error while parsing demo stream: {err}");
                }
                None => {
                    debug!("Demo stream ended");
                    if let Err(e) = sender.send(Event::default().data("end").event("end")) {
                        warn!("Failed to send end event: {e}");
                    }
                    break;
                }
            }
        }
    });
    Ok(try_stream! {
        info!("Starting to parse demo stream for match {match_id}");
        while let Some(event) = receiver.recv().await {
            yield event;
        }
    })
}

#[utoipa::path(
    get,
    path = "/demo/events",
    params(MatchIdQuery),
    responses(
        (status = OK, description = "Live demo events stream over SSE."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR)
    ),
    tags = ["Matches"],
    summary = "Live Demo",
    description = "Streams events from the spectator stream over SSE."
)]
pub(super) async fn events(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
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
    if state.steam_client.live_demo_exists(match_id).await.is_err() {
        info!("Spectating match {match_id}");
        spectate_match(&state.steam_client, match_id).await?;
        // Wait for the demo to be available
        tryhard::retry_fn(|| state.steam_client.live_demo_exists(match_id))
            .retries(60)
            .fixed_backoff(Duration::from_millis(500))
            .await?;
    }

    info!("Demo available for match {match_id}");
    let stream = demo_event_stream(match_id)
        .await
        .map_err(|e| APIError::internal(e.to_string()))?
        .inspect_err(|e| error!("Error in demo event stream: {e}"));

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
