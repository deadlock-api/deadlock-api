use std::collections::HashMap;

use redis::RedisResult;
use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

const GAME_SERVER_KEY_PREFIX: &str = "game_server:";
const GAME_SERVERS_ALL_KEY: &str = "game_servers:all";
pub(crate) const GAME_SERVER_TTL_SECS: i64 = 120;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub(crate) struct GameServerInfo {
    pub(crate) server_id: String,
    pub(crate) game_mode: String,
    pub(crate) region: String,
    pub(crate) ip: String,
    pub(crate) port: u16,
    pub(crate) current_player_count: u32,
    pub(crate) last_updated: String,
}

impl GameServerInfo {
    fn from_hash(fields: &HashMap<String, String>) -> Option<Self> {
        Some(Self {
            server_id: fields.get("server_id")?.clone(),
            game_mode: fields.get("game_mode")?.clone(),
            region: fields.get("region")?.clone(),
            ip: fields.get("ip")?.clone(),
            port: fields.get("port")?.parse().ok()?,
            current_player_count: fields.get("current_player_count")?.parse().ok()?,
            last_updated: fields.get("last_updated")?.clone(),
        })
    }
}

#[derive(Clone)]
pub(crate) struct GameServerService {
    redis: MultiplexedConnection,
}

impl GameServerService {
    pub(crate) fn new(redis: MultiplexedConnection) -> Self {
        Self { redis }
    }

    pub(crate) async fn register(&self, info: &GameServerInfo) -> RedisResult<()> {
        let key = format!("{GAME_SERVER_KEY_PREFIX}{}", info.server_id);

        redis::pipe()
            .hset_multiple(
                &key,
                &[
                    ("server_id", &info.server_id),
                    ("game_mode", &info.game_mode),
                    ("region", &info.region),
                    ("ip", &info.ip),
                    ("port", &info.port.to_string()),
                    (
                        "current_player_count",
                        &info.current_player_count.to_string(),
                    ),
                    ("last_updated", &info.last_updated),
                ],
            )
            .expire(&key, GAME_SERVER_TTL_SECS)
            .sadd(GAME_SERVERS_ALL_KEY, &info.server_id)
            .exec_async(&mut self.redis.clone())
            .await
    }

    pub(crate) async fn list_all(&self) -> RedisResult<Vec<GameServerInfo>> {
        let server_ids: Vec<String> = redis::cmd("SMEMBERS")
            .arg(GAME_SERVERS_ALL_KEY)
            .query_async(&mut self.redis.clone())
            .await?;

        if server_ids.is_empty() {
            return Ok(Vec::new());
        }

        // Pipeline all HGETALL calls into a single round trip
        let mut pipe = redis::pipe();
        for id in &server_ids {
            pipe.hgetall(format!("{GAME_SERVER_KEY_PREFIX}{id}"));
        }
        let results: Vec<HashMap<String, String>> =
            pipe.query_async(&mut self.redis.clone()).await?;

        let mut servers = Vec::new();
        let mut stale_ids = Vec::new();

        for (id, fields) in server_ids.iter().zip(results.iter()) {
            if fields.is_empty() {
                stale_ids.push(id.as_str());
                continue;
            }
            if let Some(info) = GameServerInfo::from_hash(fields) {
                servers.push(info);
            }
        }

        // Batch-remove stale entries
        if !stale_ids.is_empty() {
            let mut cleanup = redis::pipe();
            for id in &stale_ids {
                cleanup.srem(GAME_SERVERS_ALL_KEY, *id);
            }
            let _: () = cleanup.query_async(&mut self.redis.clone()).await?;
        }

        Ok(servers)
    }
}
