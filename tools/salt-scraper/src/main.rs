use base64::prelude::*;
use base64::Engine;
use clickhouse::Compression;
use log::{debug, info, warn};
use models::{InvokeResponse200, MatchIdQueryResult, MatchSalt};
use prost::Message as _;
use reqwest::Client;
use serde_json::json;
use std::sync::LazyLock;
use std::time::Duration;
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult::KEResultRateLimited;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages,
};

mod models;

static INTERNAL_DEADLOCK_API_KEY: LazyLock<String> = LazyLock::new(|| {
    std::env::var("INTERNAL_DEADLOCK_API_KEY").expect("INTERNAL_DEADLOCK_API_KEY must be set")
});
static CLICKHOUSE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("CLICKHOUSE_URL").unwrap_or("http://127.0.0.1:8123".to_string())
});
static CLICKHOUSE_USER: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_USER").unwrap_or("default".to_string()));
static CLICKHOUSE_PASSWORD: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_PASSWORD").unwrap());
static CLICKHOUSE_DB: LazyLock<String> =
    LazyLock::new(|| std::env::var("CLICKHOUSE_DB").unwrap_or("default".to_string()));
static PROXY_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("PROXY_URL")
        .unwrap_or("https://nsu-proxy-devlock-v2.plants.sh/pool/invoke-job".to_string())
});
static PROXY_API_TOKEN: LazyLock<String> =
    LazyLock::new(|| std::env::var("PROXY_API_TOKEN").expect("PROXY_API_TOKEN must be set"));
static SALTS_COOLDOWN_MILLIS: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("SALTS_COOLDOWN_MILLIS")
        .map(|x| x.parse().expect("SALTS_COOLDOWN_MILLIS must be a number"))
        .unwrap_or(36_000)
});
static SALTS_RATE_LIMIT_COOLDOWN_MILLIS: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("SALTS_RATE_LIMIT_COOLDOWN_MILLIS")
        .map(|x| {
            x.parse()
                .expect("SALTS_RATE_LIMIT_COOLDOWN_MILLIS must be a number")
        })
        .unwrap_or(*SALTS_COOLDOWN_MILLIS)
});

#[tokio::main]
async fn main() {
    env_logger::init();

    let clickhouse_client = clickhouse::Client::default()
        .with_url(CLICKHOUSE_URL.clone())
        .with_user(CLICKHOUSE_USER.clone())
        .with_password(CLICKHOUSE_PASSWORD.clone())
        .with_database(CLICKHOUSE_DB.clone())
        .with_compression(Compression::None);

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();

    loop {
        // let query = "SELECT DISTINCT match_id FROM finished_matches WHERE start_time < now() - INTERVAL '3 hours' AND match_id NOT IN (SELECT match_id FROM match_salts UNION DISTINCT SELECT match_id FROM match_info) ORDER BY start_time DESC LIMIT 1000";
        let query = r"
        WITH matches_raw AS (
            SELECT DISTINCT match_id, toUnixTimestamp(start_time) AS start_time, match_score FROM finished_matches
            UNION DISTINCT
            SELECT DISTINCT match_id, start_time, 0 AS match_score FROM player_match_history
            WHERE match_mode IN ('Ranked', 'Unranked')
        ),
        matches AS (
            SELECT match_id, start_time, max(match_score) AS match_score
            FROM matches_raw
            GROUP BY match_id, start_time
        )
        SELECT match_id
        FROM matches
        WHERE start_time < now() - INTERVAL '3 hours' AND start_time > toDateTime('2024-11-01')
        AND match_id NOT IN (SELECT match_id FROM match_salts UNION DISTINCT SELECT match_id FROM match_info)
        ORDER BY toStartOfDay(fromUnixTimestamp(start_time)) DESC, intDivOrZero(match_score, 250) DESC, match_id DESC -- Within batches of a day, prioritize higher ranked matches
        LIMIT 100
        ";
        let recent_matches: Vec<MatchIdQueryResult> =
            clickhouse_client.query(query).fetch_all().await.unwrap();
        let mut recent_matches: Vec<u64> = recent_matches.into_iter().map(|m| m.match_id).collect();
        if recent_matches.len() < 100 {
            info!(
                "Only got {} matches, fetching salts fot hltv matches.",
                recent_matches.len()
            );
            let query = r"
                SELECT DISTINCT match_id
                FROM match_info
                WHERE match_id NOT IN (SELECT match_id FROM match_salts)
                    AND start_time < now() - INTERVAL '3 hours' AND start_time > toDateTime('2024-11-01')
                ORDER BY match_id
                LIMIT ?
                ";
            let additional_matches: Vec<MatchIdQueryResult> = clickhouse_client
                .query(query)
                .bind(100 - recent_matches.len())
                .fetch_all()
                .await
                .unwrap();
            recent_matches.extend(additional_matches.into_iter().map(|m| m.match_id));
        }
        for m in recent_matches {
            fetch_match(&client, m).await;
        }
    }
}

async fn fetch_salt(client: &Client, match_id: u64) -> reqwest::Result<InvokeResponse200> {
    let message = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        ..Default::default()
    };
    let mut data = Vec::new();
    message.encode(&mut data).unwrap();
    let data_b64 = BASE64_STANDARD.encode(data);
    let body = json!({
        "message_kind": EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as u32,
        "job_cooldown_millis": *SALTS_COOLDOWN_MILLIS,
        "rate_limit_cooldown_millis": *SALTS_RATE_LIMIT_COOLDOWN_MILLIS,
        "bot_in_all_groups": ["GetMatchMetaData"],
        "data": data_b64,
    });
    client
        .post(PROXY_URL.clone())
        .header("Authorization", format!("Bearer {}", *PROXY_API_TOKEN))
        .json(&body)
        .send()
        .await
        .and_then(|resp| resp.error_for_status())?
        .json()
        .await
}

async fn fetch_match(client: &Client, match_id: u64) {
    let res = tryhard::retry_fn(|| fetch_salt(client, match_id))
        .retries(10)
        .exponential_backoff(Duration::from_secs(1))
        .max_delay(Duration::from_secs(20))
        .await;
    let res = match res {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to fetch match {}: {:?}", match_id, e);
            return;
        }
    };

    info!("Got a 200 response");
    let buf = BASE64_STANDARD.decode(res.data).unwrap();
    let response = CMsgClientToGcGetMatchMetaDataResponse::decode(buf.as_slice()).unwrap();
    if let Some(r) = response.result {
        if r == KEResultRateLimited as i32 {
            warn!(
                "Got a rate limited response with username {:?}: {:?}",
                res.username, response
            );
            return;
        }
    };
    match ingest_salts(client, &[(response, match_id, res.username.clone())]).await {
        Ok(_) => info!(
            "Ingested salts for match {} with username: {:?}",
            match_id, res.username
        ),
        Err(e) => warn!(
            "Failed to ingest salts for match {} with username {:?}: {:?}",
            match_id, res.username, e
        ),
    };
}

async fn ingest_salts(
    client: &Client,
    salts: &[(CMsgClientToGcGetMatchMetaDataResponse, u64, Option<String>)],
) -> reqwest::Result<()> {
    debug!("Ingesting salts: {:?}", salts);
    let salts: Vec<_> = salts
        .iter()
        .map(|(r, m, u)| {
            let cluster_id = r.replay_group_id.unwrap_or(0);
            let metadata_salt = r.metadata_salt.unwrap_or(0);
            let replay_salt = r.replay_salt.unwrap_or(0);
            MatchSalt {
                cluster_id,
                match_id: *m,
                metadata_salt,
                replay_salt,
                username: u.clone(),
            }
        })
        .collect();
    debug!("Ingesting salts: {:?}", salts);
    client
        .post("https://api.deadlock-api.com/v1/matches/salts")
        .header("X-API-Key", INTERNAL_DEADLOCK_API_KEY.clone())
        .json(&salts)
        .send()
        .await
        .map(|_| ())
}
