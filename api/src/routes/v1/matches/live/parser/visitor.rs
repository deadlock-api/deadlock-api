use axum::response::sse::Event;
use haste::demostream::CmdHeader;
use haste::entities::{DeltaHeader, Entity, ehandle_to_index};
use haste::fxhash;
use haste::fxhash::add_u64_to_hash;
use haste::parser::{Context, Visitor};
use serde_json::json;
use tokio::sync::mpsc::UnboundedSender;

use crate::routes::v1::matches::live::parser::{Delta, StreamParseError, utils};

pub(crate) struct EventVisitor {
    sender: UnboundedSender<Event>,
}

impl EventVisitor {
    pub(crate) fn new(sender: UnboundedSender<Event>) -> Self {
        EventVisitor { sender }
    }
}

impl Visitor for EventVisitor {
    type Error = StreamParseError;

    #[allow(clippy::too_many_lines)]
    async fn on_entity(
        &mut self,
        ctx: &Context,
        delta_header: DeltaHeader,
        entity: &Entity,
    ) -> Result<(), Self::Error> {
        let delta = Delta::from(delta_header);
        // TODO: All the Hashes should be constants
        // TODO: Refactor
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
            let health_regen: Option<f32> =
                entity.get_value(&fxhash::hash_bytes(b"m_flHealthRegen"));
            let ultimate_trained: Option<bool> =
                entity.get_value(&fxhash::hash_bytes(b"m_bUltimateTrained"));
            let self_healing: Option<i32> =
                entity.get_value(&fxhash::hash_bytes(b"m_iSelfHealing"));
            let hero_damage: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHeroDamage"));
            let objective_damage: Option<i32> =
                entity.get_value(&fxhash::hash_bytes(b"m_iObjectiveDamage"));
            let ultimate_cooldown_end: Option<f32> =
                entity.get_value(&fxhash::hash_bytes(b"m_flUltimateCooldownEnd"));
            let upgrade_hash = fxhash::hash_bytes(b"m_vecUpgrades");
            let num_upgrades: u64 = entity.get_value(&upgrade_hash).unwrap_or_default();
            let upgrades = (0..num_upgrades)
                .map(|i| add_u64_to_hash(upgrade_hash, add_u64_to_hash(0, i)))
                .filter_map(|h| entity.get_value(&h))
                .collect::<Vec<u64>>();
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
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
                        "health_regen": health_regen,
                        "ultimate_trained": ultimate_trained,
                        "kills": kills,
                        "assists": assists,
                        "deaths": deaths,
                        "denies": denies,
                        "last_hits": last_hits,
                        "hero_healing": hero_healing,
                        "self_healing": self_healing,
                        "hero_damage": hero_damage,
                        "objective_damage": objective_damage,
                        "ultimate_cooldown_end": ultimate_cooldown_end,
                        "upgrades": upgrades,
                    }))?
                    .event("controller_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CCitadelPlayerPawn")) {
            let controller: Option<i32> = entity
                .get_value(&fxhash::hash_bytes(b"m_hController"))
                .map(ehandle_to_index);
            let level: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_nLevel"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let hero_id: Option<u32> = entity.get_value(&fxhash::hash_bytes(b"m_nHeroID"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
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
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_MidBoss")) {
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "position": position,
                    }))?
                    .event("mid_boss_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_TrooperNeutral")) {
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let shield_active: Option<bool> =
                entity.get_value(&fxhash::hash_bytes(b"m_bShieldActive"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "shield_active": shield_active,
                        "position": position,
                    }))?
                    .event("trooper_neutral_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_Trooper")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let lane: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iLane"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "lane": lane,
                        "position": position,
                    }))?
                    .event("trooper_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_TrooperBoss")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let lane: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iLane"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "lane": lane,
                        "position": position,
                    }))?
                    .event("trooper_boss_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_ShieldedSentry")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "position": position,
                    }))?
                    .event("shielded_sentry_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_BaseDefenseSentry")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "position": position,
                    }))?
                    .event("base_defense_sentry_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_TrooperBarrackBoss")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let lane: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iLane"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "lane": lane,
                        "position": position,
                    }))?
                    .event("trooper_barrack_boss_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_Boss_Tier2")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let lane: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iLane"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "lane": lane,
                        "position": position,
                    }))?
                    .event("boss_tier_2_entity_update"),
            )?;
        } else if entity.serializer_name_heq(fxhash::hash_bytes(b"CNPC_Boss_Tier3")) {
            let team: Option<u8> = entity.get_value(&fxhash::hash_bytes(b"m_iTeamNum"));
            let health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iHealth"));
            let max_health: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iMaxHealth"));
            let create_time: Option<f32> = entity.get_value(&fxhash::hash_bytes(b"m_flCreateTime"));
            let lane: Option<i32> = entity.get_value(&fxhash::hash_bytes(b"m_iLane"));
            let position = utils::get_entity_position(entity);
            self.sender.send(
                Event::default()
                    .json_data(json!({
                        "tick": ctx.tick(),
                        "entity": entity.index(),
                        "delta": delta,
                        "team": team,
                        "health": health,
                        "max_health": max_health,
                        "create_time": create_time,
                        "lane": lane,
                        "position": position,
                    }))?
                    .event("boss_tier_3_entity_update"),
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
