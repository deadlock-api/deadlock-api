use cached::macros::cached;
use serde::{Deserialize, Serialize};
use tracing::info;
use valveprotos::deadlock::ECitadelTeamObjective;

#[derive(Debug, Clone, Serialize, Deserialize, Hash, PartialEq, Eq)]
pub(crate) struct ActiveMatch {
    pub start_time: Option<u64>,
    pub match_id: u64,
    pub lobby_id: Option<u64>,
    pub spectators: Option<u32>,
    pub objectives_mask_team0: u32,
    pub objectives_mask_team1: u32,
    pub match_score: Option<u32>,
}

impl ActiveMatch {
    /// Whether either team has lost both titan shield generators.
    pub(crate) fn is_titan_exposed(&self) -> bool {
        self.team_masks()
            .into_iter()
            .any(|mask| SHIELD_GENERATORS.iter().all(|&o| !has_objective(mask, o)))
    }

    /// Whether either team has lost a titan shield generator.
    pub(crate) fn is_shrine_exposed(&self) -> bool {
        self.team_masks()
            .into_iter()
            .any(|mask| SHIELD_GENERATORS.iter().any(|&o| !has_objective(mask, o)))
    }

    fn team_masks(&self) -> [u32; 2] {
        [self.objectives_mask_team0, self.objectives_mask_team1]
    }
}

const SHIELD_GENERATORS: [ECitadelTeamObjective; 2] = [
    ECitadelTeamObjective::KECitadelTeamObjectiveTitanShieldGenerator1,
    ECitadelTeamObjective::KECitadelTeamObjectiveTitanShieldGenerator2,
];

fn has_objective(mask: u32, objective: ECitadelTeamObjective) -> bool {
    mask & (1 << (objective as u32)) != 0
}

#[cached(ttl_secs = 60, convert = "{ 0 }", key = "u8", sync_writes = "default")]
pub(crate) async fn fetch_active_matches_cached() -> anyhow::Result<Vec<ActiveMatch>> {
    let res = common::http_client()
        .get("https://api.deadlock-api.com/v1/matches/active")
        .send()
        .await?
        .error_for_status()?;

    let active_matches: Vec<ActiveMatch> = res.json().await?;
    info!("Fetched new active matches, size: {}", active_matches.len());

    Ok(active_matches)
}
