use core::time::Duration;
use std::string::ToString;

use async_stream::try_stream;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::sse::{Event, KeepAlive};
use axum::response::{IntoResponse, Sse};
use cached::proc_macro::once;
use futures::{Stream, TryStreamExt};
use haste::broadcast::BroadcastHttp;
use haste::parser::Parser;
use serde::{Deserialize, Serialize};
use serde_json::json;
use strum::VariantArray;
use tracing::{debug, error, info, warn};
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live::url::spectate_match;
use crate::routes::v1::matches::types::MatchIdQuery;
use crate::services::rate_limiter::Quota;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::utils::demo_parser::entity_events::EntityType;
use crate::utils::demo_parser::error::DemoParseError;
use crate::utils::demo_parser::types::DemoEvent;
use crate::utils::demo_parser::visitor::SendingVisitor;
use crate::utils::parse::comma_separated_deserialize_option;

#[derive(Serialize, Deserialize, IntoParams, ToSchema)]
pub(super) struct DemoEventsQuery {
    /// Comma separated list of entities to subscribe to.
    #[param(default, inline)]
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    pub(super) subscribed_entities: Option<Vec<EntityType>>,
}

#[once]
fn all_sse_events() -> Vec<String> {
    EntityType::VARIANTS
        .iter()
        .flat_map(|e| {
            [
                format!("{e}_entity_created"),
                format!("{e}_entity_updated"),
                format!("{e}_entity_deleted"),
            ]
        })
        .chain(["tick_end", "end"].into_iter().map(ToString::to_string))
        .collect()
}

fn send_info_event() -> Result<Event, axum::Error> {
    Event::default().event("message").json_data(json!({
        "status": "connected",
        "message": "Connected to demo event stream.",
        "eventsource_disclaimer": "Server-Sent Events use various event names, so the onmessage event listener won't catch them because it only listens to the default 'message' event. I recommend using a library like sse.js.",
        "all_event_names": all_sse_events(),
    }))
}

async fn demo_event_stream(
    match_id: u64,
    query: DemoEventsQuery,
) -> Result<impl Stream<Item = Result<Event, DemoParseError>>, DemoParseError> {
    let client = reqwest::Client::new();
    let demo_stream = BroadcastHttp::start_streaming(
        client,
        format!("https://dist1-ord1.steamcontent.com/tv/{match_id}"),
    )
    .await?;
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    let visitor = SendingVisitor::new(sender.clone(), query.subscribed_entities);
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
                    if let Err(e) = sender.send(Event::default().event("end").data("end")) {
                        warn!("Failed to send end event: {e}");
                    }
                    break;
                }
            }
        }
    });
    Ok(try_stream! {
        info!("Starting to parse demo stream for match {match_id}");
        yield send_info_event()?;
        while let Some(event) = receiver.recv().await {
            yield event;
        }
    })
}

#[utoipa::path(
    get,
    path = "/demo/events",
    params(MatchIdQuery, DemoEventsQuery),
    responses(
        (status = OK, body = [DemoEvent], description = "Live demo events stream over SSE."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR)
    ),
    tags = ["Matches"],
    summary = "Live Demo Events",
    description = "Streams events from the spectator stream over SSE."
)]
pub(super) async fn events(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    Query(body): Query<DemoEventsQuery>,
    rate_limit_key: RateLimitKey,
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

    state
        .rate_limit_client
        .apply_limits(
            &rate_limit_key,
            "demo_events",
            &[
                Quota::ip_limit(10, Duration::from_secs(10 * 60)),
                Quota::key_limit(120, Duration::from_secs(60 * 60)),
                Quota::global_limit(200, Duration::from_secs(60 * 60)),
            ],
        )
        .await?;

    // Check if Match is already spectated, if not, spectate it
    if !state.steam_client.live_demo_exists(match_id).await {
        info!("Spectating match {match_id}");
        tryhard::retry_fn(|| spectate_match(&state.steam_client, match_id))
            .retries(3)
            .fixed_backoff(Duration::from_millis(200))
            .await?;
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
        .await
        .map_err(|()| APIError::internal("Failed to spectate match"))?;
    }

    info!("Demo available for match {match_id}");
    let stream = demo_event_stream(match_id, body)
        .await
        .map_err(|e| APIError::internal(e.to_string()))?
        .inspect_err(|e| error!("Error in demo event stream: {e}"));

    let headers = HeaderMap::from_iter([
        (
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/event-stream"),
        ),
        (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        (header::CONNECTION, HeaderValue::from_static("keep-alive")),
    ]);

    Ok((headers, Sse::new(stream).keep_alive(KeepAlive::default())))
}
