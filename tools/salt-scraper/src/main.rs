#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]

use core::time::Duration;
use std::sync::LazyLock;

use anyhow::bail;
use clickhouse::Client;
use futures::StreamExt;
use metrics::counter;
use models::MatchSalt;
use tracing::{debug, info, instrument, warn};
use valveprotos::deadlock::c_msg_client_to_gc_get_match_meta_data_response::EResult::KEResultRateLimited;
use valveprotos::deadlock::{
    CMsgClientToGcGetMatchMetaData, CMsgClientToGcGetMatchMetaDataResponse,
    EgcCitadelClientMessages,
};

mod models;

static SALTS_COOLDOWN_MILLIS: LazyLock<u64> = LazyLock::new(|| {
    std::env::var("SALTS_COOLDOWN_MILLIS")
        .map(|x| x.parse().expect("SALTS_COOLDOWN_MILLIS must be a number"))
        .unwrap_or(36_000)
});
static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap()
});

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;

    let ch_client = common::get_ch_client()?;

    loop {
        // let query = "SELECT DISTINCT match_id FROM finished_matches WHERE start_time < now() - INTERVAL '3 hours' AND match_id NOT IN (SELECT match_id FROM match_salts UNION DISTINCT SELECT match_id FROM match_info) ORDER BY start_time DESC LIMIT 1000";
        let query = r"
        WITH t_known_matches AS (SELECT match_id FROM match_salts UNION DISTINCT SELECT match_id FROM match_info),
             t_missing_matches AS (SELECT DISTINCT match_id
                                   FROM player_match_history
                                   WHERE match_mode IN ('Ranked', 'Unranked')
                                     AND start_time BETWEEN '2024-12-01' AND now() - INTERVAL 2 HOUR
                                     AND match_id NOT IN t_known_matches
                                   UNION
                                   DISTINCT
                                   SELECT DISTINCT match_id
                                   FROM active_matches
                                   WHERE match_mode IN ('Ranked', 'Unranked')
                                     AND game_mode = 'Normal'
                                     AND start_time BETWEEN now() - INTERVAL 2 WEEK AND now() - INTERVAL 2 HOUR
                                     AND match_id NOT IN t_known_matches)
        SELECT match_id
        FROM t_missing_matches
        ORDER BY match_id DESC
        LIMIT 100
        ";
        let recent_matches: Vec<u64> = ch_client.query(query).fetch_all().await?;
        if recent_matches.is_empty() {
            info!("No new matches to fetch, sleeping 60s...");
            tokio::time::sleep(Duration::from_secs(60)).await;
            continue;
        }
        info!("Found {} matches to fetch", recent_matches.len());
        // if recent_matches.len() < 100 {
        //     info!(
        //         "Only got {} matches, fetching salts for hltv matches.",
        //         recent_matches.len()
        //     );
        //     let query = r"
        //         SELECT DISTINCT match_id
        //         FROM match_info
        //         WHERE match_id NOT IN (SELECT match_id FROM match_salts)
        //             AND start_time < now() - INTERVAL '3 hours' AND start_time > toDateTime('2024-11-01')
        //         ORDER BY match_id
        //         LIMIT ?
        //         ";
        //     let additional_matches: Vec<MatchIdQueryResult> = ch_client
        //         .query(query)
        //         .bind(100 - recent_matches.len())
        //         .fetch_all()
        //         .await?;
        //     recent_matches.extend(additional_matches.into_iter().map(|m| m.match_id));
        // }
        futures::stream::iter(recent_matches)
            .map(|match_id| {
                let ch_client = ch_client.clone();
                async move {
                    match fetch_match(&ch_client, match_id).await {
                        Ok(()) => info!("Fetched match {}", match_id),
                        Err(e) => warn!("Failed to fetch match {}: {:?}", match_id, e),
                    }
                }
            })
            .buffer_unordered(2)
            .collect::<Vec<_>>()
            .await;
    }
}

#[instrument(skip(ch_client))]
async fn fetch_match(ch_client: &Client, match_id: u64) -> anyhow::Result<()> {
    // Fetch Salts
    let salts = tryhard::retry_fn(|| fetch_salts(match_id))
        .retries(30)
        .fixed_backoff(Duration::from_secs(1))
        .await;
    let (username, salts) = match salts {
        Ok(r) => {
            counter!("salt_scraper.fetch_salts.success").increment(1);
            debug!("Fetched salts: {:?}", r.1);
            r
        }
        Err(e) => {
            counter!("salt_scraper.fetch_salts.failure").increment(1);
            warn!("Failed to fetch salts: {:?}", e);
            return Err(e);
        }
    };

    // Parse Salts
    if let Some(result) = salts.result
        && result == KEResultRateLimited as i32
    {
        counter!("salt_scraper.parse_salt.failure").increment(1);
        bail!("Got a rate limited response: {:?}", salts);
    }
    counter!("salt_scraper.parse_salt.success").increment(1);
    debug!("Parsed salts");

    // Ingest Salts
    match ingest_salts(ch_client, match_id, salts, username.into()).await {
        Ok(()) => {
            counter!("salt_scraper.ingest_salt.success").increment(1);
            debug!("Ingested salts");
            Ok(())
        }
        Err(e) => {
            counter!("salt_scraper.ingest_salt.failure").increment(1);
            warn!("Failed to ingest salts: {:?}", e);
            Err(e.into())
        }
    }
}

async fn fetch_salts(
    match_id: u64,
) -> anyhow::Result<(String, CMsgClientToGcGetMatchMetaDataResponse)> {
    let msg = CMsgClientToGcGetMatchMetaData {
        match_id: Some(match_id),
        ..Default::default()
    };
    common::call_steam_proxy(
        &HTTP_CLIENT,
        EgcCitadelClientMessages::KEMsgClientToGcGetMatchMetaData,
        &msg,
        Some(&["GetMatchMetaData"]),
        None,
        Duration::from_millis(*SALTS_COOLDOWN_MILLIS),
        Duration::from_secs(5),
    )
    .await
}

async fn ingest_salts(
    ch_client: &Client,
    match_id: u64,
    salts: CMsgClientToGcGetMatchMetaDataResponse,
    username: Option<String>,
) -> clickhouse::error::Result<()> {
    let salts = MatchSalt {
        match_id,
        cluster_id: salts.replay_group_id,
        metadata_salt: salts.metadata_salt,
        replay_salt: salts.replay_salt,
        username,
    };
    let mut inserter = ch_client.insert("match_salts")?;
    inserter.write(&salts).await?;
    inserter.end().await
}
