use std::collections::HashMap;

use chrono::Duration;
use futures::future::join;
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use strum::{EnumString, IntoStaticStr, VariantArray};
use thiserror::Error;
use tracing::warn;
use utoipa::ToSchema;
use valveprotos::deadlock::{CMsgClientToGcGetLeaderboardResponse, ECitadelMatchMode};

use crate::context::AppState;
use crate::error::{APIError, APIResult};
use crate::routes::v1::leaderboard::route::fetch_leaderboard_raw;
use crate::routes::v1::leaderboard::types::{Leaderboard, LeaderboardEntry, LeaderboardRegion};
use crate::routes::v1::players::card::{PlayerCard, get_player_card};
use crate::routes::v1::players::match_history::{
    PlayerMatchHistory, PlayerMatchHistoryEntry, fetch_match_history_from_clickhouse,
    fetch_steam_match_history, insert_match_history_to_ch,
};
use crate::routes::v1::players::mmr;
use crate::routes::v1::players::mmr::mmr_history::MMRHistory;
use crate::services::assets::client::AssetsClient;
use crate::services::rate_limiter::extractor::RateLimitKey;
use crate::services::steam::client::SteamClient;
use crate::services::steam::types::SteamProxyResponse;

#[derive(Debug, Error)]
pub(super) enum VariableResolveError {
    #[error("No data found for {0}")]
    NoData(&'static str),
    #[error(transparent)]
    SQLx(#[from] sqlx::Error),
    #[error(transparent)]
    Clickhouse(#[from] clickhouse::error::Error),
    #[error(transparent)]
    Request(#[from] reqwest::Error),
    #[error(transparent)]
    Api(#[from] APIError),
}

#[derive(Debug, Serialize, Clone, Copy, ToSchema)]
pub(super) enum VariableCategory {
    General,
    Daily,
    Hero,
    Item,
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
pub(super) enum Variable {
    MaxBombStacks,
    MaxSpiritSnareStacks,
    MaxBonusHealthPerKill,
    MaxGuidedOwlStacks,
    MaxTrophyCollectorStacks,
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
    Rank,
    RankImg,
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

/// Pre-fetched data shared across variable resolution to avoid duplicate queries.
/// Stores `Result` types so that fetch failures only affect variables that need that data,
/// preserving per-variable error semantics.
pub(super) struct ResolverContext {
    all_matches: Result<Vec<PlayerMatchHistoryEntry>, String>,
    todays_matches: Result<Vec<PlayerMatchHistoryEntry>, String>,
}

impl ResolverContext {
    pub(super) async fn new(
        variables: &[&Variable],
        ch_client_ro: &clickhouse::Client,
        ch_client: &clickhouse::Client,
        steam_client: &SteamClient,
        steam_id: u32,
    ) -> Self {
        let needs_all = variables.iter().any(|v| v.needs_all_matches());
        let needs_today = variables.iter().any(|v| v.needs_todays_matches());

        let (all_matches, todays_matches) = join(
            async {
                if needs_all {
                    Variable::get_all_matches(ch_client_ro, steam_id)
                        .await
                        .map(core::iter::Iterator::collect)
                        .map_err(|e| e.to_string())
                } else {
                    Ok(Vec::new())
                }
            },
            async {
                if needs_today {
                    Variable::get_todays_matches(ch_client, steam_client, steam_id)
                        .await
                        .map_err(|e| e.to_string())
                } else {
                    Ok(Vec::new())
                }
            },
        )
        .await;

        Self {
            all_matches,
            todays_matches,
        }
    }

    fn all_matches(&self) -> Result<&[PlayerMatchHistoryEntry], VariableResolveError> {
        self.all_matches
            .as_deref()
            .map_err(|_| VariableResolveError::NoData("match history"))
    }

    fn todays_matches(&self) -> Result<&[PlayerMatchHistoryEntry], VariableResolveError> {
        self.todays_matches
            .as_deref()
            .map_err(|_| VariableResolveError::NoData("todays matches"))
    }

    fn hero_matches(
        &self,
        hero_id: u32,
    ) -> Result<impl Iterator<Item = &PlayerMatchHistoryEntry>, VariableResolveError> {
        Ok(self
            .all_matches()?
            .iter()
            .filter(move |m| m.hero_id == hero_id))
    }
}

impl Variable {
    pub(super) fn get_name(&self) -> &str {
        self.into()
    }

    fn needs_all_matches(self) -> bool {
        matches!(
            self,
            Self::HighestDeathCount
                | Self::HighestDenies
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
                | Self::MostPlayedHero
                | Self::MostPlayedHeroCount
                | Self::HeroHoursPlayed
                | Self::HeroKd
                | Self::HeroKills
                | Self::HeroMatches
                | Self::HeroLosses
                | Self::HeroWinrate
                | Self::HeroWins
        )
    }

    fn needs_todays_matches(self) -> bool {
        matches!(
            self,
            Self::HeroesPlayedToday
                | Self::WinrateToday
                | Self::WinsLossesToday
                | Self::MatchesToday
                | Self::WinsToday
                | Self::LossesToday
        )
    }

    pub(super) fn get_category(self) -> VariableCategory {
        match self {
            Self::LatestPatchnotesLink
            | Self::LatestPatchnotesTitle
            | Self::SteamAccountName
            | Self::MMRHistoryRank
            | Self::MMRHistoryRankImg
            | Self::Rank
            | Self::RankImg => VariableCategory::General,

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
            Self::MaxTrophyCollectorStacks => VariableCategory::Item,
        }
    }

    pub(super) fn get_description(self) -> &'static str {
        match self {
            Self::Rank | Self::RankImg => "Get the rank",
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
            Self::LeaderboardRank | Self::LeaderboardRankImg => "Get the leaderboard rank",
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
            Self::MaxTrophyCollectorStacks => "Get the max stacks on Trophy Collector",
            Self::MMRHistoryRank | Self::MMRHistoryRankImg => "Get the MMR history rank",
        }
    }

    pub(super) fn get_default_label(&self) -> Option<&str> {
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
            Self::LeaderboardRank | Self::MMRHistoryRank => Some("Rank"),
            _ => None,
        }
    }

    pub(super) fn extra_args(self) -> Vec<String> {
        match self {
            Self::HeroHoursPlayed
            | Self::HeroKd
            | Self::HeroKills
            | Self::HeroLeaderboardPlace
            | Self::HeroLosses
            | Self::HeroMatches
            | Self::HeroWinrate
            | Self::HeroWins => vec!["hero_name".to_owned()],
            _ => vec![],
        }
    }

    #[allow(clippy::too_many_lines)]
    pub(super) async fn resolve(
        &self,
        rate_limit_key: &RateLimitKey,
        state: &AppState,
        steam_id: u32,
        region: LeaderboardRegion,
        extra_args: &HashMap<String, String>,
        context: &ResolverContext,
    ) -> Result<String, VariableResolveError> {
        match self {
            Self::Rank => {
                let (rank, subrank) = Self::fetch_card_ranks(state, steam_id).await?;
                let ranks = state.assets_client.fetch_ranks().await?;
                let rank = ranks
                    .iter()
                    .find(|r| r.tier == rank)
                    .ok_or(VariableResolveError::NoData("leaderboard rank"))?;
                Ok(format!("{} {subrank}", rank.name))
            }
            Self::RankImg => {
                let (rank, subrank) = Self::fetch_card_ranks(state, steam_id).await?;
                state
                    .assets_client
                    .fetch_ranks()
                    .await?
                    .iter()
                    .find(|r| r.tier == rank)
                    .and_then(|r| {
                        r.images
                            .get(&format!("large_subrank{subrank}"))
                            .or(r.images.get(&format!("small_subrank{subrank}")))
                    })
                    .cloned()
                    .ok_or(VariableResolveError::NoData("leaderboard rank img"))
            }
            Self::LeaderboardRankImg => {
                let (rank, subrank) = match Self::get_leaderboard_entry(
                    rate_limit_key,
                    state,
                    steam_id,
                    region,
                    None,
                )
                .await?
                .and_then(|l| l.badge_level)
                .map(|b| (b / 10, b % 10))
                {
                    Some((rank, subrank)) => (rank, subrank),
                    None => Self::fetch_card_ranks(state, steam_id).await?,
                };
                let ranks = state.assets_client.fetch_ranks().await?;
                ranks
                    .iter()
                    .find(|r| r.tier == rank)
                    .and_then(|r| {
                        r.images
                            .get(&format!("large_subrank{subrank}"))
                            .or(r.images.get(&format!("small_subrank{subrank}")))
                    })
                    .cloned()
                    .ok_or(VariableResolveError::NoData("leaderboard rank img"))
            }
            Self::LeaderboardRank => {
                let (rank, subrank) = match Self::get_leaderboard_entry(
                    rate_limit_key,
                    state,
                    steam_id,
                    region,
                    None,
                )
                .await?
                .and_then(|l| l.badge_level)
                .map(|b| (b / 10, b % 10))
                {
                    Some((rank, subrank)) => (rank, subrank),
                    None => Self::fetch_card_ranks(state, steam_id).await?,
                };
                let ranks = state.assets_client.fetch_ranks().await?;
                let rank = ranks
                    .iter()
                    .find(|r| r.tier == rank)
                    .ok_or(VariableResolveError::NoData("leaderboard rank"))?;
                Ok(format!("{} {subrank}", rank.name))
            }
            Self::HeroesPlayedToday => {
                let heroes_played =
                    context
                        .todays_matches()?
                        .iter()
                        .fold(HashMap::new(), |mut acc, m| {
                            *acc.entry(m.hero_id).or_insert(0) += 1;
                            acc
                        });
                let heroes = state.assets_client.fetch_heroes().await?;
                let heroes = heroes
                    .into_iter()
                    .map(|h| (h.id, h.name))
                    .collect::<HashMap<_, _>>();
                Ok(heroes_played
                    .into_iter()
                    .filter_map(|(hero_id, count)| {
                        format!("{} ({count})", heroes.get(&hero_id)?).into()
                    })
                    .join(", "))
            }
            Self::HeroLeaderboardPlace => {
                let hero_name = extra_args
                    .get("hero_name")
                    .ok_or(VariableResolveError::NoData("hero name"))?;
                let hero_id = state
                    .assets_client
                    .fetch_hero_id_from_name(hero_name)
                    .await?
                    .ok_or(VariableResolveError::NoData("hero id"))?;
                let leaderboard_entry = Self::get_leaderboard_entry(
                    rate_limit_key,
                    state,
                    steam_id,
                    region,
                    Some(hero_id),
                )
                .await?
                .ok_or(VariableResolveError::NoData("leaderboard entry"))?;
                Ok(format!("#{}", leaderboard_entry.rank.unwrap_or_default()))
            }
            Self::LeaderboardPlace => {
                Ok(
                    Self::get_leaderboard_entry(rate_limit_key, state, steam_id, region, None)
                        .await?
                        .and_then(|entry| entry.rank)
                        .map_or("N/A".to_owned(), |rank| format!("#{rank}")),
                )
            }
            Self::SteamAccountName => get_steam_account_name(rate_limit_key, state, steam_id).await,
            Self::HighestDeathCount => context
                .all_matches()?
                .iter()
                .map(|m| m.player_deaths)
                .max()
                .map(|m| m.to_string())
                .ok_or(VariableResolveError::NoData("player deaths")),
            Self::HighestDenies => context
                .all_matches()?
                .iter()
                .map(|m| m.denies)
                .max()
                .map(|m| m.to_string())
                .ok_or(VariableResolveError::NoData("player denies")),
            Self::HighestKillCount => context
                .all_matches()?
                .iter()
                .map(|m| m.player_kills)
                .max()
                .map(|m| m.to_string())
                .ok_or(VariableResolveError::NoData("player kills")),
            Self::HighestLastHits => context
                .all_matches()?
                .iter()
                .map(|m| m.last_hits)
                .max()
                .map(|m| m.to_string())
                .ok_or(VariableResolveError::NoData("player last hits")),
            Self::HighestNetWorth => context
                .all_matches()?
                .iter()
                .map(|m| m.net_worth)
                .max()
                .map(|m| m.to_string())
                .ok_or(VariableResolveError::NoData("player net worth")),
            Self::HoursPlayed => {
                let seconds_playtime: u32 = context
                    .all_matches()?
                    .iter()
                    .map(|m| m.match_duration_s)
                    .sum();
                Ok(format!("{}h", seconds_playtime / 3600))
            }
            Self::WinrateToday => {
                let (wins, total) =
                    context
                        .todays_matches()?
                        .iter()
                        .fold((0, 0), |(wins, total), m| {
                            if m.won() {
                                (wins + 1, total + 1)
                            } else {
                                (wins, total + 1)
                            }
                        });
                Ok(format!(
                    "{:.2}%",
                    f64::from(wins) / f64::from(total.max(1)) * 100.0
                ))
            }
            Self::WinsLossesToday => {
                let (wins, losses) =
                    context
                        .todays_matches()?
                        .iter()
                        .fold((0, 0), |(wins, losses), m| {
                            if m.won() {
                                (wins + 1, losses)
                            } else {
                                (wins, losses + 1)
                            }
                        });
                Ok(format!("{wins}-{losses}"))
            }
            Self::MatchesToday => Ok(context.todays_matches()?.len().to_string()),
            Self::WinsToday => Ok(context
                .todays_matches()?
                .iter()
                .filter(|m| m.won())
                .count()
                .to_string()),
            Self::LossesToday => Ok(context
                .todays_matches()?
                .iter()
                .filter(|m| !m.won())
                .count()
                .to_string()),
            Self::MostPlayedHero => {
                let most_played_hero = context
                    .all_matches()?
                    .iter()
                    .fold(HashMap::new(), |mut acc, m| {
                        *acc.entry(m.hero_id).or_insert(0) += 1;
                        acc
                    })
                    .into_iter()
                    .max_by_key(|(_, count)| *count)
                    .map(|(hero_id, _)| hero_id)
                    .ok_or(VariableResolveError::NoData("most played hero"))?;
                state
                    .assets_client
                    .fetch_hero_name_from_id(most_played_hero)
                    .await
                    .ok()
                    .flatten()
                    .ok_or(VariableResolveError::NoData("most played hero name"))
            }
            Self::MostPlayedHeroCount => {
                let most_played_hero_count = context
                    .all_matches()?
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
                let (kills, deaths) = context
                    .all_matches()?
                    .iter()
                    .fold((0, 0), |(kills, deaths), m| {
                        (kills + m.player_kills, deaths + m.player_deaths)
                    });
                Ok(format!(
                    "{:.2}",
                    f64::from(kills) / f64::from(deaths.max(1))
                ))
            }
            Self::TotalKills => Ok(context
                .all_matches()?
                .iter()
                .map(|m| m.player_kills)
                .sum::<u32>()
                .to_string()),
            Self::TotalMatches => Ok(context.all_matches()?.len().to_string()),
            Self::TotalWinrate => {
                let (wins, total) =
                    context
                        .all_matches()?
                        .iter()
                        .fold((0, 0), |(wins, total), m| {
                            if m.won() {
                                (wins + 1, total + 1)
                            } else {
                                (wins, total + 1)
                            }
                        });
                Ok(format!(
                    "{:.2}%",
                    f64::from(wins) / f64::from(total.max(1)) * 100.0
                ))
            }
            Self::TotalWins => Ok(context
                .all_matches()?
                .iter()
                .filter(|m| m.won())
                .count()
                .to_string()),
            Self::TotalLosses => Ok(context
                .all_matches()?
                .iter()
                .filter(|m| !m.won())
                .count()
                .to_string()),
            Self::TotalWinsLosses => {
                let (wins, losses) =
                    context
                        .all_matches()?
                        .iter()
                        .fold((0, 0), |(wins, losses), m| {
                            if m.won() {
                                (wins + 1, losses)
                            } else {
                                (wins, losses + 1)
                            }
                        });
                Ok(format!("{wins}-{losses}"))
            }
            Self::LatestPatchnotesTitle => state
                .steam_client
                .fetch_patch_notes()
                .await?
                .first()
                .map(|patch_notes| patch_notes.title.clone())
                .ok_or(VariableResolveError::NoData("patch notes")),
            Self::LatestPatchnotesLink => state
                .steam_client
                .fetch_patch_notes()
                .await?
                .first()
                .map(|patch_notes| patch_notes.link.clone())
                .ok_or(VariableResolveError::NoData("patch notes")),
            Self::HeroHoursPlayed => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                let seconds_playtime: u32 = context
                    .hero_matches(hero_id)?
                    .map(|m| m.match_duration_s)
                    .sum();
                Ok(format!("{}h", seconds_playtime / 3600))
            }
            Self::HeroKd => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                let (kills, deaths) = context
                    .hero_matches(hero_id)?
                    .fold((0, 0), |(kills, deaths), m| {
                        (kills + m.player_kills, deaths + m.player_deaths)
                    });
                Ok(format!(
                    "{:.2}",
                    f64::from(kills) / f64::from(deaths.max(1))
                ))
            }
            Self::HeroKills => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                Ok(context
                    .hero_matches(hero_id)?
                    .map(|m| m.player_kills)
                    .sum::<u32>()
                    .to_string())
            }
            Self::HeroMatches => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                Ok(context.hero_matches(hero_id)?.count().to_string())
            }
            Self::HeroLosses => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                Ok(context
                    .hero_matches(hero_id)?
                    .filter(|m| !m.won())
                    .count()
                    .to_string())
            }
            Self::HeroWinrate => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                let (wins, total) = context
                    .hero_matches(hero_id)?
                    .fold((0, 0), |(wins, total), m| {
                        (wins + i32::from(m.won()), total + 1)
                    });
                Ok(format!(
                    "{:.2}%",
                    f64::from(wins) / f64::from(total.max(1)) * 100.0
                ))
            }
            Self::HeroWins => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
                Ok(context
                    .hero_matches(hero_id)?
                    .filter(|m| m.won())
                    .count()
                    .to_string())
            }
            Self::MaxBombStacks => {
                Self::get_max_ability_stat(&state.ch_client_ro, steam_id, 2521902222)
                    .await
                    .map(|r| r.to_string())
                    .map_err(Into::into)
            }
            Self::MaxSpiritSnareStacks => {
                Self::get_max_ability_stat(&state.ch_client_ro, steam_id, 512733154)
                    .await
                    .map(|r| r.to_string())
                    .map_err(Into::into)
            }
            Self::MaxBonusHealthPerKill => {
                Self::get_max_ability_stat(&state.ch_client_ro, steam_id, 1917840730)
                    .await
                    .map(|r| r.to_string())
                    .map_err(Into::into)
            }
            Self::MaxGuidedOwlStacks => {
                Self::get_max_ability_stat(&state.ch_client_ro, steam_id, 3242902780)
                    .await
                    .map(|r| r.to_string())
                    .map_err(Into::into)
            }
            Self::MaxTrophyCollectorStacks => {
                Self::get_max_ability_stat(&state.ch_client_ro, steam_id, 3074274290)
                    .await
                    .map(|r| r.to_string())
                    .map_err(Into::into)
            }
            Self::MMRHistoryRank => {
                let mmr = get_last_mmr_history(&state.ch_client_ro, steam_id)
                    .await?
                    .ok_or(VariableResolveError::NoData("mmr history"))?;
                let ranks = state.assets_client.fetch_ranks().await?;
                let rank_name = ranks
                    .iter()
                    .find(|r| r.tier == mmr.division)
                    .map(|r| r.name.clone())
                    .ok_or(VariableResolveError::NoData("rank name"))?;
                Ok(format!("{rank_name} {}", mmr.division_tier))
            }
            Self::MMRHistoryRankImg => {
                let mmr = get_last_mmr_history(&state.ch_client_ro, steam_id)
                    .await?
                    .ok_or(VariableResolveError::NoData("mmr history"))?;
                let ranks = state.assets_client.fetch_ranks().await?;
                ranks
                    .iter()
                    .find(|r| r.tier == mmr.division)
                    .and_then(|r| {
                        r.images
                            .get(&format!("large_subrank{}", mmr.division_tier))
                            .or(r.images.get(&format!("small_subrank{}", mmr.division_tier)))
                    })
                    .cloned()
                    .ok_or(VariableResolveError::NoData("rank img"))
            }
        }
    }

    async fn fetch_card_ranks(
        state: &AppState,
        steam_id: u32,
    ) -> Result<(u32, u32), VariableResolveError> {
        let player_card = Self::fetch_card(state, steam_id).await?;
        Ok((
            player_card.ranked_rank.unwrap_or_default(),
            player_card.ranked_subrank.unwrap_or_default(),
        ))
    }

    async fn fetch_card(
        state: &AppState,
        steam_id: u32,
    ) -> Result<PlayerCard, VariableResolveError> {
        let bot_username = sqlx::query!(
            "SELECT bot_id FROM bot_friends WHERE friend_id = $1",
            i32::try_from(steam_id).map_err(|_| VariableResolveError::NoData("bot id"))?
        )
        .fetch_one(&state.pg_client)
        .await?
        .bot_id;
        let player_card = get_player_card(
            &state.steam_client,
            &state.ch_client,
            steam_id,
            bot_username,
        )
        .await?;
        Ok(player_card)
    }

    async fn get_max_ability_stat(
        ch_client: &clickhouse::Client,
        steam_id: u32,
        ability_id: i64,
    ) -> clickhouse::error::Result<i64> {
        ch_client
            .query(
                "
                SELECT max(ability_stats[?]) as max_ability_stat
                FROM match_player
                    JOIN match_info USING match_id
                WHERE
                    match_mode IN ('Ranked', 'Unranked')
                    AND account_id=?
                ",
            )
            .bind(ability_id)
            .bind(steam_id)
            .fetch_one()
            .await
    }

    async fn get_all_matches(
        ch_client: &clickhouse::Client,
        steam_id: u32,
    ) -> Result<impl Iterator<Item = PlayerMatchHistoryEntry>, VariableResolveError> {
        let ch_match_history = fetch_match_history_from_clickhouse(ch_client, steam_id).await?;

        Ok(ch_match_history
            .into_iter()
            .filter(|e| {
                e.match_mode == ECitadelMatchMode::KECitadelMatchModeUnranked as i8
                    || e.match_mode == ECitadelMatchMode::KECitadelMatchModeRanked as i8
            })
            .sorted_by_key(|e| e.match_id)
            .rev()
            .unique_by(|e| e.match_id))
    }

    async fn resolve_hero_id(
        assets_client: &AssetsClient,
        extra_args: &HashMap<String, String>,
    ) -> Result<u32, VariableResolveError> {
        let hero_name = extra_args
            .get("hero_name")
            .ok_or(VariableResolveError::NoData("hero name"))?;
        assets_client
            .fetch_hero_id_from_name(hero_name)
            .await?
            .ok_or(VariableResolveError::NoData("hero id"))
    }

    async fn get_todays_matches(
        ch_client: &clickhouse::Client,
        steam_client: &SteamClient,
        account_id: u32,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        let matches = match fetch_steam_match_history(steam_client, account_id, false, None).await {
            Ok(m) => {
                let ch_client = ch_client.clone();
                let matches = m.clone();
                tokio::spawn(async move {
                    let result = insert_match_history_to_ch(&ch_client, &matches).await;
                    if let Err(e) = result {
                        warn!("Failed to insert player match history to ClickHouse: {e:?}");
                    }
                });
                m
            }
            Err(_) => fetch_match_history_from_clickhouse(ch_client, account_id).await?,
        };

        let first_match = matches
            .first()
            .ok_or(VariableResolveError::NoData("todays matches"))?;

        // If the first match is older than 8 hours ago, we can assume that the player has no matches today
        if first_match.start_time
            < u32::try_from((chrono::Utc::now() - Duration::hours(8)).timestamp())
                .unwrap_or_default()
        {
            return Ok(vec![]);
        }

        Ok(vec![first_match.clone()]
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
    ) -> Result<Option<LeaderboardEntry>, VariableResolveError> {
        let (leaderboard, steam_name) = join(
            async {
                let raw_leaderboard =
                    fetch_leaderboard_raw(&state.steam_client, region, hero_id).await?;
                let proto_leaderboard: SteamProxyResponse<CMsgClientToGcGetLeaderboardResponse> =
                    raw_leaderboard.try_into()?;
                let leaderboard: APIResult<Leaderboard> = proto_leaderboard.msg.try_into();
                leaderboard
            },
            get_steam_account_name(rate_limit_key, state, steam_id),
        )
        .await;
        let leaderboard = leaderboard?;
        let steam_name = steam_name?;
        Ok(leaderboard.entries.into_iter().find(|entry| {
            entry
                .account_name
                .as_ref()
                .is_some_and(|n| n == &steam_name)
        }))
    }
}

async fn get_last_mmr_history(
    ch_client: &clickhouse::Client,
    steam_id: u32,
) -> clickhouse::error::Result<Option<MMRHistory>> {
    Ok(mmr::batch::get_mmr(ch_client, &[steam_id], None)
        .await?
        .first()
        .cloned())
}

async fn get_steam_account_name(
    rate_limit_key: &RateLimitKey,
    state: &AppState,
    steam_id: u32,
) -> Result<String, VariableResolveError> {
    match state
        .steam_client
        .fetch_steam_account_name(rate_limit_key, state, steam_id)
        .await
    {
        Ok(name) => Ok(name),
        Err(e) => {
            warn!("Failed to fetch steam account name from API, falling back to db: {e}");
            Ok(state
                .steam_profile_batcher
                .load(steam_id)
                .await?
                .personaname)
        }
    }
}
