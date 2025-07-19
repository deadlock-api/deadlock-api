use haste::entities::{Entity, ehandle_to_index};
use haste::fxhash;
use haste::fxhash::add_u64_to_hash;
use haste::parser::Context;
use serde::{Deserialize, Serialize};
use strum_macros::{Display, EnumString, FromRepr};
use utoipa::ToSchema;

#[allow(clippy::wildcard_imports)]
use crate::routes::v1::matches::live::parser::hashes::*;
use crate::routes::v1::matches::live::parser::types::Delta;
use crate::routes::v1::matches::live::parser::utils;

#[derive(
    FromRepr,
    Deserialize,
    Serialize,
    Debug,
    Clone,
    Copy,
    Hash,
    PartialEq,
    Eq,
    Display,
    ToSchema,
    EnumString,
)]
#[repr(u64)]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub(crate) enum EntityType {
    PlayerController = fxhash::hash_bytes(b"CCitadelPlayerController"),
    PlayerPawn = fxhash::hash_bytes(b"CCitadelPlayerPawn"),
    MidBoss = fxhash::hash_bytes(b"CNPC_MidBoss"),
    TrooperNeutral = fxhash::hash_bytes(b"CNPC_TrooperNeutral"),
    Trooper = fxhash::hash_bytes(b"CNPC_Trooper"),
    TrooperBoss = fxhash::hash_bytes(b"CNPC_TrooperBoss"),
    ShieldedSentry = fxhash::hash_bytes(b"CNPC_ShieldedSentry"),
    BaseDefenseSentry = fxhash::hash_bytes(b"CNPC_BaseDefenseSentry"),
    TrooperBarrackBoss = fxhash::hash_bytes(b"CNPC_TrooperBarrackBoss"),
    BossTier2 = fxhash::hash_bytes(b"CNPC_Boss_Tier2"),
    BossTier3 = fxhash::hash_bytes(b"CNPC_Boss_Tier3"),
    BreakableProp = fxhash::hash_bytes(b"CCitadel_BreakableProp"),
    BreakablePropModifierPickup = fxhash::hash_bytes(b"CCitadel_BreakablePropModifierPickup"),
    BreakablePropGoldPickup = fxhash::hash_bytes(b"CCitadel_BreakablePropGoldPickup"),
    PunchablePowerup = fxhash::hash_bytes(b"CCitadel_PunchablePowerup"),
    DestroyableBuilding = fxhash::hash_bytes(b"CCitadel_Destroyable_Building"),
}

impl EntityType {
    pub(crate) fn from_opt(entity: &Entity) -> Option<Self> {
        Self::from_repr(entity.serializer().serializer_name.hash)
    }
}

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
        Self {
            pawn: entity.get_value(&PAWN_HASH).map(ehandle_to_index),
            steam_id: entity.get_value(&STEAM_ID_HASH),
            steam_name: entity.get_value(&STEAM_NAME_HASH),
            team: entity.get_value(&TEAM_HASH),
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
            team: entity.get_value(&TEAM_HASH),
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
            team: entity.get_value(&TEAM_HASH),
            position: utils::get_entity_position(entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
pub(crate) struct DestroyableBuilding {
    health: Option<i32>,
    max_health: Option<i32>,
    team: Option<u8>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for DestroyableBuilding {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            health: entity.get_value(&HEALTH_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            team: entity.get_value(&TEAM_HASH),
            position: utils::get_entity_position(entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
pub(crate) struct PositionActiveEntity {
    active: bool,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for PositionActiveEntity {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            active: entity.get_value(&ACTIVE_HASH).unwrap_or_default(),
            position: utils::get_entity_position(entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default, ToSchema)]
pub(crate) struct PositionEntity {
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for PositionEntity {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            position: utils::get_entity_position(entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, ToSchema)]
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
    BreakableProp(Box<PositionEntity>),
    BreakablePropModifierPickup(Box<PositionActiveEntity>),
    BreakablePropGoldPickup(Box<PositionActiveEntity>),
    PunchablePowerup(Box<PositionEntity>),
    DestroyableBuilding(Box<DestroyableBuilding>),
}

impl EntityUpdateEvents {
    pub(crate) fn from_update(
        ctx: &Context,
        delta: Delta,
        entity_type: EntityType,
        entity: &Entity,
    ) -> Option<Self> {
        match entity_type {
            EntityType::PlayerController => {
                PlayerControllerEvent::from_entity_update(ctx, delta, entity)
                    .map(Box::new)
                    .map(Self::PlayerController)
            }
            EntityType::PlayerPawn => PlayerPawnEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::PlayerPawn),
            EntityType::MidBoss => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::MidBoss),
            EntityType::TrooperNeutral => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::TrooperNeutral),
            EntityType::Trooper => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::Trooper),
            EntityType::TrooperBoss => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::TrooperBoss),
            EntityType::ShieldedSentry => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::ShieldedSentry),
            EntityType::BaseDefenseSentry => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::BaseDefenseSentry),
            EntityType::TrooperBarrackBoss => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::TrooperBarrackBoss),
            EntityType::BossTier2 => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::BossTier2),
            EntityType::BossTier3 => NPCEvent::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::BossTier3),
            EntityType::BreakableProp => PositionEntity::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::BreakableProp),
            EntityType::BreakablePropGoldPickup => {
                PositionActiveEntity::from_entity_update(ctx, delta, entity)
                    .map(Box::new)
                    .map(Self::BreakablePropGoldPickup)
            }
            EntityType::BreakablePropModifierPickup => {
                PositionActiveEntity::from_entity_update(ctx, delta, entity)
                    .map(Box::new)
                    .map(Self::BreakablePropModifierPickup)
            }
            EntityType::PunchablePowerup => PositionEntity::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(Self::PunchablePowerup),
            EntityType::DestroyableBuilding => {
                DestroyableBuilding::from_entity_update(ctx, delta, entity)
                    .map(Box::new)
                    .map(Self::DestroyableBuilding)
            }
        }
    }
}
