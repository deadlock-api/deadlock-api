mod models;

use crate::models::active_match::ClickHouseActiveMatch;
use crate::models::enums::{GameMode, MatchMode, RegionMode};
use clickhouse::Client;
use kdam::tqdm;
use std::collections::HashSet;
use std::sync::LazyLock;
use tokio_postgres::NoTls;

static CLICKHOUSE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("CLICKHOUSE_URL").unwrap_or("http://localhost:8123".to_string())
});
static CLICKHOUSE_USER: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_USER").unwrap());
static CLICKHOUSE_PASSWORD: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_PASSWORD").unwrap());
static CLICKHOUSE_DB: LazyLock<String> = LazyLock::new(|| std::env::var("CLICKHOUSE_DB").unwrap());

#[tokio::main]
async fn main() {
    let client = Client::default()
        .with_url(CLICKHOUSE_URL.clone())
        .with_user(CLICKHOUSE_USER.clone())
        .with_password(CLICKHOUSE_PASSWORD.clone())
        .with_database(CLICKHOUSE_DB.clone());

    let (pgclient, connection) = tokio_postgres::connect(
        "host=v6006.debiandev.space port=5433 user=deadlockd password=Hexe562 dbname=postgres",
        NoTls,
    )
    .await
    .unwrap();
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    let query = r#"
            SELECT 
            DISTINCT ON (
                mts.match_id,
                mts.net_worth_team_0,
                mts.net_worth_team_1,
                mts.objectives_mask_team0,
                mts.objectives_mask_team1,
                mts.spectators,
                mts.open_spectator_slots
            ) 
            mts.match_id,
            m.start_time,
            0                                               as winning_team,
            array_agg(mp.account_id ORDER BY mp.account_id) as players_account_ids,
            array_agg(mp.team ORDER BY mp.account_id)       as players_teams,
            array_agg(mp.hero_id ORDER BY mp.account_id)    as players_heroes,
            array_agg(mp.abandoned ORDER BY mp.account_id)  as players_abandoned,
            m.lobby_id,
            mts.net_worth_team_0,
            mts.net_worth_team_1,
            mts.spectators,
            mts.open_spectator_slots,
            mts.objectives_mask_team0,
            mts.objectives_mask_team1,
            1                                               as match_mode,
            1                                               as game_mode,
            m.match_score,
            m.region_mode
            FROM match_timeseries mts
            INNER JOIN match m ON m.match_id = mts.match_id
            LEFT JOIN public.match_player mp on m.match_id = mp.match_id
            WHERE mts.match_id >= 15000000
            GROUP BY mts.match_id, m.start_time, m.lobby_id, mts.net_worth_team_0, mts.net_worth_team_1, mts.spectators,
            m.match_score, mts.open_spectator_slots, mts.objectives_mask_team0, mts.objectives_mask_team1, m.region_mode;
         "#;
    let rows = pgclient.query(query, &[]).await.unwrap();

    let mut set = HashSet::new();

    println!("Rows: {:?}", rows.len());
    let mut insert = match client.insert("active_matches") {
        Ok(insert) => insert,
        Err(e) => {
            eprintln!("Failed to create insert: {}", e);
            return;
        }
    };
    for row in tqdm!(rows.iter(), desc = "Inserting active matches") {
        let match_id: i32 = row.get(0);
        let start_time: time::PrimitiveDateTime = row.get(1);
        let winning_team: i32 = row.get(2);
        let players_account_ids: Vec<i32> = row.get(3);
        let players_teams: Vec<i32> = row.get(4);
        let players_heroes: Vec<i32> = row.get(5);
        let players_abandoned: Vec<bool> = row.get(6);
        let lobby_id: i64 = row.get(7);
        let net_worth_team_0: i32 = row.get(8);
        let net_worth_team_1: i32 = row.get(9);
        let spectators: i16 = row.get(10);
        let open_spectator_slots: i16 = row.get(11);
        let objectives_mask_team0: i32 = row.get(12);
        let objectives_mask_team1: i32 = row.get(13);
        let match_mode: i32 = row.get(14);
        let game_mode: i32 = row.get(15);
        let match_score: i32 = row.get(16);
        let region_mode: i16 = row.get(17);

        let start_time = start_time.assume_utc().unix_timestamp() as u32;
        let ch_active_match = ClickHouseActiveMatch {
            start_time,
            winning_team: winning_team as u8,
            match_id: match_id as u64,
            players_account_id: players_account_ids.iter().map(|&x| x as u64).collect(),
            players_team: players_teams.iter().map(|&x| x as u8).collect(),
            players_abandoned,
            players_hero_id: players_heroes.iter().map(|&x| x as u8).collect(),
            lobby_id: lobby_id.to_string(),
            net_worth_team_0: net_worth_team_0 as u32,
            net_worth_team_1: net_worth_team_1 as u32,
            duration_s: 0,
            spectators: spectators as u32,
            open_spectator_slots: open_spectator_slots as u32,
            objectives_mask_team0: objectives_mask_team0 as u16,
            objectives_mask_team1: objectives_mask_team1 as u16,
            match_mode: MatchMode::from(match_mode as u8),
            game_mode: GameMode::from(game_mode as u8),
            match_score: match_score as u32,
            region_mode: RegionMode::from(region_mode as u8),
        };
        let key = (
            ch_active_match.match_id,
            ch_active_match.net_worth_team_0,
            ch_active_match.net_worth_team_1,
            ch_active_match.objectives_mask_team0,
            ch_active_match.objectives_mask_team1,
            ch_active_match.spectators,
            ch_active_match.open_spectator_slots,
        );
        if set.contains(&key) {
            continue;
        }
        set.insert(key);
        match insert.write(&ch_active_match).await {
            Ok(_) => (),
            Err(e) => eprintln!("Failed to insert active match: {}", e),
        }
    }
    match insert.end().await {
        Ok(_) => (),
        Err(e) => eprintln!("Failed to commit insert: {}", e),
    }

    // let mut delay_set = HashSetDelay::new(Duration::from_secs(2 * 60));
    //
    // let ch_active_matches: Vec<_> = active_matches
    //     .into_iter()
    //     .filter(|am| {
    //         let key = (
    //             am.match_id,
    //             am.net_worth_team_0,
    //             am.net_worth_team_1,
    //             am.objectives_mask_team0,
    //             am.objectives_mask_team1,
    //         );
    //         if delay_set.contains_key(&key) {
    //             return false;
    //         }
    //         delay_set.insert(key);
    //         true
    //     })
    //     .map(ClickHouseActiveMatch::from)
    //     .collect();
    // if ch_active_matches.is_empty() {
    //     return;
    // }
    // println!("Inserting {} active matches", ch_active_matches.len());
    // let mut insert = match client.insert("active_matches") {
    //     Ok(insert) => insert,
    //     Err(e) => {
    //         eprintln!("Failed to create insert: {}", e);
    //         return;
    //     }
    // };
    // for ch_active_match in ch_active_matches {
    //     match insert.write(&ch_active_match).await {
    //         Ok(_) => (),
    //         Err(e) => eprintln!("Failed to insert active match: {}", e),
    //     }
    // }
    // match insert.end().await {
    //     Ok(_) => (),
    //     Err(e) => eprintln!("Failed to commit insert: {}", e),
    // }
}
