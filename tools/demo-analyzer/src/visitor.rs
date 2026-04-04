use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use haste::entities::{DeltaHeader, Entity, ehandle_to_index};
use haste::fxhash;
use haste::parser::{Context, Visitor};
use prost::Message;
use tracing::debug;
use valveprotos::deadlock::{CCitadelUserMsgBannedHeroes, CitadelUserMessageIds};

use crate::hashes::{CONTROLLER_HASH, HERO_BUILD_ID_HASH, STEAM_ID_HASH};

const PLAYER_CONTROLLER_HASH: u64 = fxhash::hash_bytes(b"CCitadelPlayerController");
const PLAYER_PAWN_HASH: u64 = fxhash::hash_bytes(b"CCitadelPlayerPawn");

#[derive(Debug, Clone, Default)]
pub(crate) struct ControllerData {
    pub steam_id: Option<u64>,
}

impl ControllerData {
    fn is_complete(&self) -> bool {
        self.steam_id.is_some()
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct PawnData {
    pub controller_index: Option<i32>,
    pub hero_build_id: Option<u64>,
}

impl PawnData {
    fn is_complete(&self) -> bool {
        self.controller_index.is_some() && self.hero_build_id.is_some()
    }
}

#[derive(Debug, Clone, Default)]
pub(crate) struct SharedState {
    pub controllers: HashMap<i32, ControllerData>,
    pub pawns: HashMap<i32, PawnData>,
    pub banned_hero_ids: Vec<u32>,
    pub bans_received: bool,
}

impl SharedState {
    /// Returns true when we have complete data for all expected players.
    fn all_players_complete(&self, expected: usize) -> bool {
        let complete_controllers = self
            .controllers
            .values()
            .filter(|c| c.is_complete())
            .count();
        let complete_pawns = self.pawns.values().filter(|p| p.is_complete()).count();
        complete_controllers >= expected && complete_pawns >= expected
    }

    /// Returns true when all data (players + bans) has been collected.
    fn all_data_complete(&self, expected_players: usize) -> bool {
        self.all_players_complete(expected_players) && self.bans_received
    }
}

/// Maximum tick to parse before stopping. At 64 ticks/s this is ~10 seconds.
const MAX_PARSE_TICKS: i32 = 640;

#[derive(Debug, thiserror::Error)]
pub(crate) enum VisitorError {
    #[error("lock poisoned: {0}")]
    LockPoisoned(String),
    #[error("early exit: all data collected")]
    AllDataCollected,
    #[error("protobuf decode: {0}")]
    Decode(#[from] prost::DecodeError),
}

pub(crate) struct DemoAnalyzerVisitor {
    pub state: Arc<Mutex<SharedState>>,
    expected_players: usize,
}

impl DemoAnalyzerVisitor {
    pub(crate) fn new(state: Arc<Mutex<SharedState>>, expected_players: usize) -> Self {
        Self {
            state,
            expected_players,
        }
    }
}

impl Visitor for DemoAnalyzerVisitor {
    type Error = VisitorError;

    async fn on_entity(
        &mut self,
        ctx: &Context,
        _delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        let hash = entity.serializer().serializer_name.hash;

        if hash == PLAYER_CONTROLLER_HASH {
            let idx = entity.index();
            let mut state = self
                .state
                .lock()
                .map_err(|e| VisitorError::LockPoisoned(e.to_string()))?;
            let entry = state.controllers.entry(idx).or_default();
            let was_complete = entry.is_complete();
            if let Some(v) = entity.get_value::<u64>(&STEAM_ID_HASH) {
                entry.steam_id = Some(v);
            }
            if !was_complete && entry.is_complete() {
                let steam_id = entry.steam_id;
                let count = state
                    .controllers
                    .values()
                    .filter(|c| c.is_complete())
                    .count();
                let expected = self.expected_players;
                let tick = ctx.tick();
                debug!(
                    entity_index = idx,
                    steam_id, tick, "PlayerController complete ({count}/{expected})",
                );
                if state.all_data_complete(expected) {
                    debug!(
                        tick,
                        "All {expected} players + bans collected, stopping parse early"
                    );
                    return Err(VisitorError::AllDataCollected);
                }
            }
        } else if hash == PLAYER_PAWN_HASH {
            let idx = entity.index();
            let mut state = self
                .state
                .lock()
                .map_err(|e| VisitorError::LockPoisoned(e.to_string()))?;
            let entry = state.pawns.entry(idx).or_default();
            let was_complete = entry.is_complete();
            if let Some(v) = entity.get_value::<u32>(&CONTROLLER_HASH) {
                entry.controller_index = Some(ehandle_to_index(v));
            }
            if let Some(v) = entity.get_value::<u64>(&HERO_BUILD_ID_HASH) {
                entry.hero_build_id = Some(v);
            }
            if !was_complete && entry.is_complete() {
                let controller_index = entry.controller_index;
                let hero_build_id = entry.hero_build_id;
                let count = state.pawns.values().filter(|p| p.is_complete()).count();
                let expected = self.expected_players;
                let tick = ctx.tick();
                debug!(
                    entity_index = idx,
                    controller_index,
                    hero_build_id,
                    tick,
                    "PlayerPawn complete ({count}/{expected})",
                );
                if state.all_data_complete(expected) {
                    debug!(
                        tick,
                        "All {expected} players + bans collected, stopping parse early"
                    );
                    return Err(VisitorError::AllDataCollected);
                }
            }
        }

        Ok(())
    }

    async fn on_packet(
        &mut self,
        ctx: &Context,
        packet_type: u32,
        data: &[u8],
    ) -> Result<(), Self::Error> {
        if packet_type == CitadelUserMessageIds::KEUserMsgBannedHeroes as u32 {
            let msg = CCitadelUserMsgBannedHeroes::decode(data)?;
            let mut state = self
                .state
                .lock()
                .map_err(|e| VisitorError::LockPoisoned(e.to_string()))?;
            state.banned_hero_ids = msg.banned_hero_ids;
            state.bans_received = true;
            let tick = ctx.tick();
            debug!(tick, banned_heroes = ?state.banned_hero_ids, "Extracted banned heroes");
            if state.all_data_complete(self.expected_players) {
                debug!(tick, "All data collected after bans, stopping parse early");
                return Err(VisitorError::AllDataCollected);
            }
        }
        Ok(())
    }

    async fn on_tick_end(&mut self, ctx: &Context) -> Result<(), Self::Error> {
        if ctx.tick() > MAX_PARSE_TICKS {
            debug!(
                tick = ctx.tick(),
                "Reached max parse tick limit, stopping with partial data"
            );
            return Err(VisitorError::AllDataCollected);
        }
        Ok(())
    }
}
