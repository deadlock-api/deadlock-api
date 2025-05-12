use prost::Message;
use serde::Deserialize;
use std::time::Duration;
use valveprotos::deadlock::EgcCitadelClientMessages;

#[derive(Debug, Clone)]
pub struct SteamProxyQuery<M: Message> {
    pub msg_type: EgcCitadelClientMessages,
    pub msg: M,
    pub in_all_groups: Option<Vec<String>>,
    pub in_any_groups: Option<Vec<String>>,
    pub cooldown_time: Duration,
    pub request_timeout: Duration,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SteamProxyResponse {
    pub data: String,
    pub username: String,
}
