use anyhow::{Context, Result};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use base64::prelude::*;
use fred::{
    clients::RedisClient,
    interfaces::{ClientLike, HashesInterface},
    types::RedisConfig,
};
use itertools::Itertools;
use jiff::{Timestamp, ToSpan as _};
use lru::LruCache;
use prost::Message;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    env,
    num::NonZeroUsize,
    sync::{Arc, Mutex, RwLock},
    time::{Duration, Instant},
};
use tokio::time::sleep;
use tracing::{debug, error, field, info, warn, Span};
use valveprotos::{
    deadlock::{
        c_msg_client_to_gc_spectate_user_response::EResponse, CMsgClientToGcSpectateLobby,
        CMsgClientToGcSpectateLobbyResponse, EgcCitadelClientMessages,
    },
    gcsdk::EgcPlatform,
};

use crate::easy_poll::start_polling_text;

const MAX_SPECTATED_MATCHES: usize = 275;
const BOT_RUNTIME_HOURS: u64 = 6;
const SPECTATE_COOLDOWN: Duration = Duration::from_millis(10);
const ERROR_COOLDOWN: Duration = Duration::from_secs(5);
const MAX_GAP_SIZE: u64 = 100;
const REDIS_SPEC_KEY: &str = "spectated_matches";
const REDIS_FAILED_KEY: &str = "failed_spectated_matches";
const REDIS_EXTRA_KEY: &str = "extra_spectated_matches";
const REDIS_EXPIRY: i64 = 900; // 15 minutes in seconds

#[derive(Serialize, Deserialize, Debug, Clone)]
struct PoolLimitInfo {
    ready_bots: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct InvokeResponse {
    data: String,
    username: String,
    pool_limit_info: PoolLimitInfo,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum SpectatedMatchType {
    ActiveMatch,
    GapMatch,
}

impl SpectatedMatchType {
    pub fn label(&self) -> String {
        match self {
            SpectatedMatchType::ActiveMatch => "ACT".to_string(),
            SpectatedMatchType::GapMatch => "GAP".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SpectatedMatchInfo {
    pub match_type: SpectatedMatchType,
    pub match_id: u64,
    #[serde(with = "jiff::fmt::serde::timestamp::second::required")]
    pub updated_at: Timestamp,
    #[serde(with = "jiff::fmt::serde::timestamp::second::optional")]
    pub started_at: Option<Timestamp>,
}

impl SpectatedMatchInfo {
    pub fn new(
        match_type: SpectatedMatchType,
        match_id: u64,
        updated_at: Timestamp,
        started_at: Option<Timestamp>,
    ) -> Self {
        SpectatedMatchInfo {
            match_type,
            match_id,
            updated_at,
            started_at,
        }
    }
}

struct SpectatorBot {
    client: Client,
    redis: RedisClient,
    api_token: String,
    proxy_url: String,
    failed_spectates: Mutex<LruCache<u64, bool>>,
    current_patch: Arc<RwLock<Option<u64>>>,
}

impl SpectatorBot {
    async fn new(proxy_api_url: String, api_token: String) -> Result<Self> {
        let config = RedisConfig::from_url(
            &env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".to_string()),
        )?;
        let redis = RedisClient::new(config, None, None, None);
        redis.connect();
        redis.wait_for_connect().await?;

        Ok(Self {
            client: Client::new(),
            redis,
            api_token,
            proxy_url: proxy_api_url,
            failed_spectates: Mutex::new(LruCache::new(NonZeroUsize::new(1000).unwrap())),
            current_patch: Arc::new(RwLock::new(None)),
        })
    }

    async fn is_recently_spectated(&self, key: &str, match_id: u64) -> Result<bool> {
        let exists: Option<String> = self.redis.hget(key, match_id.to_string()).await?;
        Ok(exists.is_some())
    }
    async fn update_spectated(&self, key: &str, match_id: u64, expiry_seconds: i64) -> Result<()> {
        let _: () = self
            .redis
            .hexpire(key, expiry_seconds, None, &[match_id])
            .await?;

        Ok(())
    }

    async fn mark_spectated(&self, key: &str, smi: &SpectatedMatchInfo) -> Result<()> {
        let payload = serde_json::to_string(&smi).unwrap();
        let _: () = self
            .redis
            .hset(key, [(smi.match_id.to_string(), payload)])
            .await?;

        let _: () = self
            .redis
            .hexpire(key, REDIS_EXPIRY, None, &smi.match_id.to_string())
            .await?;

        Ok(())
    }
    async fn mark_spectated_many(
        &self,
        key: &str,
        matches: &[SpectatedMatchInfo],
        expiry_seconds: i64,
    ) -> anyhow::Result<()> {
        self.redis
            .hset::<(), _, _>(
                key,
                matches
                    .iter()
                    .map(|x| (x.match_id, serde_json::to_string(&x).unwrap()))
                    .collect_vec(),
            )
            .await?;

        self.redis
            .hexpire::<(), _, _>(
                key,
                expiry_seconds,
                None,
                matches.iter().map(|x| x.match_id.to_string()).collect_vec(),
            )
            .await?;

        Ok(())
    }

    async fn mark_ended(&self, match_ids: &[u64]) -> anyhow::Result<()> {
        self.redis
            .hdel::<(), _, _>(REDIS_SPEC_KEY, match_ids.to_vec())
            .await?;
        Ok(())
    }

    async fn get_all_recently_spectated(
        &self,
        key: &str,
    ) -> Result<HashMap<u64, SpectatedMatchInfo>> {
        let members: Vec<String> = self.redis.hvals(key).await?;
        Ok(members
            .into_iter()
            .filter_map(|s| serde_json::from_str::<SpectatedMatchInfo>(&s).ok())
            .map(|x| (x.match_id, x))
            .collect())
    }

    fn find_gaps(
        &self,
        active_match_ids: &[u64],
        recently_spectated: &HashMap<u64, SpectatedMatchInfo>,
        failed_spectating: &HashMap<u64, SpectatedMatchInfo>,
    ) -> Vec<u64> {
        if active_match_ids.is_empty() {
            return vec![];
        }

        let mut gaps = Vec::new();
        let match_set: HashSet<_> = active_match_ids.iter().collect();

        let min_id = active_match_ids.iter().min().unwrap();
        let max_id = active_match_ids.iter().max().unwrap();
        let avg = (min_id + max_id) / 2;
        assert!(avg < *max_id);

        for potential_id in (avg..*max_id).step_by(1) {
            if !match_set.contains(&potential_id)
                && !recently_spectated.contains_key(&potential_id)
                && !failed_spectating.contains_key(&potential_id)
            {
                gaps.push(potential_id);
            }

            if gaps.len() >= MAX_GAP_SIZE as usize {
                break;
            }
        }

        if gaps.len() < MAX_GAP_SIZE as usize {
            for potential_id in (*min_id..*max_id).step_by(1) {
                if !match_set.contains(&potential_id)
                    && !recently_spectated.contains_key(&potential_id)
                    && !failed_spectating.contains_key(&potential_id)
                {
                    gaps.push(potential_id);
                }

                if gaps.len() >= MAX_GAP_SIZE as usize {
                    break;
                }
            }
        }

        // gaps.reverse();

        gaps
    }

    async fn update_patch_version(&self, steam_inf: &str) -> Result<()> {
        let version = steam_inf
            .find("ClientVersion=")
            .and_then(|start| {
                let version_start = start + "ClientVersion=".len();
                steam_inf[version_start..]
                    .find('\n')
                    .map(|end| steam_inf[version_start..version_start + end].trim())
            })
            .and_then(|v| v.parse::<u64>().ok())
            .context("Failed to parse client version")?;

        let mut v = self.current_patch.write().unwrap();
        *v = Some(version);
        Ok(())
    }

    #[tracing::instrument(skip(self), fields(account = field::Empty, ready_bots = field::Empty))]
    async fn spectate_match(&self, match_type: SpectatedMatchType, match_id: u64) -> Result<bool> {
        let label = match_type.label();
        if self.is_recently_spectated(REDIS_SPEC_KEY, match_id).await? {
            debug!("[{label} {match_id}] Recently spectated, skipping");
            return Ok(false);
        }

        let current_patch = self
            .current_patch
            .read()
            .expect("Patch version should be set")
            .context("No current patch version available")?;

        let spectate_message = CMsgClientToGcSpectateLobby {
            match_id: Some(match_id),
            client_version: Some(current_patch as u32),
            client_platform: Some(EgcPlatform::KEGcPlatformPc as i32),
            ..Default::default()
        };

        let mut data = Vec::new();
        spectate_message.encode(&mut data)?;

        let response = self
            .client
            .post(&self.proxy_url)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&serde_json::json!({
                "message_kind": EgcCitadelClientMessages::KEMsgClientToGcSpectateLobby as u32,
                "bot_in_all_groups": ["SpectateLobby"],
                "rate_limit_cooldown_millis": 30 * 60 * 1000,
                "job_cooldown_millis": 5 * 60 * 1000,
                "data": BASE64_STANDARD.encode(data),
            }))
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {
                let body: InvokeResponse = response.json().await?;
                let buf = BASE64_STANDARD.decode(body.data)?;
                let spectate_response =
                    CMsgClientToGcSpectateLobbyResponse::decode(buf.as_slice())?;

                let Some(ref res) = spectate_response.result else {
                    sleep(SPECTATE_COOLDOWN).await;
                    return Ok(false);
                };

                let result = res.result();
                let smi =
                    SpectatedMatchInfo::new(match_type, match_id, jiff::Timestamp::now(), None);
                Span::current().record("account", &body.username);
                Span::current().record("ready_bots", body.pool_limit_info.ready_bots);

                let did_succeed = match result {
                    EResponse::KESuccess => {
                        info!(
                            "[{label} {match_id}] Successfully spectated match, lobby id: {} {:?}",
                            &res.lobby_id(),
                            &result
                        );
                        debug!("[{match_id}] Response: {:?}", &spectate_response);
                        self.mark_spectated(REDIS_SPEC_KEY, &smi).await?;
                        self.mark_spectated_many(REDIS_EXTRA_KEY, &[smi], 60 * 60)
                            .await?;
                        true
                    }
                    EResponse::KENotInGame => {
                        warn!("[{label} {match_id}] Match not in game: {:?}", &result);
                        self.mark_spectated(REDIS_FAILED_KEY, &smi).await?;
                        false
                    }
                    _ => {
                        warn!(
                            "[{label} {match_id}] Other failure in spectate: {:?}",
                            &result
                        );
                        false
                    }
                };

                sleep(SPECTATE_COOLDOWN).await;
                Ok(did_succeed)
            }

            StatusCode::TOO_MANY_REQUESTS => {
                warn!("Got proxy rate limit, waiting 10s before continuing");
                sleep(Duration::from_secs(10)).await;

                Ok(false)
            }
            _ => {
                warn!(
                    "[{label}] {match_id} Failed to spectate match: {:?}",
                    response.status()
                );
                {
                    self.failed_spectates.lock().unwrap().put(match_id, true);
                }
                sleep(ERROR_COOLDOWN).await;
                Ok(false)
            }
        }
    }

    async fn run(&self) -> Result<()> {
        let start_time = Instant::now();

        let (abort_handle, steam_inf) = start_polling_text(
            "https://raw.githubusercontent.com/SteamDatabase/GameTracking-Deadlock/refs/heads/master/game/citadel/steam.inf".to_string(),
            Duration::from_secs(60 * 5),
        ).await;

        let mut prev_life_matches = Vec::new();
        while (Instant::now() - start_time) < Duration::from_secs(BOT_RUNTIME_HOURS * 3600) {
            let s = steam_inf.read().await.clone();
            self.update_patch_version(&s).await?;
            let live_matches = crate::active_matches::fetch_active_matches_cached().await?;
            if live_matches != prev_life_matches {
                let ms = live_matches
                    .iter()
                    .filter(|x| x.spectators > 0)
                    .map(|x| {
                        SpectatedMatchInfo::new(
                            SpectatedMatchType::ActiveMatch,
                            x.match_id,
                            Timestamp::now(),
                            Some(Timestamp::from_second(x.start_time as i64).unwrap()),
                        )
                    })
                    .collect_vec();
                self.mark_spectated_many(REDIS_SPEC_KEY, &ms, REDIS_EXPIRY)
                    .await?;
            }
            prev_life_matches = live_matches.clone();

            let recently_spectated = self.get_all_recently_spectated(REDIS_SPEC_KEY).await?;
            let n_spectated = recently_spectated.len();

            if n_spectated > MAX_SPECTATED_MATCHES {
                info!("Maximum spectated matches reached ({n_spectated}), waiting...");
                sleep(Duration::from_secs(5)).await;
                continue;
            }

            let failed_spectates = self.get_all_recently_spectated(REDIS_FAILED_KEY).await?;

            let next_match = live_matches
                .iter()
                .filter(|x| {
                    x.spectators == 0
                        && !recently_spectated.contains_key(&x.match_id)
                        && !failed_spectates.contains_key(&x.match_id)
                })
                .filter(|x| x.is_titan_exposed())
                .sorted_by_key(|x| {
                    (
                        std::cmp::Reverse(x.match_score / 100),
                        if x.is_titan_exposed() {
                            0
                        } else if x.is_shrine_exposed() {
                            1
                        } else {
                            2
                        },
                        x.start_time,
                    )
                })
                .next();

            match next_match {
                Some(m) => {
                    info!(
                        "Spectating active match {} (score: {})",
                        m.lobby_id, m.match_score
                    );
                    if let Err(e) = self
                        .spectate_match(SpectatedMatchType::ActiveMatch, m.match_id)
                        .await
                    {
                        error!("Failed to spectate match {}: {:?}", m.match_id, e);
                    }
                }
                None => {
                    let fifteen_min_ago = jiff::Timestamp::now()
                        .checked_sub(15.minutes())
                        .unwrap()
                        .as_second();
                    let fifty_min_ago = jiff::Timestamp::now()
                        .checked_sub(50.minutes())
                        .unwrap()
                        .as_second();

                    let match_ids: Vec<u64> = live_matches
                        .iter()
                        .filter(|x| {
                            x.start_time <= fifteen_min_ago as u64
                                && x.start_time > fifty_min_ago as u64
                        })
                        .map(|m| m.match_id)
                        .sorted()
                        .collect();

                    let gaps = self.find_gaps(&match_ids, &recently_spectated, &failed_spectates);

                    if !gaps.is_empty() {
                        info!(
                            "No eligible matches found. Attempting to spectate {} gaps",
                            gaps.len()
                        );
                        for gap_id in gaps.into_iter().take(3) {
                            match self
                                .spectate_match(SpectatedMatchType::GapMatch, gap_id)
                                .await
                            {
                                Ok(true) => continue,
                                Ok(false) => continue,
                                Err(e) => {
                                    error!("Error spectating gap match {gap_id}: {:?}", e);
                                    continue;
                                }
                            }
                        }
                    } else {
                        info!("No eligible matches or gaps found (spectated: {n_spectated})");
                        sleep(Duration::from_secs(10)).await;
                    }
                }
            }
        }

        abort_handle.abort();
        info!("Bot runtime exceeded, restarting in 30s...");
        sleep(Duration::from_secs(30)).await;
        Ok(())
    }
}
async fn run_server(bot: Arc<SpectatorBot>) -> Result<()> {
    let shared_state = bot;

    let app = Router::new()
        .route("/matches", get(fetch_matches))
        .route("/matches-past-hour", get(count_extra_matches))
        .route("/match-ended", post(record_match_end))
        .route("/match-still-alive", post(record_match_still_alive))
        .with_state(shared_state);

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3929").await.unwrap();
    axum::serve(listener, app).await.unwrap();

    Ok(())
}

async fn fetch_matches(
    State(bot): State<Arc<SpectatorBot>>,
) -> Result<Json<Vec<SpectatedMatchInfo>>, String> {
    let matches = bot
        .get_all_recently_spectated(REDIS_SPEC_KEY)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Json(matches.into_values().collect()))
}
async fn count_extra_matches(State(bot): State<Arc<SpectatorBot>>) -> Result<String, String> {
    let matches = bot
        .get_all_recently_spectated(REDIS_EXTRA_KEY)
        .await
        .map_err(|e| e.to_string())?;

    Ok(matches.len().to_string())
}

#[derive(Serialize, Deserialize)]
struct MatchEndReq {
    match_id: u64,
}

async fn record_match_end(
    State(bot): State<Arc<SpectatorBot>>,
    Json(req): Json<MatchEndReq>,
) -> Result<(), String> {
    let match_id = req.match_id;

    bot.mark_ended(&[match_id])
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn record_match_still_alive(
    State(bot): State<Arc<SpectatorBot>>,
    Json(req): Json<MatchEndReq>,
) -> Result<(), String> {
    let match_id = req.match_id;

    bot.update_spectated(REDIS_SPEC_KEY, match_id, REDIS_EXPIRY)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn run_bot(proxy_url: String, proxy_api_token: String) -> Result<()> {
    let bot = Arc::new(SpectatorBot::new(proxy_url, proxy_api_token).await?);
    let _server = tokio::spawn(run_server(bot.clone()));

    loop {
        if let Err(e) = bot.run().await {
            error!("Bot error, restarting in 2 minutes: {:?}", e);
            sleep(Duration::from_secs(120)).await;
        }
    }
}
