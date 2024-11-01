use arl::RateLimiter;
use base64::prelude::*;
use base64::Engine;
use clickhouse::Compression;
use log::{debug, info, warn};
use models::{InvokeResponse200, MatchIdQueryResult, MatchSalt};
use prost::Message as _;
use reqwest::{Client, StatusCode};
use serde_json::json;
use std::sync::LazyLock;
use std::time::Duration;
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult::{
    KEResultInvalidMatch, KEResultRateLimited,
};
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages,
};

mod models;

static INTERNAL_DEADLOCK_API_KEY: LazyLock<String> = LazyLock::new(|| {
    std::env::var("INTERNAL_DEADLOCK_API_KEY").expect("INTERNAL_DEADLOCK_API_KEY must be set")
});
static NUM_ACCOUNTS: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("NUM_ACCOUNTS")
        .expect("NUM_ACCOUNTS must be set")
        .parse()
        .expect("NUM_ACCOUNTS must be a number")
});
static CALLS_PER_ACCOUNT_PER_HOUR: LazyLock<usize> = LazyLock::new(|| {
    std::env::var("CALLS_PER_ACCOUNT_PER_HOUR")
        .expect("CALLS_PER_ACCOUNT_PER_HOUR must be set")
        .parse()
        .expect("CALLS_PER_ACCOUNT_PER_HOUR must be a number")
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

#[tokio::main]
async fn main() {
    env_logger::init();

    let clickhouse_client = clickhouse::Client::default()
        .with_url(CLICKHOUSE_URL.clone())
        .with_user(CLICKHOUSE_USER.clone())
        .with_password(CLICKHOUSE_PASSWORD.clone())
        .with_database(CLICKHOUSE_DB.clone())
        .with_compression(Compression::None);

    let message_type = EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData as u32;
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let limiter = RateLimiter::new(
        *NUM_ACCOUNTS,
        Duration::from_secs(60 * 60 / *CALLS_PER_ACCOUNT_PER_HOUR as u64),
    );
    loop {
        // let query = "SELECT DISTINCT match_id FROM finished_matches WHERE start_time < now() - INTERVAL '4 hours' AND match_id NOT IN (SELECT match_id FROM match_salts UNION DISTINCT SELECT match_id FROM match_info) ORDER BY start_time DESC LIMIT 1000";
        let query = r"
        WITH matches AS (
            SELECT DISTINCT match_id, toUnixTimestamp(start_time) AS start_time FROM finished_matches
            UNION DISTINCT
            SELECT DISTINCT match_id, start_time FROM player_match_history
            WHERE match_id IN (SELECT match_id FROM finished_matches) and match_mode IN ('Ranked', 'Unranked')
        )
        SELECT match_id
        FROM matches
        WHERE start_time < now() - INTERVAL '4 hours'
        AND match_id NOT IN (SELECT match_id FROM match_salts UNION DISTINCT SELECT match_id FROM match_info)
        ORDER BY match_id DESC
        LIMIT 1000
        ";
        let recent_matches: Vec<MatchIdQueryResult> =
            clickhouse_client.query(query).fetch_all().await.unwrap();
        let mut recent_matches: Vec<u64> = recent_matches.into_iter().map(|m| m.match_id).collect();
        if recent_matches.len() < 1000 {
            info!("No recent matches found, Filling the gaps");
            let query = r"
                WITH (SELECT MIN(match_id) as min_match_id, MAX(match_id) as max_match_id FROM finished_matches WHERE start_time < now() - INTERVAL '4 hours' AND start_time > now() - INTERVAL '14 days') AS match_range
                SELECT number + match_range.min_match_id as match_id
                FROM numbers(match_range.max_match_id - match_range.min_match_id + 1)
                WHERE (number + match_range.min_match_id) NOT IN (SELECT match_id FROM match_salts)
                ORDER BY match_id DESC
                LIMIT ?
                ";
            let gaps: Vec<MatchIdQueryResult> = clickhouse_client
                .query(query)
                .bind(1000 - recent_matches.len())
                .fetch_all()
                .await
                .unwrap();
            recent_matches.extend(gaps.into_iter().map(|m| m.match_id));
        }
        futures::future::join_all(
            recent_matches
                .iter()
                .map(|match_id| fetch_match(&client, message_type, *match_id, &limiter)),
        )
        .await;
    }
}

async fn fetch_match(
    client: &Client,
    message_type: u32,
    match_id: u64,
    limiter: &RateLimiter,
) -> Option<CMsgClientToGcGetMatchMetaDataResponse> {
    limiter.wait().await;
    let message = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        ..Default::default()
    };
    let mut data = Vec::new();
    message.encode(&mut data).unwrap();
    let data_b64 = BASE64_STANDARD.encode(data);
    let body = json!({
        "messageType": message_type,
        "timeoutMillis": 10_000,
        "rateLimit": {
            "messagePeriodMillis": 10_000,
        },
        "limitBufferingBehavior": "too_many_requests",
        "data": data_b64,
    });
    let req = client
        .post(PROXY_URL.clone())
        .header("Authorization", format!("Bearer {}", *PROXY_API_TOKEN))
        .json(&body);

    debug!("Sending Request (Body: {:?})", body);
    let res = match req.send().await {
        Ok(res) => res,
        Err(e) => {
            warn!("Failed to send request: {:?}", e);
            return None;
        }
    };
    match res.status() {
        StatusCode::OK => {
            info!("Got a 200 response");
            let body: InvokeResponse200 = res.json().await.unwrap();
            let buf = BASE64_STANDARD.decode(body.data).unwrap();
            let response = CMsgClientToGcGetMatchMetaDataResponse::decode(buf.as_slice()).unwrap();
            if let Some(r) = response.result {
                if r == KEResultRateLimited as i32 {
                    warn!("Got a rate limited response: {:?}", response);
                    return None;
                } else if r == KEResultInvalidMatch as i32 {
                    match report_match_id_not_found(client, match_id).await {
                        Ok(_) => info!("Reported match id not found: {}", match_id),
                        Err(e) => warn!("Failed to report match id not found: {:?}", e),
                    }
                    return None;
                }
            };
            // Unwrap is safe, as we checked for None above
            match ingest_salts(client, &[(response, match_id)]).await {
                Ok(_) => info!("Ingested salts for match {}", match_id),
                Err(e) => warn!("Failed to ingest salts for match {}: {:?}", match_id, e),
            };
            return Some(response);
        }
        StatusCode::NOT_FOUND => match report_match_id_not_found(client, match_id).await {
            Ok(_) => info!("Reported match id not found: {}", match_id),
            Err(e) => warn!("Failed to report match id not found: {:?}", e),
        },
        StatusCode::TOO_MANY_REQUESTS => {
            warn!("Rate limited: {:?}", res);
        }
        _ => {
            warn!("Failed to send request for match {}: {:?}", match_id, res);
        }
    }
    None
}

async fn report_match_id_not_found(client: &Client, match_id: u64) -> reqwest::Result<()> {
    let body = json!([{
        "match_id": match_id,
        "failed": true,
    }]);
    client
        .post(format!(
            "https://analytics.deadlock-api.com/v1/match-salts?api_key={}",
            *INTERNAL_DEADLOCK_API_KEY
        ))
        .json(&body)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map(|_| ())
}

async fn ingest_salts(
    client: &Client,
    salts: &[(CMsgClientToGcGetMatchMetaDataResponse, u64)],
) -> reqwest::Result<()> {
    debug!("Ingesting salts: {:?}", salts);
    let salts: Vec<_> = salts
        .iter()
        .map(|(r, m)| {
            let cluster_id = r.cluster_id.unwrap_or(0);
            let metadata_salt = r.metadata_salt.unwrap_or(0);
            let replay_salt = r.replay_salt.unwrap_or(0);
            MatchSalt {
                cluster_id,
                match_id: *m,
                metadata_salt,
                replay_salt,
            }
        })
        .collect();
    debug!("Ingesting salts: {:?}", salts);
    client
        .post(format!(
            "https://analytics.deadlock-api.com/v1/match-salts?api_key={}",
            *INTERNAL_DEADLOCK_API_KEY
        ))
        .json(&salts)
        .send()
        .await
        .map(|_| ())
}
