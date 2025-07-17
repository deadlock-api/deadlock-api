use core::time::Duration;

use async_stream::try_stream;
use axum::extract::{Path, State};
use axum::response::sse::{Event, KeepAlive};
use axum::response::{IntoResponse, Sse};
use futures::{Stream, TryStreamExt};
use haste::broadcast::{BroadcastHttp, BroadcastHttpClientError};
use haste::demofile::DemoHeaderError;
use haste::demostream::{CmdHeader, DecodeCmdError, ReadCmdError, ReadCmdHeaderError};
use haste::entities::{
    DeltaHeader, Entity, deadlock_coord_from_cell, ehandle_to_index, fkey_from_path,
};
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

fn get_entity_coord(entity: &Entity, cell_key: u64, vec_key: u64) -> Option<f32> {
    let cell: u16 = entity.get_value(&cell_key)?;
    let vec: f32 = entity.get_value(&vec_key)?;
    let coord = deadlock_coord_from_cell(cell, vec);
    Some(coord)
}

fn get_entity_position(entity: &Entity) -> Option<[f32; 3]> {
    const CX: u64 = fkey_from_path(&["CBodyComponent", "m_cellX"]);
    const CY: u64 = fkey_from_path(&["CBodyComponent", "m_cellY"]);
    const CZ: u64 = fkey_from_path(&["CBodyComponent", "m_cellZ"]);

    const VX: u64 = fkey_from_path(&["CBodyComponent", "m_vecX"]);
    const VY: u64 = fkey_from_path(&["CBodyComponent", "m_vecY"]);
    const VZ: u64 = fkey_from_path(&["CBodyComponent", "m_vecZ"]);

    let x = get_entity_coord(entity, CX, VX)?;
    let y = get_entity_coord(entity, CY, VY)?;
    let z = get_entity_coord(entity, CZ, VZ)?;

    Some([x, y, z])
}

impl Visitor for MyVisitor {
    type Error = StreamParseError;

    async fn on_entity(
        &mut self,
        ctx: &Context,
        _delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        // TODO: All the Hashes should be constants
        if entity.serializer_name_heq(fxhash::hash_bytes(b"CCitadelPlayerController")) {
            let pawn: Option<i32> = entity
                .get_value(&fxhash::hash_bytes(b"m_hPawn"))
                .map(ehandle_to_index);
            let steam_id: Option<u64> = entity.get_value(&fxhash::hash_bytes(b"m_steamID"));
            if steam_id.is_none_or(|s| s == 0) {
                return Ok(());
            }
            let steam_name: Option<String> =
                entity.get_value(&fxhash::hash_bytes(b"m_iszPlayerName"));
            let hero_build_id: Option<u64> =
                entity.get_value(&fxhash::hash_bytes(b"m_unHeroBuildID"));
            let player_slot: Option<u8> =
                entity.get_value(&fxhash::hash_bytes(b"m_unLobbyPlayerSlot"));
            let team = entity
                .get_value::<u8>(&fxhash::hash_bytes(b"m_iTeamNum"))
                .map(|t| t - 2);
            let assigned_lane: Option<i8> =
                entity.get_value(&fxhash::hash_bytes(b"m_nAssignedLane"));
            let original_assigned_lane: Option<i8> =
                entity.get_value(&fxhash::hash_bytes(b"m_nOriginalLaneAssignment"));
            let hero_id: Option<u32> = entity.get_value(&fxhash::hash_bytes(b"m_nHeroID"));
            let net_worth: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iGoldNetWorth"));
            let kills: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iPlayerKills"));
            let assists: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iPlayerAssists"));
            let deaths: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iDeaths"));
            let denies: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iDenies"));
            let last_hits: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iLastHits"));
            let hero_healing: Option<i32> =
                entity.get_value(&fxhash::hash_bytes(b"m_iHeroHealing"));
            let self_healing: Option<i32> =
                entity.get_value(&fxhash::hash_bytes(b"m_iSelfHealing"));
            let hero_damage: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHeroDamage"));
            let objective_damage: Option<i32> =
                entity.get_value(&fxhash::hash_bytes(b"m_iObjectiveDamage"));
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "pawn": pawn,
                        "steam_id": steam_id,
                        "steam_name": steam_name,
                        "team": team,
                        "hero_id": hero_id,
                        "hero_build_id": hero_build_id,
                        "player_slot": player_slot,
                        "assigned_lane": assigned_lane,
                        "original_assigned_lane": original_assigned_lane,
                        "net_worth": net_worth,
                        "kills": kills,
                        "assists": assists,
                        "deaths": deaths,
                        "denies": denies,
                        "last_hits": last_hits,
                        "hero_healing": hero_healing,
                        "self_healing": self_healing,
                        "hero_damage": hero_damage,
                        "objective_damage": objective_damage,
                    }))?
                    .event("controller_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CCitadelPlayerPawn")) {
            let controller: Option<i32> = entity
                .get_value(&fxhash::hash_bytes(b"m_hController"))
                .map(ehandle_to_index);
            let level: i32 = entity
                .get_value(&fxhash::hash_bytes(b"m_nLevel"))
                .unwrap_or_default();
            let max_health: i32 = entity
                .get_value(&fxhash::hash_bytes(b"m_iMaxHealth"))
                .unwrap_or_default();
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let hero_id: Option<u32> = entity.get_value(&fxhash::hash_bytes(b"m_nHeroID"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let position = get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "controller": controller,
                        "team": team,
                        "hero_id": hero_id,
                        "level": level,
                        "max_health": max_health,
                        "health": health,
                        "position": position,
                    }))?
                    .event("pawn_entity_update"),
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
    // Check if Match is already spectated, if not, spectate it
    if let Err(_) = steam_client.live_demo_exists(match_id).await {
        info!("Spectating match {match_id}");
        spectate_match(&steam_client, match_id).await?;
        // Wait for the demo to be available
        tryhard::retry_fn(|| steam_client.live_demo_exists(match_id))
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
