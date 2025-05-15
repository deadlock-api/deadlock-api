use crate::error::APIResult;
use crate::routes::v1::leaderboard::route::fetch_leaderboard_raw;
use crate::routes::v1::leaderboard::types::{Leaderboard, LeaderboardEntry, LeaderboardRegion};
use crate::routes::v1::patches::feed::fetch_patch_notes;
use crate::routes::v1::players::match_history::{
    fetch_match_history_from_clickhouse, fetch_steam_match_history,
};
use crate::routes::v1::players::mmr_history::MMRHistory;
use crate::routes::v1::players::types::PlayerMatchHistory;
use crate::services::assets::client::AssetsClient;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyResponse;
use crate::state::AppState;
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::Duration;
use futures::future::join;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use strum_macros::{EnumString, IntoStaticStr, VariantArray};
use thiserror::Error;
use tracing::{error, warn};
use utoipa::ToSchema;
use valveprotos::deadlock::{
    CMsgClientToGcGetLeaderboardResponse, ECitadelGameMode, ECitadelMatchMode,
};

#[derive(Debug, Clone, Error)]
pub enum VariableResolveError {
    #[error("Failed to fetch data: {0}")]
    FailedToFetchData(&'static str),
    #[error("Failed to fetch steam name: {0}")]
    FailedToFetchSteamName(String),
    #[error("Player not found in leaderboard")]
    PlayerNotFoundInLeaderboard,
    #[error("Missing argument: {0}")]
    MissingArgument(&'static str),
}

#[derive(Debug, Serialize, Clone, Copy, ToSchema)]
pub enum VariableCategory {
    General,
    Daily,
    Hero,
    Leaderboard,
    Overall,
}

#[derive(
    Debug,
    Serialize,
    Deserialize,
    EnumString,
    Clone,
    Copy,
    IntoStaticStr,
    Eq,
    PartialEq,
    VariantArray,
)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum Variable {
    MaxBombStacks,
    MaxSpiritSnareStacks,
    MaxBonusHealthPerKill,
    MaxGuidedOwlStacks,
    HeroHoursPlayed,
    HeroKd,
    HeroKills,
    HeroLeaderboardPlace,
    HeroLosses,
    HeroMatches,
    HeroWinrate,
    HeroWins,
    HeroesPlayedToday,
    HighestDeathCount,
    HighestDenies,
    HighestKillCount,
    HighestLastHits,
    HighestNetWorth,
    HoursPlayed,
    LatestPatchnotesLink,
    LatestPatchnotesTitle,
    LeaderboardPlace,
    LeaderboardRank,
    LeaderboardRankImg,
    MMRHistoryRank,
    MMRHistoryRankImg,
    LossesToday,
    MatchesToday,
    MostPlayedHero,
    MostPlayedHeroCount,
    SteamAccountName,
    TotalKd,
    TotalKills,
    TotalMatches,
    TotalWinrate,
    TotalWins,
    TotalLosses,
    TotalWinsLosses,
    WinrateToday,
    WinsLossesToday,
    WinsToday,
}

impl Variable {
    pub fn get_name(&self) -> &str {
        self.into()
    }

    pub fn get_category(&self) -> VariableCategory {
        match self {
            Self::LatestPatchnotesLink
            | Self::LatestPatchnotesTitle
            | Self::SteamAccountName
            | Self::MMRHistoryRank
            | Self::MMRHistoryRankImg => VariableCategory::General,

            Self::LossesToday
            | Self::MatchesToday
            | Self::WinrateToday
            | Self::WinsLossesToday
            | Self::WinsToday => VariableCategory::Daily,

            Self::LeaderboardPlace | Self::LeaderboardRank | Self::LeaderboardRankImg => {
                VariableCategory::Leaderboard
            }

            Self::HighestDenies
            | Self::HighestKillCount
            | Self::HighestLastHits
            | Self::HighestNetWorth
            | Self::HoursPlayed
            | Self::TotalKd
            | Self::TotalKills
            | Self::TotalMatches
            | Self::TotalWinrate
            | Self::TotalWins
            | Self::TotalLosses
            | Self::TotalWinsLosses
            | Self::HighestDeathCount => VariableCategory::Overall,

            Self::HeroHoursPlayed
            | Self::HeroKd
            | Self::HeroKills
            | Self::HeroLeaderboardPlace
            | Self::HeroLosses
            | Self::HeroMatches
            | Self::HeroWinrate
            | Self::HeroWins
            | Self::HeroesPlayedToday
            | Self::MostPlayedHero
            | Self::MostPlayedHeroCount
            | Self::MaxBombStacks
            | Self::MaxSpiritSnareStacks
            | Self::MaxBonusHealthPerKill
            | Self::MaxGuidedOwlStacks => VariableCategory::Hero,
        }
    }

    pub fn get_description(&self) -> &str {
        match self {
            Self::HeroHoursPlayed => {
                "Get the total hours played in all matches for a specific hero"
            }
            Self::HeroKd => "Get the KD ratio for a specific hero",
            Self::HeroKills => "Get the total kills in all matches for a specific hero",
            Self::HeroLeaderboardPlace => "Get the leaderboard place for a specific hero",
            Self::HeroLosses => "Get the total number of losses for a specific hero",
            Self::HeroMatches => "Get the total number of matches played for a specific hero",
            Self::HeroWinrate => "Get the total winrate for a specific hero",
            Self::HeroWins => "Get the total number of wins for a specific hero",
            Self::HeroesPlayedToday => {
                "Get a list of all heroes played today with the number of matches played"
            }
            Self::HighestDeathCount => "Get the highest death count in a match",
            Self::HighestDenies => "Get the highest denies in a match",
            Self::HighestKillCount => "Get the highest kill count in a match",
            Self::HighestLastHits => "Get the highest last hits in a match",
            Self::HighestNetWorth => "Get the highest net worth in a match",
            Self::HoursPlayed => "Get the total hours played in all matches",
            Self::LatestPatchnotesLink => "Get the link to the latest patch notes",
            Self::LatestPatchnotesTitle => "Get the title of the latest patch notes",
            Self::LeaderboardPlace => "Get the leaderboard place",
            Self::LeaderboardRank => "Get the leaderboard rank",
            Self::LeaderboardRankImg => "Get the leaderboard rank",
            Self::LossesToday => "Get the number of losses today",
            Self::MatchesToday => "Get the number of matches today",
            Self::MostPlayedHero => "Get the most played hero",
            Self::MostPlayedHeroCount => "Get the most played hero count",
            Self::SteamAccountName => "Get the steam account name",
            Self::TotalKd => "Get the KD ratio",
            Self::TotalKills => "Get the total kills in all matches",
            Self::TotalMatches => "Get the total number of matches played",
            Self::TotalWinrate => "Get the total winrate",
            Self::TotalWins => "Get the total number of wins",
            Self::TotalLosses => "Get the total number of losses",
            Self::TotalWinsLosses => "Get the total number of wins and losses",
            Self::WinrateToday => "Get the winrate today",
            Self::WinsLossesToday => "Get the number of wins and losses today",
            Self::WinsToday => "Get the number of wins today",
            Self::MaxBombStacks => "Get the max bomb stacks on Bebop",
            Self::MaxSpiritSnareStacks => "Get the max spirit snare stacks on Grey Talon",
            Self::MaxBonusHealthPerKill => "Get the max bonus health per kill on Mo & Krill",
            Self::MaxGuidedOwlStacks => "Get the max guided owl stacks on Grey Talon",
            Self::MMRHistoryRank => "Get the MMR history rank",
            Self::MMRHistoryRankImg => "Get the MMR history rank",
        }
    }

    pub fn get_default_label(&self) -> Option<&str> {
        match self {
            Self::HeroHoursPlayed => Some("{hero_name} Hours Played"),
            Self::HeroKd => Some("{hero_name} Kd"),
            Self::HeroKills => Some("{hero_name} Kills"),
            Self::HeroLeaderboardPlace => Some("{hero_name} Leaderboard Place"),
            Self::HeroLosses => Some("{hero_name} Losses"),
            Self::HeroMatches => Some("{hero_name} Matches"),
            Self::HeroWinrate => Some("{hero_name} Winrate"),
            Self::HeroWins => Some("{hero_name} Wins"),
            Self::WinsLossesToday => Some("Daily W-L"),
            Self::LeaderboardPlace => Some("Place"),
            Self::LeaderboardRank => Some("Rank"),
            Self::MMRHistoryRank => Some("Rank"),
            _ => None,
        }
    }

    pub fn extra_args(&self) -> Vec<String> {
        match self {
            Self::HeroHoursPlayed
            | Self::HeroKd
            | Self::HeroKills
            | Self::HeroLeaderboardPlace
            | Self::HeroLosses
            | Self::HeroMatches
            | Self::HeroWinrate
            | Self::HeroWins => vec!["hero_name".to_string()],
            _ => vec![],
        }
    }

    pub async fn resolve(
        &self,
        rate_limit_key: &RateLimitKey,
        state: &AppState,
        steam_id: u32,
        region: LeaderboardRegion,
        extra_args: &HashMap<String, String>,
    ) -> Result<String, VariableResolveError> {
        match self {
            Self::LeaderboardRankImg => {
                let leaderboard_entry =
                    Self::get_leaderboard_entry(rate_limit_key, state, steam_id, region, None)
                        .await?;
                let badge_level = leaderboard_entry.badge_level.ok_or(
                    VariableResolveError::FailedToFetchData("leaderboard badge level"),
                )?;
                let ranks = state
                    .assets_client
                    .fetch_ranks()
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("ranks"))?;
                let (rank, subrank) = (badge_level / 10, badge_level % 10);
                ranks
                    .iter()
                    .find(|r| r.tier == rank)
                    .and_then(|r| r.images.get(&format!("small_subrank{subrank}")))
                    .cloned()
                    .ok_or(VariableResolveError::FailedToFetchData("rank"))
            }
            Self::LeaderboardRank => {
                let leaderboard_entry =
                    Self::get_leaderboard_entry(rate_limit_key, state, steam_id, region, None)
                        .await?;
                let badge_level = leaderboard_entry.badge_level.ok_or(
                    VariableResolveError::FailedToFetchData("leaderboard badge level"),
                )?;
                let ranks = state
                    .assets_client
                    .fetch_ranks()
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("ranks"))?;
                let (rank, subrank) = (badge_level / 10, badge_level % 10);
                let rank = ranks
                    .iter()
                    .find(|r| r.tier == rank)
                    .ok_or(VariableResolveError::FailedToFetchData("rank"))?;
                Ok(format!("{} {subrank}", rank.name))
            }
            Self::HeroesPlayedToday => {
                let todays_matches =
                    Self::get_todays_matches(&state.steam_client, steam_id).await?;
                let heroes_played = todays_matches.iter().fold(HashMap::new(), |mut acc, m| {
                    *acc.entry(m.hero_id).or_insert(0) += 1;
                    acc
                });
                let heroes = state
                    .assets_client
                    .fetch_heroes()
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("heroes"))?;
                let heroes = heroes
                    .into_iter()
                    .map(|h| (h.id, h.name))
                    .collect::<HashMap<_, _>>();
                Ok(heroes_played
                    .into_iter()
                    .filter_map(|(hero_id, count)| {
                        format!("{} ({})", heroes.get(&hero_id)?, count).into()
                    })
                    .join(", "))
            }
            Self::HeroLeaderboardPlace => {
                let hero_id = state
                    .assets_client
                    .fetch_hero_id_from_name(
                        extra_args
                            .get("hero_name")
                            .ok_or(VariableResolveError::MissingArgument("hero name"))?,
                    )
                    .await
                    .ok()
                    .flatten()
                    .ok_or(VariableResolveError::FailedToFetchData("hero id"))?;
                let leaderboard_entry = Self::get_leaderboard_entry(
                    rate_limit_key,
                    state,
                    steam_id,
                    region,
                    Some(hero_id),
                )
                .await?;
                Ok(format!("#{}", leaderboard_entry.rank.unwrap_or_default()))
            }
            Self::LeaderboardPlace => {
                let leaderboard_entry =
                    Self::get_leaderboard_entry(rate_limit_key, state, steam_id, region, None)
                        .await?;
                Ok(format!("#{}", leaderboard_entry.rank.unwrap_or_default()))
            }
            Self::SteamAccountName => {
                get_steam_account_name(rate_limit_key, state, &state.pg_client, steam_id).await
            }
            Self::HighestDeathCount => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                matches
                    .iter()
                    .map(|m| m.player_deaths)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player deaths"))
            }
            Self::HighestDenies => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                matches
                    .iter()
                    .map(|m| m.denies)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player denies"))
            }
            Self::HighestKillCount => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                matches
                    .iter()
                    .map(|m| m.player_kills)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player kills"))
            }
            Self::HighestLastHits => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                matches
                    .iter()
                    .map(|m| m.last_hits)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player last hits"))
            }
            Self::HighestNetWorth => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                matches
                    .iter()
                    .map(|m| m.net_worth)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player net worth"))
            }
            Self::HoursPlayed => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                let seconds_playtime: u32 = matches.iter().map(|m| m.match_duration_s).sum();
                Ok(format!("{}h", seconds_playtime / 3600))
            }
            Self::WinrateToday => {
                let matches = Self::get_todays_matches(&state.steam_client, steam_id).await?;
                let wins = matches
                    .iter()
                    .filter(|m| m.match_result as i8 == m.player_team)
                    .count();
                Ok(format!(
                    "{:.2}%",
                    wins as f32 / matches.len().max(1) as f32 * 100.0
                ))
            }
            Self::WinsLossesToday => {
                let matches = Self::get_todays_matches(&state.steam_client, steam_id).await?;
                let (wins, losses) = matches.iter().fold((0, 0), |(wins, losses), m| {
                    if m.match_result as i8 == m.player_team {
                        (wins + 1, losses)
                    } else {
                        (wins, losses + 1)
                    }
                });
                Ok(format!("{wins}-{losses}"))
            }
            Self::MatchesToday => Ok(Self::get_todays_matches(&state.steam_client, steam_id)
                .await?
                .len()
                .to_string()),
            Self::WinsToday => Ok(Self::get_todays_matches(&state.steam_client, steam_id)
                .await?
                .iter()
                .filter(|m| m.match_result as i8 == m.player_team)
                .count()
                .to_string()),
            Self::LossesToday => Ok(Self::get_todays_matches(&state.steam_client, steam_id)
                .await?
                .iter()
                .filter(|m| m.match_result as i8 != m.player_team)
                .count()
                .to_string()),
            Self::MostPlayedHero => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                let most_played_hero = matches
                    .iter()
                    .fold(HashMap::new(), |mut acc, m| {
                        *acc.entry(m.hero_id).or_insert(0) += 1;
                        acc
                    })
                    .into_iter()
                    .max_by_key(|(_, count)| *count)
                    .map(|(hero_id, _)| hero_id)
                    .ok_or(VariableResolveError::FailedToFetchData("most played hero"))?;
                state
                    .assets_client
                    .fetch_hero_name_from_id(most_played_hero)
                    .await
                    .ok()
                    .flatten()
                    .ok_or(VariableResolveError::FailedToFetchData("hero name"))
            }
            Self::MostPlayedHeroCount => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                let most_played_hero_count = matches
                    .iter()
                    .fold(HashMap::new(), |mut acc, m| {
                        *acc.entry(m.hero_id).or_insert(0) += 1;
                        acc
                    })
                    .into_values()
                    .max();
                Ok(most_played_hero_count.unwrap_or(0).to_string())
            }
            Self::TotalKd => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                let (kills, deaths) = matches.iter().fold((0, 0), |(kills, deaths), m| {
                    (kills + m.player_kills, deaths + m.player_deaths)
                });
                Ok(format!("{:.2}", kills as f32 / deaths.max(1) as f32))
            }
            Self::TotalKills => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                Ok(matches
                    .iter()
                    .map(|m| m.player_kills)
                    .sum::<u32>()
                    .to_string())
            }
            Self::TotalMatches => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                Ok(matches.len().to_string())
            }
            Self::TotalWinrate => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                let wins = matches
                    .iter()
                    .filter(|m| m.match_result as i8 == m.player_team)
                    .count();
                Ok(format!(
                    "{:.2}%",
                    wins as f32 / matches.len().max(1) as f32 * 100.0
                ))
            }
            Self::TotalWins => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                Ok(matches
                    .iter()
                    .filter(|m| m.match_result as i8 == m.player_team)
                    .count()
                    .to_string())
            }
            Self::TotalLosses => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                Ok(matches
                    .iter()
                    .filter(|m| m.match_result as i8 != m.player_team)
                    .count()
                    .to_string())
            }
            Self::TotalWinsLosses => {
                let matches = Self::get_all_matches(&state.ch_client, steam_id).await?;
                let (wins, losses) = matches.iter().fold((0, 0), |(wins, losses), m| {
                    if m.match_result as i8 == m.player_team {
                        (wins + 1, losses)
                    } else {
                        (wins, losses + 1)
                    }
                });
                Ok(format!("{wins}-{losses}"))
            }
            Self::LatestPatchnotesTitle => fetch_patch_notes(&state.http_client)
                .await
                .map_err(|_| VariableResolveError::FailedToFetchData("patch notes"))?
                .first()
                .map(|patch_notes| patch_notes.title.clone())
                .ok_or(VariableResolveError::FailedToFetchData("patch notes")),
            Self::LatestPatchnotesLink => fetch_patch_notes(&state.http_client)
                .await
                .map_err(|_| VariableResolveError::FailedToFetchData("patch notes"))?
                .first()
                .map(|patch_notes| patch_notes.link.clone())
                .ok_or(VariableResolveError::FailedToFetchData("patch notes")),
            Self::HeroHoursPlayed => {
                let hero_matches = Self::get_hero_matches(
                    &state.ch_client,
                    &state.assets_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                let seconds_playtime: u32 = hero_matches.iter().map(|m| m.match_duration_s).sum();
                Ok(format!("{}h", seconds_playtime / 3600))
            }
            Self::HeroKd => {
                let hero_matches = Self::get_hero_matches(
                    &state.ch_client,
                    &state.assets_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                let (kills, deaths) = hero_matches.iter().fold((0, 0), |(kills, deaths), m| {
                    (kills + m.player_kills, deaths + m.player_deaths)
                });
                Ok(format!("{:.2}", kills as f32 / deaths.max(1) as f32))
            }
            Self::HeroKills => {
                let hero_matches = Self::get_hero_matches(
                    &state.ch_client,
                    &state.assets_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                Ok(hero_matches
                    .iter()
                    .map(|m| m.player_kills)
                    .sum::<u32>()
                    .to_string())
            }
            Self::HeroMatches => {
                Self::get_hero_matches(&state.ch_client, &state.assets_client, steam_id, extra_args)
                    .await
                    .map(|m| m.len().to_string())
            }
            Self::HeroLosses => {
                let hero_matches = Self::get_hero_matches(
                    &state.ch_client,
                    &state.assets_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                Ok(hero_matches
                    .iter()
                    .filter(|m| m.match_result as i8 != m.player_team)
                    .count()
                    .to_string())
            }
            Self::HeroWinrate => {
                let hero_matches = Self::get_hero_matches(
                    &state.ch_client,
                    &state.assets_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                let wins = hero_matches
                    .iter()
                    .filter(|m| m.match_result as i8 == m.player_team)
                    .count();
                let total = hero_matches.len();
                Ok(format!("{:.2}%", wins as f32 / total.max(1) as f32 * 100.0))
            }
            Self::HeroWins => {
                let hero_matches = Self::get_hero_matches(
                    &state.ch_client,
                    &state.assets_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                Ok(hero_matches
                    .iter()
                    .filter(|m| m.match_result as i8 == m.player_team)
                    .count()
                    .to_string())
            }
            Self::MaxBombStacks => {
                Self::get_max_ability_stat(&state.ch_client, steam_id, 2521902222)
                    .await
                    .map(|b| b.to_string())
                    .map_err(|_| VariableResolveError::FailedToFetchData("max bomb stacks"))
            }
            Self::MaxSpiritSnareStacks => {
                Self::get_max_ability_stat(&state.ch_client, steam_id, 512733154)
                    .await
                    .map(|b| b.to_string())
                    .map_err(|_| VariableResolveError::FailedToFetchData("max spirit snare stacks"))
            }
            Self::MaxBonusHealthPerKill => {
                Self::get_max_ability_stat(&state.ch_client, steam_id, 1917840730)
                    .await
                    .map(|b| b.to_string())
                    .map_err(|_| {
                        VariableResolveError::FailedToFetchData("max bonus health per kill")
                    })
            }
            Self::MaxGuidedOwlStacks => {
                Self::get_max_ability_stat(&state.ch_client, steam_id, 3242902780)
                    .await
                    .map(|b| b.to_string())
                    .map_err(|_| VariableResolveError::FailedToFetchData("max guided owl"))
            }
            Self::MMRHistoryRank => {
                let mmr_history = get_last_mmr_history(&state.ch_client, steam_id)
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("mmr history"))?;
                let ranks = state
                    .assets_client
                    .fetch_ranks()
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("ranks"))?;
                let rank_name = ranks
                    .iter()
                    .find(|r| r.tier == mmr_history.division)
                    .map(|r| r.name.clone())
                    .ok_or(VariableResolveError::FailedToFetchData("rank"))?;
                Ok(format!("{rank_name} {}", mmr_history.division_tier))
            }
            Self::MMRHistoryRankImg => {
                let mmr_history = get_last_mmr_history(&state.ch_client, steam_id)
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("mmr history"))?;
                let ranks = state
                    .assets_client
                    .fetch_ranks()
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("ranks"))?;
                ranks
                    .iter()
                    .find(|r| r.tier == mmr_history.division)
                    .and_then(|r| {
                        r.images
                            .get(&format!("small_subrank{}", mmr_history.division_tier))
                    })
                    .cloned()
                    .ok_or(VariableResolveError::FailedToFetchData("rank"))
            }
        }
    }

    async fn get_max_ability_stat(
        ch_client: &clickhouse::Client,
        steam_id: u32,
        ability_id: i64,
    ) -> clickhouse::error::Result<i64> {
        ch_client
            .query(
                r#"
                SELECT max(ability_stats[?]) as max_ability_stat
                FROM match_player
                    JOIN match_info USING match_id
                WHERE
                    game_mode = 'Normal'
                    AND match_outcome = 'TeamWin'
                    AND match_mode IN ('Ranked', 'Unranked')
                    AND account_id=?
                "#,
            )
            .bind(ability_id)
            .bind(steam_id)
            .fetch_one()
            .await
    }

    async fn get_all_matches(
        ch_client: &clickhouse::Client,
        steam_id: u32,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        let ch_match_history = fetch_match_history_from_clickhouse(ch_client, steam_id)
            .await
            .map_err(|_| VariableResolveError::FailedToFetchData("matches"))?;

        Ok(ch_match_history
            .into_iter()
            .filter(|e| {
                e.match_mode == ECitadelMatchMode::KECitadelMatchModeUnranked as i8
                    || e.match_mode == ECitadelMatchMode::KECitadelMatchModeRanked as i8
            })
            .filter(|e| e.game_mode == ECitadelGameMode::KECitadelGameModeNormal as i8)
            .sorted_by_key(|e| e.match_id)
            .rev()
            .unique_by(|e| e.match_id)
            .collect_vec())
    }

    async fn get_hero_matches(
        ch_client: &clickhouse::Client,
        assets_client: &AssetsClient,
        steam_id: u32,
        extra_args: &HashMap<String, String>,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        let hero_name = extra_args
            .get("hero_name")
            .ok_or(VariableResolveError::MissingArgument("hero name"))?;

        // Create a temporary AssetsClient
        let hero_id = assets_client
            .fetch_hero_id_from_name(hero_name)
            .await
            .ok()
            .flatten()
            .ok_or(VariableResolveError::FailedToFetchData("hero id"))?;
        Self::get_all_matches(ch_client, steam_id)
            .await
            .map(|m| m.into_iter().filter(|m| m.hero_id == hero_id).collect())
            .map_err(|_| VariableResolveError::FailedToFetchData("matches"))
    }

    async fn get_todays_matches(
        steam_client: &SteamClient,
        steam_id: u32,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        let matches = fetch_steam_match_history(steam_client, steam_id, false)
            .await
            .map_err(|_| VariableResolveError::FailedToFetchData("matches"))?;
        let first_match = matches
            .first()
            .ok_or(VariableResolveError::FailedToFetchData("matches"))?;

        // If the first match is older than 8 hours ago, we can assume that the player has no matches today
        if first_match.start_time < (chrono::Utc::now() - Duration::hours(8)).timestamp() as u32 {
            return Ok(vec![]);
        }

        Ok(vec![*first_match]
            .into_iter()
            .chain(
                matches
                    .into_iter()
                    .tuple_windows()
                    .take_while(|(c, l)| c.start_time - l.start_time <= 6 * 60 * 60)
                    .map(|(_, c)| c),
            )
            .collect())
    }

    async fn get_leaderboard_entry(
        rate_limit_key: &RateLimitKey,
        state: &AppState,
        steam_id: u32,
        region: LeaderboardRegion,
        hero_id: Option<u32>,
    ) -> Result<LeaderboardEntry, VariableResolveError> {
        let (leaderboard, steam_name) = join(
            async {
                let raw_leaderboard =
                    fetch_leaderboard_raw(&state.steam_client, region, hero_id).await?;
                let proto_leaderboard: SteamProxyResponse<CMsgClientToGcGetLeaderboardResponse> =
                    raw_leaderboard.try_into()?;
                let leaderboard: APIResult<Leaderboard> = proto_leaderboard.msg.try_into();
                leaderboard
            },
            get_steam_account_name(rate_limit_key, state, &state.pg_client, steam_id),
        )
        .await;
        let leaderboard =
            leaderboard.map_err(|_| VariableResolveError::FailedToFetchData("leaderboard"))?;
        let steam_name = steam_name?;
        leaderboard
            .entries
            .into_iter()
            .find(|entry| {
                entry
                    .account_name
                    .as_ref()
                    .is_some_and(|n| n == &steam_name)
            })
            .ok_or(VariableResolveError::PlayerNotFoundInLeaderboard)
    }
}

#[cached(
    ty = "TimedCache<u32, MMRHistory>",
    create = "{ TimedCache::with_lifespan(60) }",
    result = true,
    convert = "{ steam_id }",
    sync_writes = "by_key",
    key = "u32"
)]
async fn get_last_mmr_history(
    ch_client: &clickhouse::Client,
    steam_id: u32,
) -> clickhouse::error::Result<MMRHistory> {
    ch_client
        .query(
            r#"
                SELECT ?fields
                FROM mmr_history
                WHERE account_id = ?
                ORDER BY match_id DESC
                LIMIT 1
                "#,
        )
        .bind(steam_id)
        .fetch_one()
        .await
}

async fn get_steam_account_name(
    rate_limit_key: &RateLimitKey,
    state: &AppState,
    pg_client: &Pool<Postgres>,
    steam_id: u32,
) -> Result<String, VariableResolveError> {
    match state
        .steam_client
        .fetch_steam_account_name(rate_limit_key, state, steam_id)
        .await
    {
        Ok(name) => Ok(name),
        Err(e) => {
            warn!(
                "Failed to fetch steam account name from API, falling back to database, error: {e}"
            );
            sqlx::query!(
                "SELECT personaname FROM steam_profiles WHERE account_id = $1",
                steam_id as i32
            )
            .fetch_one(pg_client)
            .await
            .ok()
            .and_then(|row| row.personaname)
            .ok_or(VariableResolveError::FailedToFetchSteamName(
                "Failed to fetch steam name from database".to_string(),
            ))
        }
    }
}
