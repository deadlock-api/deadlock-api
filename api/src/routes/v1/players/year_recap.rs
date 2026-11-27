//! A player's year in Deadlock: totals, heroes, records, rank journey, items and damage-matrix
//! sums over one calendar year (UTC), for the website's "Year in Deadlock" recap.
//!
//! One read per account: `player_match_stats` (every stored match) joined with
//! `player_match_recap` (the per-match extras `player_match_stats` lacks: team, lane, items,
//! deaths by killer hero, custom stats and damage-matrix sums). Both are ordered by
//! `(account_id, match_id)`, so even an account with thousands of matches reads a few granules.
//! The aggregation runs here on the cached rows.

use std::collections::HashMap;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum_extra::extract::Query;
use chrono::{Datelike as _, TimeZone as _, Utc};
use clickhouse::Row;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::services::protected_accounts::ensure_not_protected;
use crate::utils::sql::cached_ch_query;
use crate::utils::types::AccountIdQuery;

/// The first year `player_match_recap` was backfilled for.
const FIRST_RECAP_YEAR: i32 = 2026;

/// `match_player.game_mode` / `match_mode` enum values, as read through `toUInt8`.
const GAME_MODE_NORMAL: u8 = 1;
const GAME_MODE_STREET_BRAWL: u8 = 4;
const MATCH_MODE_UNRANKED: u8 = 1;
const MATCH_MODE_RANKED: u8 = 4;

/// First match with MVP ranks. Every match from this id on carries them.
const MVP_RANK_SINCE_MATCH_ID: u64 = 50_367_982;

/// The last day of January the previous year's recap stays open.
const RECAP_LAST_JANUARY_DAY: u32 = 15;

const TOP_ITEMS: usize = 40;
const TOP_DAMAGE_SOURCES: usize = 20;

#[derive(Debug, Clone, Copy, Deserialize, IntoParams, Default)]
pub(super) struct YearRecapQuery {
    /// Calendar year (UTC) of the recap. **Default:** the year that is being recapped right now:
    /// the current year in December, the previous year otherwise.
    #[param(minimum = 2026)]
    year: Option<i32>,
}

#[derive(Debug, Clone, Row, Serialize, Deserialize)]
pub(super) struct RecapRow {
    match_id: u64,
    start_time: u32,
    duration_s: u32,
    game_mode: u8,
    match_mode: u8,
    hero_id: u8,
    won: bool,
    kills: u32,
    deaths: u32,
    assists: u32,
    net_worth: u32,
    last_hits: u32,
    denies: u32,
    player_damage: u32,
    damage_taken: u32,
    damage_mitigated: u32,
    boss_damage: u32,
    shots_hit: u32,
    shots_missed: u32,
    hero_bullets_hit: u32,
    hero_bullets_crit: u32,
    mvp_rank: Option<u32>,
    permanent_buffs: Option<u32>,
    rank_badge_after: Option<u32>,
    has_details: bool,
    team: u8,
    assigned_lane: u8,
    abandon_match_time_s: u32,
    player_healing: u32,
    teammate_healing: u32,
    teammate_barriering: u32,
    headshot_kills: u32,
    bullet_kills: u32,
    melee_kills: u32,
    ability_kills: u32,
    time_dead_s: u32,
    killer_hero_ids: Vec<u8>,
    upgrade_ids: Vec<u32>,
    accolade_ids: Vec<u16>,
    enemy_hero_ids: Vec<u8>,
    parries: u32,
    parry_misses: u32,
    unspent_gold_minutes: u32,
    breakables_broken: u32,
    comeback_gold: u32,
    gold_players: u32,
    gold_lane_creeps: u32,
    gold_neutrals: u32,
    gold_bosses: u32,
    gold_treasure: u32,
    gold_breakables: u32,
    gold_death_loss: u32,
    dm_sources: Vec<String>,
    dm_source_damage: Vec<u32>,
    dm_bullet: u32,
    dm_ability: u32,
    dm_melee: u32,
    dm_target_hero_ids: Vec<u8>,
    dm_target_damage: Vec<u32>,
    cc_ms: u32,
    cc_stun_ms: u32,
    heal_prevented: u32,
}

/// One match of the year, for views the website draws in the visitor's time zone (calendar,
/// hour of day).
#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapMatch {
    match_id: u64,
    start_time: u32,
    duration_s: u32,
    /// `normal` or `street_brawl`.
    game_mode: &'static str,
    /// `ranked` or `unranked`.
    match_mode: &'static str,
    hero_id: u8,
    won: bool,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub(super) struct RecapTotals {
    matches: u64,
    wins: u64,
    /// Matches that carry the per-match details (team, lane, healing, kill types, deaths by
    /// killer, items, custom stats). The detail totals below cover only these.
    detailed_matches: u64,
    /// Matches that carry damage-matrix sums (`damage_sources`, `damage_targets`, `dm_*`,
    /// `cc_*`, `heal_prevented`).
    damage_matrix_matches: u64,
    seconds_played: u64,
    kills: u64,
    deaths: u64,
    assists: u64,
    /// Souls (net worth) at the end of every match, summed.
    souls: u64,
    last_hits: u64,
    denies: u64,
    player_damage: u64,
    damage_taken: u64,
    damage_mitigated: u64,
    /// Damage to objectives and bosses.
    boss_damage: u64,
    shots_hit: u64,
    shots_missed: u64,
    hero_bullets_hit: u64,
    hero_bullets_crit: u64,
    /// Matches by the MVP rank Valve awarded: index 0 is rank 1 (MVP), 1 rank 2, 2 rank 3.
    mvp_rank_counts: Vec<u64>,
    /// Matches since Valve started reporting MVP ranks (2026-01-06); divide by this.
    mvp_rated_matches: u64,
    permanent_buffs: u64,
    /// Matches that carry buff pickup counts (build 6712+, late September 2026).
    permanent_buff_matches: u64,
    player_healing: u64,
    teammate_healing: u64,
    teammate_barriering: u64,
    headshot_kills: u64,
    bullet_kills: u64,
    melee_kills: u64,
    ability_kills: u64,
    time_dead_s: u64,
    /// Deaths not credited to an enemy hero (troopers, guardians, the mid boss, falling, ...).
    non_hero_deaths: u64,
    abandons: u64,
    parries: u64,
    parry_misses: u64,
    /// The game's "Unspent Gold Minutes": souls held unspent, summed over every match minute.
    unspent_gold_minutes: u64,
    breakables_broken: u64,
    comeback_gold: u64,
    gold_players: u64,
    gold_lane_creeps: u64,
    gold_neutrals: u64,
    gold_bosses: u64,
    gold_treasure: u64,
    gold_breakables: u64,
    gold_death_loss: u64,
    /// Weapon-type damage to enemy heroes (damage-matrix category `Bullet`).
    dm_bullet: u64,
    /// Spirit-type damage to enemy heroes (damage-matrix category `Ability`).
    dm_ability: u64,
    /// Melee damage to enemy heroes (damage-matrix category `Melee`).
    dm_melee: u64,
    /// Crowd control applied to enemy heroes, in milliseconds.
    cc_ms: u64,
    /// The stun part of `cc_ms`, in milliseconds.
    cc_stun_ms: u64,
    /// Enemy healing prevented.
    heal_prevented: u64,
}

#[derive(Debug, Clone, Default)]
struct RecapCount {
    matches: u64,
    wins: u64,
    seconds: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapMatchModeCount {
    /// `ranked` or `unranked`.
    match_mode: &'static str,
    matches: u64,
    wins: u64,
    seconds: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapTeamCount {
    /// 0 = Team0 (the Hidden King), 1 = Team1 (the Archmother).
    team: u8,
    matches: u64,
    wins: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapLaneCount {
    /// Assigned lane: 1, 4 or 6.
    lane: u8,
    matches: u64,
    wins: u64,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub(super) struct RecapHero {
    hero_id: u8,
    matches: u64,
    wins: u64,
    seconds: u64,
    kills: u64,
    deaths: u64,
    assists: u64,
    player_damage: u64,
    souls: u64,
    first_played: u32,
    last_played: u32,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapRecord {
    /// Which stat: `kills`, `assists`, `deaths`, `player_damage`, `damage_taken`,
    /// `damage_mitigated`, `player_healing`, `teammate_healing`, `souls`, `last_hits`,
    /// `denies`, `boss_damage`, `headshot_kills`, `parries`, `time_dead_s`, `cc_ms`,
    /// `longest_match_s`, `shortest_win_s`.
    stat: &'static str,
    value: u64,
    match_id: u64,
    start_time: u32,
    hero_id: u8,
    won: bool,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub(super) struct RecapStreak {
    length: u64,
    /// Start time of the streak's first match, 0 without a streak.
    from: u32,
    /// Start time of the streak's last match, 0 without a streak.
    to: u32,
}

#[derive(Debug, Clone, Default, Serialize, ToSchema)]
pub(super) struct RecapStreaks {
    longest_win: RecapStreak,
    longest_loss: RecapStreak,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapItem {
    /// See more: <https://api.deadlock-api.com/v1/assets/items>
    item_id: u32,
    /// Matches in which the player bought it.
    matches: u64,
    wins: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapDamageSource {
    /// Ability, item or weapon class name, e.g. `upgrade_magic_burst`,
    /// `citadel_weapon_kelvin_set` (a `_crit` suffix is the crit part of the weapon).
    source: String,
    damage: u64,
    matches: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapHeroDamage {
    hero_id: u8,
    /// Damage the player dealt to this hero.
    damage: u64,
    /// Matches the player damaged this hero in.
    matches: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapKiller {
    hero_id: u8,
    /// Times this enemy hero killed the player.
    deaths: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapEnemy {
    hero_id: u8,
    /// Detailed matches with this hero on the enemy team.
    matches: u64,
    wins: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapAccolade {
    accolade_id: u16,
    matches: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapRankPoint {
    start_time: u32,
    /// Rank badge after the match: tier * 10 + subrank. See more:
    /// <https://api.deadlock-api.com/v1/assets/ranks>
    badge: u32,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct RecapRank {
    ranked_matches: u64,
    /// Badge after the first ranked match of the year with a known rank.
    first_badge: u32,
    /// Badge after the last ranked match of the year.
    last_badge: u32,
    peak_badge: u32,
    /// Start time of the first match that reached `peak_badge`.
    peak_at: u32,
    /// Badge after every ranked match with a known rank, in match order.
    points: Vec<RecapRankPoint>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct ModeRecap {
    /// `normal` or `street_brawl`.
    game_mode: &'static str,
    totals: RecapTotals,
    by_match_mode: Vec<RecapMatchModeCount>,
    /// Most played first.
    heroes: Vec<RecapHero>,
    teams: Vec<RecapTeamCount>,
    lanes: Vec<RecapLaneCount>,
    records: Vec<RecapRecord>,
    streaks: RecapStreaks,
    /// Most bought first, at most 40.
    items: Vec<RecapItem>,
    /// Damage to enemy heroes by ability, item or weapon, most damage first, at most 20.
    damage_sources: Vec<RecapDamageSource>,
    /// Damage to enemy heroes by hero, most damage first.
    damage_targets: Vec<RecapHeroDamage>,
    /// Deaths by the enemy hero credited with the kill, most first.
    killers: Vec<RecapKiller>,
    /// Enemy heroes faced, most often first.
    enemies: Vec<RecapEnemy>,
    accolades: Vec<RecapAccolade>,
    /// Ranked rank journey; only in `normal`, `null` without ranked matches.
    rank: Option<RecapRank>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub(super) struct YearRecap {
    account_id: u32,
    year: i32,
    /// Unix timestamp of the window's start (Jan 1, 00:00 UTC).
    start_unix: i64,
    /// Unix timestamp of the window's end (exclusive: next Jan 1, 00:00 UTC).
    end_unix: i64,
    /// Every Ranked and Unranked match of the year, oldest first.
    matches: Vec<RecapMatch>,
    /// Normal mode first, then Street Brawl; a mode without matches is left out.
    modes: Vec<ModeRecap>,
}

/// The year being recapped on `now`: the current year in December, the previous one before.
fn default_year(now: chrono::DateTime<Utc>) -> i32 {
    if now.month() == 12 {
        now.year()
    } else {
        now.year().saturating_sub(1)
    }
}

/// Whether the recap is open on `now`: 1 December to 15 January, UTC (the website's window).
fn is_recap_open(now: chrono::DateTime<Utc>) -> bool {
    now.month() == 12 || (now.month() == 1 && now.day() <= RECAP_LAST_JANUARY_DAY)
}

fn year_bounds(year: i32) -> Option<(i64, i64)> {
    let start = Utc.with_ymd_and_hms(year, 1, 1, 0, 0, 0).single()?;
    let end = Utc
        .with_ymd_and_hms(year.checked_add(1)?, 1, 1, 0, 0, 0)
        .single()?;
    Some((start.timestamp(), end.timestamp()))
}

fn build_query(account_id: u32, start_unix: i64, end_unix: i64) -> String {
    let window = format!(
        "account_id = {account_id} AND start_time >= toDateTime({start_unix}, 'UTC') \
         AND start_time < toDateTime({end_unix}, 'UTC')"
    );
    // PREWHERE: under FINAL, ClickHouse only moves sorting-key conditions there itself.
    // Placement matches enter with display rank 0 and near-zero progress, which rankBadge would
    // turn into Initiate 1, so they get no badge.
    // Duplicate versions of a row never differ in the filtered columns.
    format!(
        "
    SELECT
        p.match_id AS match_id, toUInt32(p.start_time) AS start_time, p.duration_s AS duration_s,
        toUInt8(p.game_mode) AS game_mode, toUInt8(p.match_mode) AS match_mode,
        p.hero_id AS hero_id, p.won AS won,
        p.kills AS kills, p.deaths AS deaths, p.assists AS assists, p.net_worth AS net_worth,
        p.last_hits AS last_hits, p.denies AS denies,
        p.max_player_damage AS player_damage, p.max_player_damage_taken AS damage_taken,
        p.max_damage_mitigated AS damage_mitigated, p.max_boss_damage AS boss_damage,
        p.max_shots_hit AS shots_hit, p.max_shots_missed AS shots_missed,
        p.max_hero_bullets_hit AS hero_bullets_hit,
        p.max_hero_bullets_hit_crit AS hero_bullets_crit,
        p.mvp_rank AS mvp_rank, p.permanent_buffs AS permanent_buffs,
        if(p.player_rank_final_flat_progress IS NULL
               OR ifNull(p.player_rank_initial_display_rank, 0) = 0, NULL,
           rankBadge(assumeNotNull(p.player_rank_final_flat_progress),
                     ifNull(p.player_rank_initial_display_rank, 0), p.rank_interval)) AS rank_badge_after,
        toBool(r.account_id != 0) AS has_details,
        toUInt8(r.team) AS team, r.assigned_lane AS assigned_lane,
        r.abandon_match_time_s AS abandon_match_time_s,
        r.player_healing AS player_healing, r.teammate_healing AS teammate_healing,
        r.teammate_barriering AS teammate_barriering,
        r.headshot_kills AS headshot_kills, r.bullet_kills AS bullet_kills,
        r.melee_kills AS melee_kills, r.ability_kills AS ability_kills,
        r.time_dead_s AS time_dead_s, r.killer_hero_ids AS killer_hero_ids,
        r.upgrade_ids AS upgrade_ids, r.accolade_ids AS accolade_ids,
        r.enemy_hero_ids AS enemy_hero_ids,
        r.parries AS parries, r.parry_misses AS parry_misses,
        r.unspent_gold_minutes AS unspent_gold_minutes,
        r.breakables_broken AS breakables_broken, r.comeback_gold AS comeback_gold,
        r.gold_players AS gold_players, r.gold_lane_creeps AS gold_lane_creeps,
        r.gold_neutrals AS gold_neutrals, r.gold_bosses AS gold_bosses,
        r.gold_treasure AS gold_treasure, r.gold_breakables AS gold_breakables,
        r.gold_death_loss AS gold_death_loss,
        arrayMap(s -> toString(s), r.dm_sources) AS dm_sources,
        r.dm_source_damage AS dm_source_damage,
        r.dm_bullet AS dm_bullet, r.dm_ability AS dm_ability, r.dm_melee AS dm_melee,
        r.dm_target_hero_ids AS dm_target_hero_ids, r.dm_target_damage AS dm_target_damage,
        r.cc_ms AS cc_ms, r.cc_stun_ms AS cc_stun_ms, r.heal_prevented AS heal_prevented
    FROM (
        SELECT * FROM player_match_stats FINAL
        PREWHERE {window} AND match_mode IN ('Ranked', 'Unranked')
            AND game_mode IN ('Normal', 'StreetBrawl')
    ) AS p
    LEFT JOIN (
        SELECT * FROM player_match_recap FINAL
        PREWHERE {window}
    ) AS r ON r.match_id = p.match_id
    ORDER BY p.start_time, p.match_id
    SETTINGS log_comment = 'player_year_recap', join_use_nulls = 0
    "
    )
}

cached_ch_query! {
    /// Half an hour: new matches show up within that, and a recap is opened a few times per
    /// visit (deck, share cards).
    fn run_query(1800) -> Vec<RecapRow>;
}

const fn game_mode_name(game_mode: u8) -> &'static str {
    if game_mode == GAME_MODE_STREET_BRAWL {
        "street_brawl"
    } else {
        "normal"
    }
}

const fn match_mode_name(match_mode: u8) -> &'static str {
    if match_mode == MATCH_MODE_RANKED {
        "ranked"
    } else {
        "unranked"
    }
}

fn add(total: &mut u64, value: u32) {
    *total = total.saturating_add(u64::from(value));
}

const fn bump(total: &mut u64) {
    *total = total.saturating_add(1);
}

/// The best value seen so far for one record stat; ties keep the earlier match.
struct RecordSlot {
    stat: &'static str,
    best: Option<(u64, u64, u32, u8, bool)>,
    /// Lowest instead of highest.
    lowest: bool,
}

impl RecordSlot {
    const fn new(stat: &'static str) -> Self {
        Self {
            stat,
            best: None,
            lowest: false,
        }
    }

    const fn lowest(stat: &'static str) -> Self {
        Self {
            stat,
            best: None,
            lowest: true,
        }
    }

    fn offer(&mut self, value: u64, row: &RecapRow) {
        if value == 0 {
            return;
        }
        let better = self.best.is_none_or(|(best, ..)| {
            if self.lowest {
                value < best
            } else {
                value > best
            }
        });
        if better {
            self.best = Some((value, row.match_id, row.start_time, row.hero_id, row.won));
        }
    }

    fn into_record(self) -> Option<RecapRecord> {
        let (value, match_id, start_time, hero_id, won) = self.best?;
        Some(RecapRecord {
            stat: self.stat,
            value,
            match_id,
            start_time,
            hero_id,
            won,
        })
    }
}

#[derive(Default)]
struct StreakTracker {
    current: RecapStreak,
    current_won: Option<bool>,
    streaks: RecapStreaks,
}

impl StreakTracker {
    fn push(&mut self, won: bool, start_time: u32) {
        if self.current_won == Some(won) {
            self.current.length = self.current.length.saturating_add(1);
            self.current.to = start_time;
        } else {
            self.current = RecapStreak {
                length: 1,
                from: start_time,
                to: start_time,
            };
            self.current_won = Some(won);
        }
        let longest = if won {
            &mut self.streaks.longest_win
        } else {
            &mut self.streaks.longest_loss
        };
        if self.current.length > longest.length {
            *longest = self.current.clone();
        }
    }
}

/// Entries sorted by `key`, most first, ties by map key.
fn sorted_desc<K: Ord + Copy, V>(map: HashMap<K, V>, key: impl Fn(&V) -> u64) -> Vec<(K, V)> {
    let mut entries: Vec<(K, V)> = map.into_iter().collect();
    entries.sort_by(|(ka, a), (kb, b)| key(b).cmp(&key(a)).then(ka.cmp(kb)));
    entries
}

/// Distinct values of a per-match list (an item bought twice counts once per match).
fn distinct<T: Ord + Copy>(values: &[T]) -> Vec<T> {
    let mut out = values.to_vec();
    out.sort_unstable();
    out.dedup();
    out
}

const fn count_win(entry: &mut (u64, u64), won: bool) {
    bump(&mut entry.0);
    if won {
        bump(&mut entry.1);
    }
}

#[expect(
    clippy::too_many_lines,
    reason = "one pass over the rows that fills every section reads clearer than split helpers"
)]
fn mode_recap(game_mode: u8, rows: &[&RecapRow]) -> ModeRecap {
    let mut totals = RecapTotals::default();
    let mut mvp = [0_u64; 3];
    let mut by_match_mode: HashMap<u8, RecapCount> = HashMap::new();
    let mut heroes: HashMap<u8, RecapHero> = HashMap::new();
    let mut teams: HashMap<u8, (u64, u64)> = HashMap::new();
    let mut lanes: HashMap<u8, (u64, u64)> = HashMap::new();
    let mut items: HashMap<u32, (u64, u64)> = HashMap::new();
    let mut sources: HashMap<String, (u64, u64)> = HashMap::new();
    let mut targets: HashMap<u8, (u64, u64)> = HashMap::new();
    let mut killers: HashMap<u8, u64> = HashMap::new();
    let mut enemies: HashMap<u8, (u64, u64)> = HashMap::new();
    let mut accolades: HashMap<u16, u64> = HashMap::new();
    let mut streaks = StreakTracker::default();
    let mut rank_points: Vec<RecapRankPoint> = Vec::new();
    let mut ranked_matches = 0_u64;

    let mut kills = RecordSlot::new("kills");
    let mut assists = RecordSlot::new("assists");
    let mut deaths = RecordSlot::new("deaths");
    let mut player_damage = RecordSlot::new("player_damage");
    let mut damage_taken = RecordSlot::new("damage_taken");
    let mut damage_mitigated = RecordSlot::new("damage_mitigated");
    let mut player_healing = RecordSlot::new("player_healing");
    let mut teammate_healing = RecordSlot::new("teammate_healing");
    let mut souls = RecordSlot::new("souls");
    let mut last_hits = RecordSlot::new("last_hits");
    let mut denies = RecordSlot::new("denies");
    let mut boss_damage = RecordSlot::new("boss_damage");
    let mut headshot_kills = RecordSlot::new("headshot_kills");
    let mut parries = RecordSlot::new("parries");
    let mut time_dead = RecordSlot::new("time_dead_s");
    let mut cc = RecordSlot::new("cc_ms");
    let mut longest = RecordSlot::new("longest_match_s");
    let mut shortest_win = RecordSlot::lowest("shortest_win_s");

    for &row in rows {
        bump(&mut totals.matches);
        if row.won {
            bump(&mut totals.wins);
        }
        add(&mut totals.seconds_played, row.duration_s);
        add(&mut totals.kills, row.kills);
        add(&mut totals.deaths, row.deaths);
        add(&mut totals.assists, row.assists);
        add(&mut totals.souls, row.net_worth);
        add(&mut totals.last_hits, row.last_hits);
        add(&mut totals.denies, row.denies);
        add(&mut totals.player_damage, row.player_damage);
        add(&mut totals.damage_taken, row.damage_taken);
        add(&mut totals.damage_mitigated, row.damage_mitigated);
        add(&mut totals.boss_damage, row.boss_damage);
        add(&mut totals.shots_hit, row.shots_hit);
        add(&mut totals.shots_missed, row.shots_missed);
        add(&mut totals.hero_bullets_hit, row.hero_bullets_hit);
        add(&mut totals.hero_bullets_crit, row.hero_bullets_crit);
        if row.match_id >= MVP_RANK_SINCE_MATCH_ID {
            bump(&mut totals.mvp_rated_matches);
        }
        let mvp_slot = row
            .mvp_rank
            .and_then(|rank| rank.checked_sub(1))
            .and_then(|index| usize::try_from(index).ok())
            .and_then(|index| mvp.get_mut(index));
        if let Some(count) = mvp_slot {
            bump(count);
        }
        if let Some(buffs) = row.permanent_buffs {
            add(&mut totals.permanent_buffs, buffs);
            bump(&mut totals.permanent_buff_matches);
        }

        let count = by_match_mode.entry(row.match_mode).or_default();
        bump(&mut count.matches);
        if row.won {
            bump(&mut count.wins);
        }
        add(&mut count.seconds, row.duration_s);

        let hero = heroes.entry(row.hero_id).or_insert_with(|| RecapHero {
            hero_id: row.hero_id,
            first_played: row.start_time,
            ..RecapHero::default()
        });
        bump(&mut hero.matches);
        if row.won {
            bump(&mut hero.wins);
        }
        add(&mut hero.seconds, row.duration_s);
        add(&mut hero.kills, row.kills);
        add(&mut hero.deaths, row.deaths);
        add(&mut hero.assists, row.assists);
        add(&mut hero.player_damage, row.player_damage);
        add(&mut hero.souls, row.net_worth);
        hero.last_played = hero.last_played.max(row.start_time);

        streaks.push(row.won, row.start_time);

        if game_mode == GAME_MODE_NORMAL && row.match_mode == MATCH_MODE_RANKED {
            bump(&mut ranked_matches);
            // Badge 0 is placement, not a rank.
            if let Some(badge) = row.rank_badge_after.filter(|badge| *badge > 0) {
                rank_points.push(RecapRankPoint {
                    start_time: row.start_time,
                    badge,
                });
            }
        }

        kills.offer(u64::from(row.kills), row);
        assists.offer(u64::from(row.assists), row);
        deaths.offer(u64::from(row.deaths), row);
        player_damage.offer(u64::from(row.player_damage), row);
        damage_taken.offer(u64::from(row.damage_taken), row);
        damage_mitigated.offer(u64::from(row.damage_mitigated), row);
        souls.offer(u64::from(row.net_worth), row);
        last_hits.offer(u64::from(row.last_hits), row);
        denies.offer(u64::from(row.denies), row);
        boss_damage.offer(u64::from(row.boss_damage), row);
        longest.offer(u64::from(row.duration_s), row);
        if row.won {
            shortest_win.offer(u64::from(row.duration_s), row);
        }

        if !row.has_details {
            continue;
        }
        bump(&mut totals.detailed_matches);
        add(&mut totals.player_healing, row.player_healing);
        add(&mut totals.teammate_healing, row.teammate_healing);
        add(&mut totals.teammate_barriering, row.teammate_barriering);
        add(&mut totals.headshot_kills, row.headshot_kills);
        add(&mut totals.bullet_kills, row.bullet_kills);
        add(&mut totals.melee_kills, row.melee_kills);
        add(&mut totals.ability_kills, row.ability_kills);
        add(&mut totals.time_dead_s, row.time_dead_s);
        if row.abandon_match_time_s > 0 {
            bump(&mut totals.abandons);
        }
        add(&mut totals.parries, row.parries);
        add(&mut totals.parry_misses, row.parry_misses);
        add(&mut totals.unspent_gold_minutes, row.unspent_gold_minutes);
        add(&mut totals.breakables_broken, row.breakables_broken);
        add(&mut totals.comeback_gold, row.comeback_gold);
        add(&mut totals.gold_players, row.gold_players);
        add(&mut totals.gold_lane_creeps, row.gold_lane_creeps);
        add(&mut totals.gold_neutrals, row.gold_neutrals);
        add(&mut totals.gold_bosses, row.gold_bosses);
        add(&mut totals.gold_treasure, row.gold_treasure);
        add(&mut totals.gold_breakables, row.gold_breakables);
        add(&mut totals.gold_death_loss, row.gold_death_loss);
        player_healing.offer(u64::from(row.player_healing), row);
        teammate_healing.offer(u64::from(row.teammate_healing), row);
        headshot_kills.offer(u64::from(row.headshot_kills), row);
        parries.offer(u64::from(row.parries), row);
        time_dead.offer(u64::from(row.time_dead_s), row);

        count_win(teams.entry(row.team).or_default(), row.won);
        if row.assigned_lane > 0 {
            count_win(lanes.entry(row.assigned_lane).or_default(), row.won);
        }
        for item_id in distinct(&row.upgrade_ids) {
            count_win(items.entry(item_id).or_default(), row.won);
        }
        for &killer in &row.killer_hero_ids {
            if killer == 0 {
                bump(&mut totals.non_hero_deaths);
            } else {
                bump(killers.entry(killer).or_default());
            }
        }
        for hero_id in distinct(&row.enemy_hero_ids) {
            count_win(enemies.entry(hero_id).or_default(), row.won);
        }
        for accolade_id in distinct(&row.accolade_ids) {
            bump(accolades.entry(accolade_id).or_default());
        }

        let has_damage_matrix = !row.dm_sources.is_empty()
            || row.dm_bullet > 0
            || row.dm_ability > 0
            || row.dm_melee > 0
            || row.cc_ms > 0;
        if !has_damage_matrix {
            continue;
        }
        bump(&mut totals.damage_matrix_matches);
        add(&mut totals.dm_bullet, row.dm_bullet);
        add(&mut totals.dm_ability, row.dm_ability);
        add(&mut totals.dm_melee, row.dm_melee);
        add(&mut totals.cc_ms, row.cc_ms);
        add(&mut totals.cc_stun_ms, row.cc_stun_ms);
        add(&mut totals.heal_prevented, row.heal_prevented);
        cc.offer(u64::from(row.cc_ms), row);
        for (source, damage) in row.dm_sources.iter().zip(&row.dm_source_damage) {
            let entry = sources.entry(source.clone()).or_default();
            add(&mut entry.0, *damage);
            bump(&mut entry.1);
        }
        let mut damaged: Vec<u8> = Vec::new();
        for (&hero_id, &damage) in row.dm_target_hero_ids.iter().zip(&row.dm_target_damage) {
            if hero_id == 0 {
                continue;
            }
            let entry = targets.entry(hero_id).or_default();
            add(&mut entry.0, damage);
            if !damaged.contains(&hero_id) {
                damaged.push(hero_id);
                bump(&mut entry.1);
            }
        }
    }
    totals.mvp_rank_counts = mvp.to_vec();

    let mut by_match_mode: Vec<RecapMatchModeCount> = by_match_mode
        .into_iter()
        .filter(|(mode, _)| *mode == MATCH_MODE_RANKED || *mode == MATCH_MODE_UNRANKED)
        .map(|(mode, count)| RecapMatchModeCount {
            match_mode: match_mode_name(mode),
            matches: count.matches,
            wins: count.wins,
            seconds: count.seconds,
        })
        .collect();
    by_match_mode.sort_by(|a, b| {
        b.matches
            .cmp(&a.matches)
            .then(a.match_mode.cmp(b.match_mode))
    });

    let mut heroes: Vec<RecapHero> = heroes.into_values().collect();
    heroes.sort_by(|a, b| {
        b.matches
            .cmp(&a.matches)
            .then(b.seconds.cmp(&a.seconds))
            .then(a.hero_id.cmp(&b.hero_id))
    });

    let mut teams: Vec<RecapTeamCount> = teams
        .into_iter()
        .filter(|(team, _)| *team <= 1)
        .map(|(team, (matches, wins))| RecapTeamCount {
            team,
            matches,
            wins,
        })
        .collect();
    teams.sort_by_key(|t| t.team);

    let mut lanes: Vec<RecapLaneCount> = lanes
        .into_iter()
        .map(|(lane, (matches, wins))| RecapLaneCount {
            lane,
            matches,
            wins,
        })
        .collect();
    lanes.sort_by_key(|l| l.lane);

    let items = sorted_desc(items, |(matches, _)| *matches)
        .into_iter()
        .take(TOP_ITEMS)
        .map(|(item_id, (matches, wins))| RecapItem {
            item_id,
            matches,
            wins,
        })
        .collect();

    let mut damage_sources: Vec<RecapDamageSource> = sources
        .into_iter()
        .map(|(source, (damage, matches))| RecapDamageSource {
            source,
            damage,
            matches,
        })
        .collect();
    damage_sources.sort_by(|a, b| b.damage.cmp(&a.damage).then(a.source.cmp(&b.source)));
    damage_sources.truncate(TOP_DAMAGE_SOURCES);

    let damage_targets = sorted_desc(targets, |(damage, _)| *damage)
        .into_iter()
        .map(|(hero_id, (damage, matches))| RecapHeroDamage {
            hero_id,
            damage,
            matches,
        })
        .collect();
    let killers = sorted_desc(killers, |deaths| *deaths)
        .into_iter()
        .map(|(hero_id, deaths)| RecapKiller { hero_id, deaths })
        .collect();
    let enemies = sorted_desc(enemies, |(matches, _)| *matches)
        .into_iter()
        .map(|(hero_id, (matches, wins))| RecapEnemy {
            hero_id,
            matches,
            wins,
        })
        .collect();
    let accolades = sorted_desc(accolades, |matches| *matches)
        .into_iter()
        .map(|(accolade_id, matches)| RecapAccolade {
            accolade_id,
            matches,
        })
        .collect();

    let rank = (game_mode == GAME_MODE_NORMAL && ranked_matches > 0).then(|| {
        let first_badge = rank_points.first().map_or(0, |p| p.badge);
        let last_badge = rank_points.last().map_or(0, |p| p.badge);
        let (peak_badge, peak_at) = rank_points.iter().fold((0, 0), |(peak, at), p| {
            if p.badge > peak {
                (p.badge, p.start_time)
            } else {
                (peak, at)
            }
        });
        RecapRank {
            ranked_matches,
            first_badge,
            last_badge,
            peak_badge,
            peak_at,
            points: rank_points,
        }
    });

    let records = [
        kills,
        assists,
        deaths,
        player_damage,
        damage_taken,
        damage_mitigated,
        player_healing,
        teammate_healing,
        souls,
        last_hits,
        denies,
        boss_damage,
        headshot_kills,
        parries,
        time_dead,
        cc,
        longest,
        shortest_win,
    ]
    .into_iter()
    .filter_map(RecordSlot::into_record)
    .collect();

    ModeRecap {
        game_mode: game_mode_name(game_mode),
        totals,
        by_match_mode,
        heroes,
        teams,
        lanes,
        records,
        streaks: streaks.streaks,
        items,
        damage_sources,
        damage_targets,
        killers,
        enemies,
        accolades,
        rank,
    }
}

fn build_recap(
    account_id: u32,
    year: i32,
    (start_unix, end_unix): (i64, i64),
    rows: &[RecapRow],
) -> YearRecap {
    let matches = rows
        .iter()
        .map(|row| RecapMatch {
            match_id: row.match_id,
            start_time: row.start_time,
            duration_s: row.duration_s,
            game_mode: game_mode_name(row.game_mode),
            match_mode: match_mode_name(row.match_mode),
            hero_id: row.hero_id,
            won: row.won,
        })
        .collect();
    let modes = [GAME_MODE_NORMAL, GAME_MODE_STREET_BRAWL]
        .into_iter()
        .filter_map(|game_mode| {
            let mode_rows: Vec<&RecapRow> =
                rows.iter().filter(|r| r.game_mode == game_mode).collect();
            (!mode_rows.is_empty()).then(|| mode_recap(game_mode, &mode_rows))
        })
        .collect();
    YearRecap {
        account_id,
        year,
        start_unix,
        end_unix,
        matches,
        modes,
    }
}

async fn get_year_recap(
    ch_client: &clickhouse::Client,
    account_id: u32,
    year: i32,
) -> APIResult<YearRecap> {
    let bounds = year_bounds(year)
        .ok_or_else(|| APIError::status_msg(StatusCode::BAD_REQUEST, "Invalid year."))?;
    let rows: Arc<Vec<RecapRow>> =
        run_query(ch_client, &build_query(account_id, bounds.0, bounds.1)).await?;
    Ok(build_recap(account_id, year, bounds, &rows))
}

/// Internal endpoint behind the website's "Year in Deadlock" recap, left out of the `OpenAPI` docs.
///
/// A player's Ranked and Unranked matches of one calendar year (UTC), Normal mode and Street Brawl
/// separately: totals, heroes, single-match records, streaks, rank journey, sides, lanes, items,
/// accolades, deaths by enemy hero and the damage matrix sums. Outside the recap's window (1
/// December to 15 January, UTC) it answers 404 in release builds, so the recap stays unseen until
/// it opens; debug builds always answer.
pub(super) async fn year_recap(
    Path(AccountIdQuery { account_id }): Path<AccountIdQuery>,
    Query(query): Query<YearRecapQuery>,
    State(state): State<AppState>,
) -> APIResult<impl IntoResponse> {
    let now = Utc::now();
    if !cfg!(debug_assertions) && !is_recap_open(now) {
        return Err(APIError::status_msg(StatusCode::NOT_FOUND, "Not found."));
    }
    ensure_not_protected(&state, &[account_id]).await?;
    let year = query.year.unwrap_or_else(|| default_year(now));
    if year < FIRST_RECAP_YEAR || year > now.year() {
        return Err(APIError::status_msg(
            StatusCode::BAD_REQUEST,
            format!("Recaps cover {FIRST_RECAP_YEAR} up to the current year."),
        ));
    }
    get_year_recap(&state.ch_client_ro, account_id, year)
        .await
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(match_id: u64, start_time: u32, won: bool) -> RecapRow {
        RecapRow {
            match_id,
            start_time,
            duration_s: 1800,
            game_mode: GAME_MODE_NORMAL,
            match_mode: MATCH_MODE_RANKED,
            hero_id: 7,
            won,
            kills: 5,
            deaths: 2,
            assists: 9,
            net_worth: 30_000,
            last_hits: 200,
            denies: 10,
            player_damage: 20_000,
            damage_taken: 15_000,
            damage_mitigated: 5_000,
            boss_damage: 8_000,
            shots_hit: 1_000,
            shots_missed: 800,
            hero_bullets_hit: 300,
            hero_bullets_crit: 30,
            mvp_rank: Some(1),
            permanent_buffs: None,
            rank_badge_after: Some(83),
            has_details: true,
            team: 0,
            assigned_lane: 4,
            abandon_match_time_s: 0,
            player_healing: 3_000,
            teammate_healing: 0,
            teammate_barriering: 0,
            headshot_kills: 1,
            bullet_kills: 3,
            melee_kills: 1,
            ability_kills: 1,
            time_dead_s: 90,
            killer_hero_ids: vec![12, 0],
            upgrade_ids: vec![1, 2, 2],
            accolade_ids: vec![5],
            enemy_hero_ids: vec![12, 13],
            parries: 2,
            parry_misses: 1,
            unspent_gold_minutes: 1_000,
            breakables_broken: 4,
            comeback_gold: 0,
            gold_players: 1,
            gold_lane_creeps: 1,
            gold_neutrals: 1,
            gold_bosses: 1,
            gold_treasure: 1,
            gold_breakables: 1,
            gold_death_loss: 1,
            dm_sources: vec!["upgrade_magic_burst".to_owned()],
            dm_source_damage: vec![700],
            dm_bullet: 1_000,
            dm_ability: 700,
            dm_melee: 0,
            dm_target_hero_ids: vec![12, 13],
            dm_target_damage: vec![900, 800],
            cc_ms: 2_000,
            cc_stun_ms: 500,
            heal_prevented: 0,
        }
    }

    #[test]
    fn default_year_is_this_year_in_december_only() {
        let dec = Utc.with_ymd_and_hms(2026, 12, 3, 0, 0, 0).unwrap();
        let jan = Utc.with_ymd_and_hms(2027, 1, 10, 0, 0, 0).unwrap();
        assert_eq!(default_year(dec), 2026);
        assert_eq!(default_year(jan), 2026);
    }

    #[test]
    fn open_from_december_through_mid_january() {
        let at = |m, d| Utc.with_ymd_and_hms(2026, m, d, 12, 0, 0).unwrap();
        assert!(!is_recap_open(at(11, 30)));
        assert!(is_recap_open(at(12, 1)));
        assert!(is_recap_open(at(1, 15)));
        assert!(!is_recap_open(at(1, 16)));
    }

    #[test]
    fn year_bounds_are_utc_calendar_year() {
        assert_eq!(year_bounds(2026), Some((1_767_225_600, 1_798_761_600)));
    }

    #[test]
    fn streaks_records_and_counts() {
        let mut long = row(4, 400, true);
        long.duration_s = 3_000;
        long.kills = 20;
        long.mvp_rank = Some(2);
        let rows = vec![
            row(1, 100, true),
            row(2, 200, false),
            row(3, 300, true),
            long,
        ];
        let recap = build_recap(1, 2026, (0, 1), &rows);
        let normal = recap.modes.first().unwrap();
        assert_eq!(normal.totals.matches, 4);
        assert_eq!(normal.totals.wins, 3);
        assert_eq!(normal.streaks.longest_win.length, 2);
        assert_eq!(normal.streaks.longest_win.from, 300);
        assert_eq!(normal.streaks.longest_loss.length, 1);
        let kills = normal.records.iter().find(|r| r.stat == "kills").unwrap();
        assert_eq!((kills.value, kills.match_id), (20, 4));
        let shortest = normal
            .records
            .iter()
            .find(|r| r.stat == "shortest_win_s")
            .unwrap();
        assert_eq!((shortest.value, shortest.match_id), (1800, 1));
        // An item bought twice in one match counts once.
        let item = normal.items.iter().find(|i| i.item_id == 2).unwrap();
        assert_eq!(item.matches, 4);
        assert_eq!(normal.totals.non_hero_deaths, 4);
        assert_eq!(normal.killers.first().unwrap().deaths, 4);
        // Match ids below the MVP cutoff still count their ranks; only the rated count differs.
        assert_eq!(normal.totals.mvp_rank_counts, vec![3, 1, 0]);
        let rank = normal.rank.as_ref().unwrap();
        assert_eq!(
            (rank.ranked_matches, rank.peak_badge, rank.points.len()),
            (4, 83, 4)
        );
        let target = normal.damage_targets.first().unwrap();
        assert_eq!(
            (target.hero_id, target.damage, target.matches),
            (12, 3_600, 4)
        );
    }

    #[test]
    fn rows_without_details_skip_detail_sections() {
        let mut bare = row(1, 100, true);
        bare.has_details = false;
        let recap = build_recap(1, 2026, (0, 1), &[bare]);
        let normal = recap.modes.first().unwrap();
        assert_eq!(normal.totals.detailed_matches, 0);
        assert!(normal.items.is_empty());
        assert!(normal.damage_sources.is_empty());
    }

    #[test]
    fn street_brawl_is_its_own_mode() {
        let mut brawl = row(2, 200, true);
        brawl.game_mode = GAME_MODE_STREET_BRAWL;
        let recap = build_recap(1, 2026, (0, 1), &[row(1, 100, true), brawl]);
        let names: Vec<_> = recap.modes.iter().map(|m| m.game_mode).collect();
        assert_eq!(names, vec!["normal", "street_brawl"]);
        assert!(recap.modes[1].rank.is_none());
    }
}
