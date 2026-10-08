use haste::entities::Entity;
use haste::fxhash;
use haste::fxhash::add_u64_to_hash;
use haste::parser::Context;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString, FromRepr, VariantArray};

#[allow(
    clippy::wildcard_imports,
    reason = "`expect` on a `use` item is not fulfilled"
)]
use crate::demo_parser::hashes::*;
use crate::demo_parser::types::Delta;
use crate::demo_parser::utils;
use crate::utils::steamid64_to_steamid3;

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
    EnumString,
    VariantArray,
)]
#[repr(u64)]
#[strum(serialize_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub(crate) enum EntityType {
    GameRulesProxy = fxhash::hash_bytes(b"CCitadelGameRulesProxy"),
    PlayerController = fxhash::hash_bytes(b"CCitadelPlayerController"),
    PlayerPawn = fxhash::hash_bytes(b"CCitadelPlayerPawn"),
    Team = fxhash::hash_bytes(b"CCitadelTeam"),
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
    SinnersSacrifice = fxhash::hash_bytes(b"CNPC_Neutral_SinnersSacrifice"),
    AbilityMeleeParry = fxhash::hash_bytes(b"CCitadel_Ability_MeleeParry"),
}

impl EntityType {
    pub(super) fn from_opt(entity: &Entity) -> Option<Self> {
        Self::from_repr(entity.serializer().serializer_name.hash)
    }
}

pub(super) trait EntityUpdateEvent: Serialize {
    fn from_entity_update(ctx: &Context, delta_header: Delta, entity: &Entity) -> Option<Self>
    where
        Self: Sized;
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct GameRulesProxyEvent {
    pub(super) game_start_time: Option<f32>,
    game_paused: Option<bool>,
    pause_start_tick: Option<i32>,
    pub(super) total_paused_ticks: Option<i32>,
    /// Seed of the corrupted item penalties (build 6711+; equals the match metadata's
    /// `corrupted_penalty_seed`).
    corrupted_penalty_seed: Option<u32>,
    /// Number of corrupted items the Broker offers (build 6711+): 0 until it spawns, then +1 on
    /// the spawn and on each restock.
    pub(super) num_corrupted_items_limit: Option<i32>,
}

impl EntityUpdateEvent for GameRulesProxyEvent {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            game_start_time: entity.get_value(&START_TIME_HASH),
            game_paused: entity.get_value(&PAUSED_HASH),
            pause_start_tick: entity.get_value(&PAUSE_START_TICK_HASH),
            total_paused_ticks: entity.get_value(&PAUSED_TICKS_HASH),
            corrupted_penalty_seed: entity.get_value(&CORRUPTED_PENALTY_SEED_HASH),
            num_corrupted_items_limit: entity.get_value(&NUM_CORRUPTED_ITEMS_LIMIT_HASH),
        }
        .into()
    }
}

/// Key of element `i` of the dynamic array field `array`.
fn array_element_key(array: u64, i: u64) -> u64 {
    add_u64_to_hash(array, add_u64_to_hash(0, i))
}

/// The elements of the dynamic array field `array` that are set.
fn array_values(entity: &Entity, array: u64) -> Vec<u64> {
    (0..entity.get_value(&array).unwrap_or_default())
        .filter_map(|i| entity.get_value(&array_element_key(array, i)))
        .collect()
}

/// Banned heroes from the game rules entity's `m_vecBannedHeroes` (build 6711+; older builds send
/// the `BannedHeroes` user message instead). `None` until the length and every element are set.
pub(super) fn banned_heroes_from_game_rules(entity: &Entity) -> Option<Vec<u32>> {
    let len: u64 = entity.get_value(&BANNED_HEROES_HASH)?;
    (0..len)
        .map(|i| {
            entity
                .get_value::<u64>(&array_element_key(BANNED_HEROES_HASH, i))
                .and_then(|id| u32::try_from(id).ok())
        })
        .collect()
}

/// Bit of an item's `m_nUpgradeInfo` that marks it as corrupted (bought from the Broker).
pub(super) const CORRUPTED_UPGRADE_INFO_BIT: u32 = 1 << 23;

/// A corrupted item on an item/upgrade entity: `(item id, upgrade info)`, or `None` if the entity
/// is not a corrupted item.
pub(super) fn corrupted_item(entity: &Entity) -> Option<(u32, u32)> {
    let upgrade_info: u32 = entity.get_value(&UPGRADE_INFO_HASH)?;
    if upgrade_info & CORRUPTED_UPGRADE_INFO_BIT == 0 {
        return None;
    }
    let item_id = entity
        .get_value::<u64>(&SUBCLASS_ID_HASH)
        .and_then(|id| u32::try_from(id).ok())?;
    Some((item_id, upgrade_info))
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct PlayerControllerEvent {
    pawn: Option<i32>,
    steam_id: Option<u32>,
    steam_name: Option<String>,
    team: Option<u8>,
    hero_id: Option<u32>,
    hero_badge_xp: Option<u32>,
    player_slot: Option<u8>,
    rank: Option<i32>, // Currently always 0 or None, as Valve hides rank data
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
    ability_upgrades: Option<Vec<AbilityUpgrade>>,
}

#[derive(Serialize, Debug, Clone)]
struct AbilityUpgrade {
    ability_id: u32,
    upgrade_info: u32,
    unlocked: bool,
    tier: u32,
}

impl AbilityUpgrade {
    fn new(ability_id: u32, upgrade_info: u32) -> Self {
        // The upper 16 bits contain the unlock bit followed by upgrade-star bits.
        // Preserve the packed value so consumers can inspect other flags as well.
        Self {
            ability_id,
            upgrade_info,
            unlocked: upgrade_info & (1 << 16) != 0,
            tier: ((upgrade_info >> 17) & 0xf).count_ones(),
        }
    }

    fn from_entity(entity: &Entity) -> Option<Vec<Self>> {
        let count: u64 = entity.get_value(&ABILITY_UPGRADES_HASH)?;
        (0..count)
            .map(|i| {
                let key = array_element_key(ABILITY_UPGRADES_HASH, i);
                Some(Self::new(
                    entity.get_value(&add_u64_to_hash(key, ABILITY_ID_HASH))?,
                    entity.get_value(&add_u64_to_hash(key, UPGRADE_INFO_HASH))?,
                ))
            })
            .collect()
    }
}

impl EntityUpdateEvent for PlayerControllerEvent {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            pawn: utils::get_entity_handle_index(entity, PAWN_HASH),
            steam_id: entity
                .get_value(&STEAM_ID_HASH)
                .and_then(|s| steamid64_to_steamid3(s).ok()),
            steam_name: entity.get_value(&STEAM_NAME_HASH),
            team: entity.get_value(&TEAM_HASH),
            hero_badge_xp: entity.get_value(&HERO_BADGE_XP_HASH),
            player_slot: entity.get_value(&PLAYER_SLOT_HASH),
            rank: entity.get_value(&RANK_HASH),
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
            ability_upgrades: AbilityUpgrade::from_entity(entity),
            upgrades: array_values(entity, UPGRADES_HASH),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct PlayerPawnEvent {
    controller: Option<i32>,
    team: Option<u8>,
    hero_id: Option<u32>,
    hero_build_id: Option<u64>,
    hero_build_serialized: Option<Box<[u8]>>,
    quickbuy_queue: Vec<u64>,
    quickbuy_auto_purchase: Option<bool>,
    quickbuy_auto_queue_build: Option<bool>,
    level: Option<i32>,
    max_health: Option<i32>,
    health: Option<i32>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for PlayerPawnEvent {
    fn from_entity_update(ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            controller: utils::get_entity_handle_index(entity, CONTROLLER_HASH),
            team: entity.get_value(&TEAM_HASH),
            hero_id: entity.get_value(&PAWN_HERO_ID_HASH),
            hero_build_id: entity.get_value(&HERO_BUILD_ID_HASH),
            hero_build_serialized: entity.get_value(&HERO_BUILD_SERIALIZED_HASH),
            level: entity.get_value(&LEVEL_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            health: entity.get_value(&HEALTH_HASH),
            position: utils::get_entity_position(ctx, entity),
            quickbuy_auto_purchase: entity.get_value(&QUICKBUY_AUTO_PURCHASE_HASH),
            quickbuy_auto_queue_build: entity.get_value(&QUICKBUY_AUTO_QUUE_BUILD_HASH),
            quickbuy_queue: array_values(entity, QUICKBUY_HASH),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct TeamEvent {
    team: Option<u8>,
    score: Option<i32>,
    teamname: Option<String>,
    flex_unlocked: Option<u8>,
}

impl EntityUpdateEvent for TeamEvent {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            team: entity.get_value(&TEAM_HASH),
            score: entity.get_value(&SCORE_HASH),
            teamname: entity.get_value(&TEAMNAME_HASH),
            flex_unlocked: entity.get_value(&FLEX_UNLOCKED_HASH),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct NPCEvent {
    health: Option<i32>,
    max_health: Option<i32>,
    create_time: Option<f32>,
    lane: Option<i32>,
    shield_active: Option<bool>,
    team: Option<u8>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for NPCEvent {
    fn from_entity_update(ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            health: entity.get_value(&HEALTH_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            create_time: entity.get_value(&CREATE_TIME_HASH),
            lane: entity.get_value(&LANE_HASH),
            shield_active: entity.get_value(&SHIELD_ACTIVE_HASH),
            team: entity.get_value(&TEAM_HASH),
            position: utils::get_entity_position(ctx, entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct DestroyableBuilding {
    health: Option<i32>,
    max_health: Option<i32>,
    team: Option<u8>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for DestroyableBuilding {
    fn from_entity_update(ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            health: entity.get_value(&HEALTH_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            team: entity.get_value(&TEAM_HASH),
            position: utils::get_entity_position(ctx, entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct SinnersSacrifice {
    health: Option<i32>,
    max_health: Option<i32>,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for SinnersSacrifice {
    fn from_entity_update(ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            health: entity.get_value(&HEALTH_HASH),
            max_health: entity.get_value(&MAX_HEALTH_HASH),
            position: utils::get_entity_position(ctx, entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct AbilityMeleeParry {
    owner_entity: Option<i32>,
    attack_parried: Option<bool>,
    start_time: Option<f32>,
    success_time: Option<f32>,
}

impl EntityUpdateEvent for AbilityMeleeParry {
    fn from_entity_update(_ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            owner_entity: utils::get_entity_handle_index(entity, OWNER_ENTITY_HASH),
            attack_parried: entity.get_value(&ATTACK_PARRIED_HASH),
            start_time: entity.get_value(&PARRY_START_TIME_HASH),
            success_time: entity.get_value(&PARRY_SUCCESS_TIME_HASH),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct PositionActiveEntity {
    active: bool,
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for PositionActiveEntity {
    fn from_entity_update(ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            active: entity.get_value(&ACTIVE_HASH).unwrap_or_default(),
            position: utils::get_entity_position(ctx, entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone, Default)]
pub(super) struct PositionEntity {
    position: Option<[f32; 3]>,
}

impl EntityUpdateEvent for PositionEntity {
    fn from_entity_update(ctx: &Context, _delta_header: Delta, entity: &Entity) -> Option<Self> {
        Self {
            position: utils::get_entity_position(ctx, entity),
        }
        .into()
    }
}

#[derive(Serialize, Debug, Clone)]
#[serde(untagged)]
pub(super) enum EntityUpdateEvents {
    GameRulesProxy(Box<GameRulesProxyEvent>),
    PlayerController(Box<PlayerControllerEvent>),
    PlayerPawn(Box<PlayerPawnEvent>),
    Team(Box<TeamEvent>),
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
    AbilityMeleeParry(Box<AbilityMeleeParry>),
    SinnersSacrifice(Box<SinnersSacrifice>),
}

impl EntityUpdateEvents {
    pub(super) fn from_update(
        ctx: &Context,
        delta: Delta,
        entity_type: EntityType,
        entity: &Entity,
    ) -> Option<Self> {
        fn boxed<E: EntityUpdateEvent>(
            ctx: &Context,
            delta: Delta,
            entity: &Entity,
            variant: fn(Box<E>) -> EntityUpdateEvents,
        ) -> Option<EntityUpdateEvents> {
            E::from_entity_update(ctx, delta, entity)
                .map(Box::new)
                .map(variant)
        }

        match entity_type {
            EntityType::GameRulesProxy => boxed(ctx, delta, entity, Self::GameRulesProxy),
            EntityType::PlayerController => boxed(ctx, delta, entity, Self::PlayerController),
            EntityType::PlayerPawn => boxed(ctx, delta, entity, Self::PlayerPawn),
            EntityType::Team => boxed(ctx, delta, entity, Self::Team),
            EntityType::MidBoss => boxed(ctx, delta, entity, Self::MidBoss),
            EntityType::TrooperNeutral => boxed(ctx, delta, entity, Self::TrooperNeutral),
            EntityType::Trooper => boxed(ctx, delta, entity, Self::Trooper),
            EntityType::TrooperBoss => boxed(ctx, delta, entity, Self::TrooperBoss),
            EntityType::ShieldedSentry => boxed(ctx, delta, entity, Self::ShieldedSentry),
            EntityType::BaseDefenseSentry => boxed(ctx, delta, entity, Self::BaseDefenseSentry),
            EntityType::TrooperBarrackBoss => boxed(ctx, delta, entity, Self::TrooperBarrackBoss),
            EntityType::BossTier2 => boxed(ctx, delta, entity, Self::BossTier2),
            EntityType::BossTier3 => boxed(ctx, delta, entity, Self::BossTier3),
            EntityType::BreakableProp => boxed(ctx, delta, entity, Self::BreakableProp),
            EntityType::BreakablePropGoldPickup => {
                boxed(ctx, delta, entity, Self::BreakablePropGoldPickup)
            }
            EntityType::BreakablePropModifierPickup => {
                boxed(ctx, delta, entity, Self::BreakablePropModifierPickup)
            }
            EntityType::PunchablePowerup => boxed(ctx, delta, entity, Self::PunchablePowerup),
            EntityType::DestroyableBuilding => boxed(ctx, delta, entity, Self::DestroyableBuilding),
            EntityType::SinnersSacrifice => boxed(ctx, delta, entity, Self::SinnersSacrifice),
            EntityType::AbilityMeleeParry => boxed(ctx, delta, entity, Self::AbilityMeleeParry),
        }
    }
}
