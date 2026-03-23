use core::time::Duration;
use std::string::ToString;

use async_stream::try_stream;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::sse::{Event, KeepAlive};
use axum::response::{IntoResponse, Sse};
use futures::{Stream, TryStreamExt};
use haste::broadcast::BroadcastHttp;
use haste::parser::Parser;
use serde::{Deserialize, Serialize};
use serde_json::json;
use strum::VariantArray;
use tracing::{debug, error, info, warn};

use crate::demo_parser::entity_events::EntityType;
use crate::demo_parser::error::DemoParseError;
use crate::demo_parser::visitor::SendingVisitor;
use crate::error::{APIError, APIResult};
use crate::state::AppState;
use crate::utils::{self, comma_separated_deserialize_option};

#[derive(Serialize, Deserialize)]
pub(super) struct DemoEventsQuery {
    /// Subscribe to chat messages.
    #[serde(default)]
    subscribed_chat_messages: Option<bool>,
    /// Comma separated list of entities to subscribe to.
    #[serde(default, deserialize_with = "comma_separated_deserialize_option")]
    subscribed_entities: Option<Vec<EntityType>>,
}

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
        .chain(
            ["tick_end", "hero_killed", "end"]
                .into_iter()
                .map(ToString::to_string),
        )
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
    broadcast_url: impl Into<String>,
    query: DemoEventsQuery,
) -> Result<impl Stream<Item = Result<Event, DemoParseError>>, DemoParseError> {
    let client = reqwest::Client::new();
    let demo_stream = BroadcastHttp::start_streaming(client, broadcast_url).await?;
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    let visitor = SendingVisitor::new(
        sender.clone(),
        query.subscribed_chat_messages.unwrap_or_default(),
        query.subscribed_entities,
    );
    let mut parser = Parser::from_stream_with_visitor(demo_stream, visitor)?;
    tokio::spawn(async move {
        loop {
            if sender.is_closed() {
                warn!("Channel closed, ending demo stream");
                break;
            }
            let demo_stream = parser.demo_stream_mut();
            debug!("Waiting for next packet in demo stream");
            match demo_stream.next_packet().await {
                Some(Ok(_)) => {
                    if let Err(e) = parser.run_to_end().await {
                        error!("Error while parsing demo stream: {e}");
                        break;
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
        info!("Starting to parse demo stream");
        yield send_info_event()?;
        while let Some(event) = receiver.recv().await {
            yield event;
        }
    })
}

fn events_response(
    stream: impl Stream<Item = Result<Event, DemoParseError>> + Send + 'static,
) -> impl IntoResponse {
    let headers = HeaderMap::from_iter([
        (
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/event-stream"),
        ),
        (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        (header::CONNECTION, HeaderValue::from_static("keep-alive")),
    ]);

    (headers, Sse::new(stream).keep_alive(KeepAlive::default()))
}

pub(super) async fn events(
    Path(match_id): Path<u64>,
    Query(body): Query<DemoEventsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    info!("Spectating match {match_id}");
    let response = tryhard::retry_fn(|| {
        utils::spectate_match(
            &state.http_client,
            match_id,
            state.config.deadlock_api_key.as_ref().map(AsRef::as_ref),
        )
    })
    .retries(3)
    .fixed_backoff(Duration::from_millis(200))
    .await?;

    utils::wait_for_live_demo(&state.http_client, &response.broadcast_url).await?;

    info!("Demo available for match {match_id}");
    let stream = demo_event_stream(response.broadcast_url, body)
        .await
        .map_err(|e| APIError::internal(e.to_string()))?
        .inspect_err(|e| error!("Error in demo event stream: {e}"));

    Ok(events_response(stream))
}

#[derive(Deserialize)]
pub(super) struct BroadcastEventsQuery {
    broadcast_url: String,
    #[serde(flatten)]
    query: DemoEventsQuery,
}

pub(super) async fn events_by_broadcast_url(
    Query(query): Query<BroadcastEventsQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    info!("Connecting to broadcast URL: {}", query.broadcast_url);
    utils::wait_for_live_demo(&state.http_client, &query.broadcast_url).await?;

    let stream = demo_event_stream(query.broadcast_url, query.query)
        .await
        .map_err(|e| APIError::internal(e.to_string()))?
        .inspect_err(|e| error!("Error in demo event stream: {e}"));

    Ok(events_response(stream))
}
