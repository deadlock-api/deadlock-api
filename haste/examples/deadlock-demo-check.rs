//! parses a deadlock demo end to end and prints a few sanity checks: server-announced encoding
//! params, player state every 5 minutes (positions, health, hero ids, net worth) and a histogram of
//! packet message types. handy to verify that haste still copes with a new game build.
//!
//! ```console
//! $ cargo run --release -p haste --example deadlock-demo-check -- <path-to-dem-file>
//! ```

use std::collections::BTreeMap;
use std::fs::File;
use std::io::BufReader;

use haste::demofile::DemoFile;
use haste::entities::{DeltaHeader, Entity, fkey_from_path};
use haste::fxhash;
use haste::parser::{Context, Parser, Visitor};
use haste::valveprotos::common::{CsvcMsgServerInfo, SvcMessages};
use prost::Message;

const CELL_X: u64 = fkey_from_path(&["CBodyComponent", "m_cellX"]);
const CELL_Y: u64 = fkey_from_path(&["CBodyComponent", "m_cellY"]);
const CELL_Z: u64 = fkey_from_path(&["CBodyComponent", "m_cellZ"]);
const VEC_X: u64 = fkey_from_path(&["CBodyComponent", "m_vecX"]);
const VEC_Y: u64 = fkey_from_path(&["CBodyComponent", "m_vecY"]);
const VEC_Z: u64 = fkey_from_path(&["CBodyComponent", "m_vecZ"]);
const HEALTH: u64 = fkey_from_path(&["m_iHealth"]);
const MAX_HEALTH: u64 = fkey_from_path(&["m_iMaxHealth"]);
const TEAM: u64 = fkey_from_path(&["m_iTeamNum"]);
const LIFE_STATE: u64 = fkey_from_path(&["m_lifeState"]);
const HERO_ID: u64 = fkey_from_path(&["m_CCitadelHeroComponent", "m_spawnedHero", "m_nHeroID"]);
const PLAYER_NAME: u64 = fkey_from_path(&["m_iszPlayerName"]);
const NET_WORTH: u64 = fkey_from_path(&["m_PlayerDataGlobal", "m_iGoldNetWorth"]);

/// report player state every 5 minutes.
const REPORT_INTERVAL_SECS: f32 = 5.0 * 60.0;

#[derive(Default)]
struct MyVisitor {
    packets: BTreeMap<u32, (usize, usize)>,
    entity_updates: usize,
}

impl MyVisitor {
    fn print_players(ctx: &Context) {
        let Some(entities) = ctx.entities() else {
            return;
        };
        println!("== tick {}", ctx.tick());
        for (index, entity) in entities.iter() {
            if entity.serializer_name_heq(fxhash::hash_bytes(b"CCitadelPlayerController")) {
                println!(
                    "controller {index}: name={:?} net_worth={:?}",
                    entity.get_value::<String>(&PLAYER_NAME),
                    entity.get_value::<i32>(&NET_WORTH),
                );
            } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CCitadelPlayerPawn")) {
                let coord = |cell_key, vec_key| -> Option<f32> {
                    Some(ctx.deadlock_coord_from_cell(
                        entity.get_value(&cell_key)?,
                        entity.get_value(&vec_key)?,
                    ))
                };
                println!(
                    "pawn {index}: pos=({:?}, {:?}, {:?}) health={:?}/{:?} team={:?} hero={:?} life_state={:?}",
                    coord(CELL_X, VEC_X),
                    coord(CELL_Y, VEC_Y),
                    coord(CELL_Z, VEC_Z),
                    entity.get_value::<i32>(&HEALTH),
                    entity.get_value::<i32>(&MAX_HEALTH),
                    entity.get_value::<u64>(&TEAM),
                    entity.get_value::<u32>(&HERO_ID),
                    entity.get_value::<u64>(&LIFE_STATE),
                );
            }
        }
    }
}

impl Visitor for MyVisitor {
    type Error = std::io::Error;

    fn on_packet(
        &mut self,
        _ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        let entry = self.packets.entry(packet_type).or_default();
        entry.0 += 1;
        entry.1 += data.len();

        if packet_type == SvcMessages::SvcServerInfo as u32 {
            let msg = CsvcMsgServerInfo::decode(data).map_err(std::io::Error::other)?;
            if let Some(config) = msg.game_session_config {
                println!("max_coord: {:?}", config.max_coord);
                for alias in config.quantized_float_encoder_aliases {
                    println!("quantized float encoder alias: {alias:?}");
                }
            }
        }
        Ok(())
    }

    fn on_entity(
        &mut self,
        _ctx: &Context,
        _delta_header: DeltaHeader,
        _entity: &Entity,
    ) -> Result<(), Self::Error> {
        self.entity_updates += 1;
        Ok(())
    }

    fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        // NOTE: the tick rate is announced by the server (1 / 64 in build 6712 replays).
        #[expect(clippy::cast_possible_truncation)]
        let report_interval_ticks = (REPORT_INTERVAL_SECS / ctx.tick_interval()).round() as i32;
        if ctx.tick() > 0 && report_interval_ticks > 0 && ctx.tick() % report_interval_ticks == 0 {
            if let Some(serializers) = ctx.serializers()
                && ctx.tick() == report_interval_ticks
            {
                println!("coord size params: {:?}", serializers.coord_size_params());
            }
            Self::print_players(ctx);
        }
        Ok(())
    }
}

fn main() -> anyhow::Result<()> {
    let path = std::env::args()
        .nth(1)
        .ok_or_else(|| anyhow::anyhow!("usage: deadlock-demo-check <path-to-dem-file>"))?;
    let demo_file = DemoFile::start_reading(BufReader::new(File::open(path)?))?;
    let mut parser = Parser::from_stream_with_visitor(demo_file, MyVisitor::default())?;
    let result = parser.run_to_end();

    let visitor = parser.visitor_mut();
    println!("entity callbacks: {}", visitor.entity_updates);
    for (packet_type, (count, bytes)) in &visitor.packets {
        println!("packet type {packet_type}: count={count} bytes={bytes}");
    }
    result
}
