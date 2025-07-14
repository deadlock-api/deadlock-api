use core::time::Duration;

use async_stream::try_stream;
use axum::extract::{Path, State};
use axum::response::sse::{Event, KeepAlive};
use axum::response::{IntoResponse, Sse};
use futures::{Stream, TryStreamExt};
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use haste::demofile::DemoHeaderError;
use haste::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};
use haste::entities::{DeltaHeader, Entity};
use haste::flattenedserializers::FlattenedSerializersError;
use haste::fxhash;
use haste::parser::{Context, Parser, Visitor};
use serde_json::json;
use tokio::sync::mpsc::UnboundedSender;
use tokio::sync::mpsc::error::SendError;
use tracing::{debug, error, info};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::matches::live::url::spectate_match;
use crate::routes::v1::matches::types::MatchIdQuery;

#[derive(thiserror::Error, Debug)]
enum StreamParseError {
    #[error(transparent)]
    Send(#[from] SendError<Event>),
    #[error(transparent)]
    Broadcast(#[from] BroadcastHttpClientError<reqwest::Error>),
    #[error(transparent)]
    DemoHeader(#[from] DemoHeaderError),
    #[error(transparent)]
    ReadCmdHeader(#[from] ReadCmdHeaderError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    DecodeCmd(#[from] DecodeCmdError),
    #[error(transparent)]
    ReadCmd(#[from] ReadCmdError),
    #[error(transparent)]
    ParseInt(#[from] core::num::ParseIntError),
    #[error(transparent)]
    Protobuf(#[from] prost::DecodeError),
    #[error(transparent)]
    Decompress(#[from] snap::Error),
    #[error(transparent)]
    FlattenedSerializers(#[from] FlattenedSerializersError),
    #[error(transparent)]
    SSEEvent(#[from] axum_core::Error),
}

struct MyVisitor {
    sender: UnboundedSender<Event>,
}

impl MyVisitor {
    fn new(sender: UnboundedSender<Event>) -> Self {
        MyVisitor { sender }
    }
}

impl Visitor for MyVisitor {
    type Error = StreamParseError;

    async fn on_entity(
        &mut self,
        _ctx: &Context,
        _delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        // TODO: All the Hashes should be constants
        if entity.serializer_name_heq(fxhash::hash_bytes(b"CCitadelPlayerController")) {
            let steam_id: u64 = entity
                .get_value(&fxhash::hash_bytes(b"m_steamID"))
                .unwrap_or_default();
            if steam_id == 0 {
                return Ok(());
            }
            let steam_name: String = entity
                .get_value(&fxhash::hash_bytes(b"m_iszPlayerName"))
                .unwrap_or_default();
            let hero_build_id: u64 = entity
                .get_value(&fxhash::hash_bytes(b"m_unHeroBuildID"))
                .unwrap_or_default();
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "entity_id": entity.index(),
                        "steam_id": steam_id,
                        "steam_name": steam_name,
                        "hero_build_id": hero_build_id,
                    }))?
                    .event("entity_update"),
            )?;
        }
        Ok(())
    }

    async fn on_cmd(
        &mut self,
        _ctx: &Context,
        _cmd_header: &CmdHeader,
        _data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    async fn on_packet(
        &mut self,
        _ctx: &Context,
        _packet_type: u32,
        _data: &[u8],
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    async fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        self.sender.send(
            Event::default()
                .data(ctx.tick().to_string())
                .event("tick_end"),
        )?;
        Ok(())
    }
}

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
    let visitor = MyVisitor::new(sender);
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
        (status = OK, body = [u8], description = "Live demo stream."),
        (status = BAD_REQUEST, description = "Provided parameters are invalid."),
        (status = INTERNAL_SERVER_ERROR)
    ),
    tags = ["Matches"],
    summary = "Live Demo",
    description = "Streams the live demo of a match."
)]
pub(super) async fn events(
    Path(MatchIdQuery { match_id }): Path<MatchIdQuery>,
    State(AppState { steam_client, .. }): State<AppState>,
) -> APIResult<impl IntoResponse> {
    spectate_match(&steam_client, match_id).await?;

    // Wait for the demo to be available
    tryhard::retry_fn(|| steam_client.live_demo_exists(match_id))
        .retries(60)
        .fixed_backoff(Duration::from_millis(500))
        .await?;

    let stream = demo_event_stream(match_id)
        .await
        .map_err(|e| APIError::internal(e.to_string()))?
        .inspect_err(|e| error!("Error in demo event stream: {e}"));

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
