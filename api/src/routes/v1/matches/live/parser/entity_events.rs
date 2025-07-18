use haste::entities::{Entity, ehandle_to_index};
use haste::fxhash::add_u64_to_hash;
use haste::parser::Context;
use serde::Serialize;
use utoipa::ToSchema;

use crate::routes::v1::matches::live::parser::hashes::*;
use crate::routes::v1::matches::live::parser::types::{Delta, EntityType};
use crate::routes::v1::matches::live::parser::utils;

pub(crate) trait EntityUpdateEvent: Serialize + ToSchema {
    fn from_entity_update(ctx: &Context, delta_header: Delta, entity: &Entity) -> Option<Self>
    where
        Self: Sized;
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
pub(crate) struct PlayerControllerEvent {
    pawn: Option<i32>,
    steam_id: Option<u64>,
    steam_name: Option<String>,
    team: Option<u8>,
    hero_id: Option<u32>,
    hero_build_id: Option<u64>,
    player_slot: Option<u8>,
    assigned_lane: Option<i8>,
    original_assigned_lane: Option<i8>,
    net_worth: Option<i32>,
    health_regen: Option<f32>,
    ultimate_trained: Option<bool>,
    kills: Option<i32>,
    assists: Option<i32>,
    deaths: Option<i32>,
    denies: Option<i32>,
    last_hits: Option<i32>,
    hero_healing: Option<i32>,
    self_healing: Option<i32>,
    hero_damage: Option<i32>,
    objective_damage: Option<i32>,
    ultimate_cooldown_end: Option<f32>,
    upgrades: Vec<u64>,
}

impl EntityUpdateEvent for PlayerControllerEvent {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        let steam_id: Option<u64> = entity.get_value(&STEAM_ID_HASH);
        if steam_id.is_none_or(|s| s == 0) {
            return None;
        }
        Self {
            pawn: entity.get_value(&PAWN_HASH).map(ehandle_to_index),
            steam_id,
            steam_name: entity.get_value(&STEAM_NAME_HASH),
            team: entity.get_value::<u8>(&TEAM_HASH).map(|t| t - 2),
            hero_build_id: entity.get_value(&HERO_BUILD_ID_HASH),
            player_slot: entity.get_value(&PLAYER_SLOT_HASH),
            assigned_lane: entity.get_value(&ASSIGNED_LANE_HASH),
            original_assigned_lane: entity.get_value(&ORIGINAL_ASSIGNED_LANE_HASH),
            hero_id: entity.get_value(&HERO_ID_HASH),
            net_worth: entity.get_value(&NET_WORTH_HASH),
            kills: entity.get_value(&KILLS_HASH),
            assists: entity.get_value(&ASSISTS_HASH),
            deaths: entity.get_value(&DEATHS_HASH),
            denies: entity.get_value(&DENIES_HASH),
            last_hits: entity.get_value(&LAST_HITS_HASH),
            hero_healing: entity.get_value(&HERO_HEALING_HASH),
            health_regen: entity.get_value(&HEALTH_REGEN_HASH),
            ultimate_trained: entity.get_value(&ULTIMATE_TRAINED_HASH),
            self_healing: entity.get_value(&SELF_HEALING_HASH),
            hero_damage: entity.get_value(&HERO_DAMAGE_HASH),
            objective_damage: entity.get_value(&OBJECTIVE_DAMAGE_HASH),
            ultimate_cooldown_end: entity.get_value(&ULTIMATE_COOLDOWN_END_HASH),
            upgrades: (0..entity.get_value(&UPGRADES_HASH).unwrap_or_default())
                .map(|i| add_u64_to_hash(UPGRADES_HASH, add_u64_to_hash(0, i)))
                .filter_map(|h| entity.get_value(&h))
                .collect(),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
pub(crate) struct PlayerPawnEvent {
    controller: Option<i32>,
    team: Option<u8>,
    hero_id: Option<u32>,
    level: Option<i32>,
    max_health: Option<i32>,
    health: Option<i32>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for PlayerPawnEvent {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            controller: entity.get_value(&CONTROLLER_HASH).map(ehandle_to_index),
            team: entity.get_value::<u8>(&TEAM_HASH).map(|t| t - 2),
            hero_id: entity.get_value(&HERO_ID_HASH),
            level: entity.get_value(&LEVEL_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            health: entity.get_value(&HEALTH_HASH),
            position: utils::get_entity_position(entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
pub(crate) struct NPCEvent {
    health: Option<i32>,
    max_health: Option<i32>,
    create_time: Option<f32>,
    lane: Option<i32>,
    shield_active: Option<bool>,
    team: Option<u8>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for NPCEvent {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            health: entity.get_value(&HEALTH_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            create_time: entity.get_value(&CREATE_TIME_HASH),
            lane: entity.get_value(&LANE_HASH),
            shield_active: entity.get_value(&SHIELD_ACTIVE_HASH),
            team: entity.get_value::<u8>(&TEAM_HASH).map(|t| t - 2),
            position: utils::get_entity_position(entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
#[serde(untagged)]
pub(crate) enum EntityUpdateEvents {
    PlayerController(Box<PlayerControllerEvent>),
    PlayerPawn(Box<PlayerPawnEvent>),
    MidBoss(Box<NPCEvent>),
    TrooperNeutral(Box<NPCEvent>),
    Trooper(Box<NPCEvent>),
    TrooperBoss(Box<NPCEvent>),
    ShieldedSentry(Box<NPCEvent>),
    BaseDefenseSentry(Box<NPCEvent>),
    TrooperBarrackBoss(Box<NPCEvent>),
    BossTier2(Box<NPCEvent>),
    BossTier3(Box<NPCEvent>),
    #[serde(skip_serializing)]
    #[default]
    Unknown,
}

impl EntityUpdateEvents {
    pub(crate) fn from_entity_update(
        ctx: &Context,
        dh: Delta,
        ent_type: EntityType,
        ent: &Entity,
    ) -> Option<Self> {
        match ent_type {
            EntityType::PlayerController => PlayerControllerEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::PlayerController),
            EntityType::PlayerPawn => PlayerPawnEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::PlayerPawn),
            EntityType::MidBoss => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::MidBoss),
            EntityType::TrooperNeutral => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::TrooperNeutral),
            EntityType::Trooper => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::Trooper),
            EntityType::TrooperBoss => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::TrooperBoss),
            EntityType::ShieldedSentry => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::ShieldedSentry),
            EntityType::BaseDefenseSentry => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::BaseDefenseSentry),
            EntityType::TrooperBarrackBoss => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::TrooperBarrackBoss),
            EntityType::BossTier2 => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::BossTier2),
            EntityType::BossTier3 => NPCEvent::from_entity_update(ctx, dh, ent)
                .map(Box::new)
                .map(Self::BossTier3),
            EntityType::Unknown => None,
        }
    }
}
