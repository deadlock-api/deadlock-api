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
use crate::routes::v1::assets::common::{Language, resolve_version};
use crate::routes::v1::leaderboard::route::fetch_leaderboard_raw;
use crate::routes::v1::leaderboard::types::{Leaderboard, LeaderboardEntry, LeaderboardRegion};
use crate::routes::v1::players::match_history::{
    MatchHistoryInsertBatcher, MatchHistoryReadBatcher, PlayerMatchHistory,
    PlayerMatchHistoryEntry, fetch_steam_match_history,
};
use crate::routes::v1::players::rank::fetch_last_ranked_match;
use crate::services::assets::client::AssetsClient;
use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::ranked_seasons::{fetch_ranked_seasons, season_at};
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
    #[error(transparent)]
    Assets(#[from] AssetsError),
}

#[derive(Debug, Serialize, Clone, Copy, ToSchema)]
pub(super) enum VariableCategory {
    General,
    Daily,
    Hero,
    Item,
    Leaderboard,
    Season,
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
    MMRHistoryRank,
    MMRHistoryRankImg,
    LossesToday,
    MatchesToday,
    MostPlayedHero,
    MostPlayedHeroCount,
    SteamAccountName,
    PredictedRank,
    PredictedRankImg,
    Rank,
    RankAndProgress,
    RankImg,
    RankProgress,
    SeasonHoursPlayed,
    SeasonKd,
    SeasonKills,
    SeasonLosses,
    SeasonMatches,
    SeasonMostPlayedHero,
    SeasonName,
    SeasonWinrate,
    SeasonWins,
    SeasonWinsLosses,
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
    season: Result<CurrentSeason, String>,
}

/// The ranked season running now, spanning all of its intervals.
struct CurrentSeason {
    name: String,
    start_timestamp: i64,
    end_timestamp: i64,
}

impl ResolverContext {
    pub(super) async fn new(variables: &[&Variable], state: &AppState, steam_id: u32) -> Self {
        let needs_all = variables.iter().any(|v| v.needs_all_matches());
        let needs_today = variables.iter().any(|v| v.needs_todays_matches());
        let needs_season = variables.iter().any(|v| v.needs_season());

        let (all_matches, todays_matches, season) = tokio::join!(
            async {
                if needs_all {
                    Variable::get_all_matches(&state.batchers.match_history_read, steam_id)
                        .await
                        .map(core::iter::Iterator::collect)
                        .map_err(|e| e.to_string())
                } else {
                    Ok(Vec::new())
                }
            },
            async {
                if needs_today {
                    Variable::get_todays_matches(
                        &state.batchers.match_history_read,
                        &state.steam_client,
                        &state.batchers.match_history_insert,
                        steam_id,
                    )
                    .await
                    .map_err(|e| e.to_string())
                } else {
                    Ok(Vec::new())
                }
            },
            async {
                if needs_season {
                    Variable::get_current_season(state)
                        .await
                        .map_err(|e| e.to_string())
                } else {
                    Err("season not requested".to_owned())
                }
            },
        );

        Self {
            all_matches,
            todays_matches,
            season,
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
            .filter(move |m| u32::from(m.hero_id) == hero_id))
    }

    fn season(&self) -> Result<&CurrentSeason, VariableResolveError> {
        self.season
            .as_ref()
            .map_err(|_| VariableResolveError::NoData("current season"))
    }

    fn season_matches(
        &self,
    ) -> Result<impl Iterator<Item = &PlayerMatchHistoryEntry>, VariableResolveError> {
        let season = self.season()?;
        let range = season.start_timestamp..=season.end_timestamp;
        Ok(self
            .all_matches()?
            .iter()
            .filter(move |m| range.contains(&i64::from(m.start_time))))
    }
}

impl Variable {
    pub(super) fn get_name(&self) -> &str {
        self.into()
    }

    /// Deprecated variables still resolve, so existing commands keep working, but they are hidden
    /// from the available variables list.
    pub(super) fn is_deprecated(self) -> bool {
        matches!(
            self,
            Self::PredictedRank
                | Self::PredictedRankImg
                | Self::MMRHistoryRank
                | Self::MMRHistoryRankImg
        )
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
                | Self::SeasonHoursPlayed
                | Self::SeasonKd
                | Self::SeasonKills
                | Self::SeasonLosses
                | Self::SeasonMatches
                | Self::SeasonMostPlayedHero
                | Self::SeasonWinrate
                | Self::SeasonWins
                | Self::SeasonWinsLosses
        )
    }

    fn needs_season(self) -> bool {
        matches!(
            self,
            Self::SeasonName
                | Self::SeasonHoursPlayed
                | Self::SeasonKd
                | Self::SeasonKills
                | Self::SeasonLosses
                | Self::SeasonMatches
                | Self::SeasonMostPlayedHero
                | Self::SeasonWinrate
                | Self::SeasonWins
                | Self::SeasonWinsLosses
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
            | Self::PredictedRank
            | Self::PredictedRankImg
            | Self::Rank
            | Self::RankAndProgress
            | Self::RankImg
            | Self::RankProgress => VariableCategory::General,

            Self::LossesToday
            | Self::MatchesToday
            | Self::WinrateToday
            | Self::WinsLossesToday
            | Self::WinsToday => VariableCategory::Daily,

            Self::LeaderboardPlace => VariableCategory::Leaderboard,

            Self::SeasonHoursPlayed
            | Self::SeasonKd
            | Self::SeasonKills
            | Self::SeasonLosses
            | Self::SeasonMatches
            | Self::SeasonMostPlayedHero
            | Self::SeasonName
            | Self::SeasonWinrate
            | Self::SeasonWins
            | Self::SeasonWinsLosses => VariableCategory::Season,

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
            Self::Rank
            | Self::RankImg
            | Self::PredictedRank
            | Self::PredictedRankImg
            | Self::MMRHistoryRank
            | Self::MMRHistoryRankImg => "Get the rank",
            Self::RankProgress => "Get the progress within the current subrank, e.g. 250/1000",
            Self::RankAndProgress => {
                "Get the rank together with the progress within it, e.g. Oracle 5 (250/1000)"
            }
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
            Self::LossesToday => "Get the number of losses today",
            Self::MatchesToday => "Get the number of matches today",
            Self::MostPlayedHero => "Get the most played hero",
            Self::MostPlayedHeroCount => "Get the most played hero count",
            Self::SteamAccountName => "Get the steam account name",
            Self::SeasonHoursPlayed => "Get the total hours played this season",
            Self::SeasonKd => "Get the KD ratio this season",
            Self::SeasonKills => "Get the total kills this season",
            Self::SeasonLosses => "Get the number of losses this season",
            Self::SeasonMatches => "Get the number of matches played this season",
            Self::SeasonMostPlayedHero => "Get the most played hero this season",
            Self::SeasonName => "Get the name of the current ranked season",
            Self::SeasonWinrate => "Get the winrate this season",
            Self::SeasonWins => "Get the number of wins this season",
            Self::SeasonWinsLosses => "Get the number of wins and losses this season",
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
            Self::SeasonWinsLosses => Some("Season W-L"),
            Self::SeasonWinrate => Some("Season Winrate"),
            Self::LeaderboardPlace => Some("Place"),
            Self::MMRHistoryRank | Self::RankAndProgress => Some("Rank"),
            Self::RankProgress => Some("Progress"),
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

    #[expect(clippy::too_many_lines)]
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
            Self::Rank | Self::PredictedRank | Self::MMRHistoryRank => {
                let (rank, subrank) = Self::fetch_player_ranks(state, steam_id).await?;
                let name = Self::rank_name(state, rank).await?;
                Ok(format!("{name} {subrank}"))
            }
            Self::RankProgress => {
                let (_, progress, width) = Self::fetch_rank_progress(state, steam_id).await?;
                Ok(format!("{progress}/{width}"))
            }
            Self::RankAndProgress => {
                let (badge, progress, width) = Self::fetch_rank_progress(state, steam_id).await?;
                let name = Self::rank_name(state, badge / 10).await?;
                Ok(format!("{name} {} ({progress}/{width})", badge % 10))
            }
            Self::RankImg | Self::PredictedRankImg | Self::MMRHistoryRankImg => {
                let (rank, subrank) = Self::fetch_player_ranks(state, steam_id).await?;
                state
                    .assets_client
                    .fetch_ranks()
                    .await?
                    .iter()
                    .find(|r| r.tier == rank)
                    .and_then(|r| {
                        r.images
                            .get(&format!("subrank{subrank}"))
                            .or(r.images.get("large"))
                            .or(r.images.get("large_webp"))
                    })
                    .cloned()
                    .ok_or(VariableResolveError::NoData("rank img"))
            }
            Self::HeroesPlayedToday => {
                let heroes_played = context.todays_matches()?.iter().counts_by(|m| m.hero_id);
                let heroes = state
                    .assets_client
                    .fetch_heroes()
                    .await?
                    .into_iter()
                    .map(|h| (h.id, h.name))
                    .collect::<HashMap<_, _>>();
                Ok(heroes_played
                    .into_iter()
                    .filter_map(|(hero_id, count)| {
                        format!("{} ({count})", heroes.get(&u32::from(hero_id))?).into()
                    })
                    .join(", "))
            }
            Self::HeroLeaderboardPlace => {
                let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
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
            Self::HighestDeathCount => {
                max_stat(context.all_matches()?, |m| m.player_deaths, "player deaths")
            }
            Self::HighestDenies => max_stat(context.all_matches()?, |m| m.denies, "player denies"),
            Self::HighestKillCount => {
                max_stat(context.all_matches()?, |m| m.player_kills, "player kills")
            }
            Self::HighestLastHits => {
                max_stat(context.all_matches()?, |m| m.last_hits, "player last hits")
            }
            Self::HighestNetWorth => {
                max_stat(context.all_matches()?, |m| m.net_worth, "player net worth")
            }
            Self::HoursPlayed => Ok(hours_played(context.all_matches()?)),
            Self::WinrateToday => Ok(winrate(context.todays_matches()?)),
            Self::WinsLossesToday => Ok(wins_losses(context.todays_matches()?)),
            Self::MatchesToday => Ok(context.todays_matches()?.len().to_string()),
            Self::WinsToday => Ok(wins(context.todays_matches()?)),
            Self::LossesToday => Ok(losses(context.todays_matches()?)),
            Self::MostPlayedHero => {
                let hero_id = most_played_hero(context.all_matches()?)
                    .ok_or(VariableResolveError::NoData("most played hero"))?;
                Self::hero_name(state, hero_id, "most played hero name").await
            }
            Self::MostPlayedHeroCount => Ok(context
                .all_matches()?
                .iter()
                .counts_by(|m| m.hero_id)
                .into_values()
                .max()
                .unwrap_or(0)
                .to_string()),
            Self::TotalKd => Ok(kd(context.all_matches()?)),
            Self::TotalKills => Ok(kills(context.all_matches()?)),
            Self::TotalMatches => Ok(context.all_matches()?.len().to_string()),
            Self::TotalWinrate => Ok(winrate(context.all_matches()?)),
            Self::TotalWins => Ok(wins(context.all_matches()?)),
            Self::TotalLosses => Ok(losses(context.all_matches()?)),
            Self::TotalWinsLosses => Ok(wins_losses(context.all_matches()?)),
            Self::SeasonName => Ok(context.season()?.name.clone()),
            Self::SeasonHoursPlayed => Ok(hours_played(context.season_matches()?)),
            Self::SeasonKd => Ok(kd(context.season_matches()?)),
            Self::SeasonKills => Ok(kills(context.season_matches()?)),
            Self::SeasonMatches => Ok(context.season_matches()?.count().to_string()),
            Self::SeasonWins => Ok(wins(context.season_matches()?)),
            Self::SeasonLosses => Ok(losses(context.season_matches()?)),
            Self::SeasonWinsLosses => Ok(wins_losses(context.season_matches()?)),
            Self::SeasonWinrate => Ok(winrate(context.season_matches()?)),
            Self::SeasonMostPlayedHero => {
                let hero_id = most_played_hero(context.season_matches()?)
                    .ok_or(VariableResolveError::NoData("season most played hero"))?;
                Self::hero_name(state, hero_id, "season most played hero name").await
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
            Self::HeroHoursPlayed => Ok(hours_played(
                Self::hero_matches(state, extra_args, context).await?,
            )),
            Self::HeroKd => Ok(kd(Self::hero_matches(state, extra_args, context).await?)),
            Self::HeroKills => Ok(kills(Self::hero_matches(state, extra_args, context).await?)),
            Self::HeroMatches => Ok(Self::hero_matches(state, extra_args, context)
                .await?
                .count()
                .to_string()),
            Self::HeroLosses => Ok(losses(
                Self::hero_matches(state, extra_args, context).await?,
            )),
            Self::HeroWinrate => Ok(winrate(
                Self::hero_matches(state, extra_args, context).await?,
            )),
            Self::HeroWins => Ok(wins(Self::hero_matches(state, extra_args, context).await?)),
            Self::MaxBombStacks => Self::get_max_ability_stat(state, steam_id, 2521902222).await,
            Self::MaxSpiritSnareStacks => {
                Self::get_max_ability_stat(state, steam_id, 512733154).await
            }
            Self::MaxBonusHealthPerKill => {
                Self::get_max_ability_stat(state, steam_id, 1917840730).await
            }
            Self::MaxGuidedOwlStacks => {
                Self::get_max_ability_stat(state, steam_id, 3242902780).await
            }
            Self::MaxTrophyCollectorStacks => {
                Self::get_max_ability_stat(state, steam_id, 3074274290).await
            }
        }
    }

    /// Localized name of a rank tier.
    async fn rank_name(state: &AppState, tier: u32) -> Result<String, VariableResolveError> {
        state
            .assets_client
            .fetch_ranks()
            .await?
            .into_iter()
            .find(|r| r.tier == tier)
            .map(|r| r.name)
            .ok_or(VariableResolveError::NoData("rank"))
    }

    async fn hero_name(
        state: &AppState,
        hero_id: u8,
        label: &'static str,
    ) -> Result<String, VariableResolveError> {
        state
            .assets_client
            .fetch_hero_name_from_id(u32::from(hero_id))
            .await
            .ok()
            .flatten()
            .ok_or(VariableResolveError::NoData(label))
    }

    /// The player's matches on the hero named by the `hero_name` extra arg.
    async fn hero_matches<'a>(
        state: &AppState,
        extra_args: &HashMap<String, String>,
        context: &'a ResolverContext,
    ) -> Result<impl Iterator<Item = &'a PlayerMatchHistoryEntry>, VariableResolveError> {
        let hero_id = Self::resolve_hero_id(&state.assets_client, extra_args).await?;
        context.hero_matches(hero_id)
    }

    /// The rank Valve reports for the player at the end of their latest ranked match (player cards
    /// no longer carry a rank since build 6711).
    async fn fetch_player_ranks(
        state: &AppState,
        steam_id: u32,
    ) -> Result<(u32, u32), VariableResolveError> {
        let badge = fetch_last_ranked_match(&state.batchers.player_rank, steam_id)
            .await?
            .ok_or(VariableResolveError::NoData("rank"))?
            .badge();
        Ok((badge / 10, badge % 10))
    }

    /// Returns `(badge, progress, subrank width)`, both read from the latest ranked match.
    async fn fetch_rank_progress(
        state: &AppState,
        steam_id: u32,
    ) -> Result<(u32, u32, u32), VariableResolveError> {
        let last_match = fetch_last_ranked_match(&state.batchers.player_rank, steam_id)
            .await?
            .ok_or(VariableResolveError::NoData("rank progress"))?;
        let (progress, width) = last_match
            .progress()
            .ok_or(VariableResolveError::NoData("rank progress"))?;
        Ok((last_match.badge(), progress, width))
    }

    async fn get_max_ability_stat(
        state: &AppState,
        steam_id: u32,
        ability_id: i64,
    ) -> Result<String, VariableResolveError> {
        let max: i64 = state
            .ch_client_ro
            .query(
                "
                SELECT max(ability_stats[?]) as max_ability_stat
                FROM match_player
                WHERE
                    match_mode IN ('Ranked', 'Unranked')
                    AND account_id=?
                SETTINGS log_comment = 'variables', apply_patch_parts = 0
                ",
            )
            .bind(ability_id)
            .bind(steam_id)
            .fetch_one()
            .await?;
        Ok(max.to_string())
    }

    async fn get_all_matches(
        match_history_read_batcher: &MatchHistoryReadBatcher,
        steam_id: u32,
    ) -> Result<impl Iterator<Item = PlayerMatchHistoryEntry>, VariableResolveError> {
        let ch_match_history = match_history_read_batcher.load(steam_id).await?;

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

    async fn get_current_season(state: &AppState) -> Result<CurrentSeason, VariableResolveError> {
        let version = resolve_version(state, None).await?;
        let seasons =
            fetch_ranked_seasons(&state.r2_client, version, Language::default().as_str()).await?;
        let (season, start_timestamp, end_timestamp) =
            season_at(&seasons, chrono::Utc::now().timestamp())
                .ok_or(VariableResolveError::NoData("current season"))?;
        Ok(CurrentSeason {
            name: season.name.clone(),
            start_timestamp,
            end_timestamp,
        })
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
        match_history_read_batcher: &MatchHistoryReadBatcher,
        steam_client: &SteamClient,
        match_history_insert_batcher: &MatchHistoryInsertBatcher,
        account_id: u32,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        // No ranked interval: this runs per chat command and only reads the newest
        // match, so the extra call would double the busiest consumer of the match
        // history rate limit for fields it never uses.
        let matches =
            match fetch_steam_match_history(steam_client, account_id, false, None, None).await {
                Ok(m) => {
                    match_history_insert_batcher.insert(m.clone()).await;
                    m
                }
                Err(_) => match_history_read_batcher.load(account_id).await?,
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

        Ok(core::iter::once(first_match.clone())
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
                    fetch_leaderboard_raw(&state.steam_client, region, hero_id, None).await?;
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
                .batchers
                .steam_profile
                .load(steam_id)
                .await?
                .personaname)
        }
    }
}

// Stats shared by the overall, season, hero and daily variables, each over its own set of matches.

fn max_stat<'a>(
    matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>,
    stat: impl Fn(&PlayerMatchHistoryEntry) -> u32,
    label: &'static str,
) -> Result<String, VariableResolveError> {
    matches
        .into_iter()
        .map(stat)
        .max()
        .map(|m| m.to_string())
        .ok_or(VariableResolveError::NoData(label))
}

fn hours_played<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    let seconds_playtime: u32 = matches.into_iter().map(|m| m.match_duration_s).sum();
    format!("{}h", seconds_playtime / 3600)
}

fn kd<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    let (kills, deaths) = matches.into_iter().fold((0, 0), |(kills, deaths), m| {
        (kills + m.player_kills, deaths + m.player_deaths)
    });
    format!("{:.2}", f64::from(kills) / f64::from(deaths.max(1)))
}

fn kills<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    matches
        .into_iter()
        .map(|m| m.player_kills)
        .sum::<u32>()
        .to_string()
}

fn wins<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    matches.into_iter().filter(|m| m.won()).count().to_string()
}

fn losses<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    matches.into_iter().filter(|m| !m.won()).count().to_string()
}

fn wins_losses<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    let (wins, losses) = matches.into_iter().fold((0, 0), |(wins, losses), m| {
        if m.won() {
            (wins + 1, losses)
        } else {
            (wins, losses + 1)
        }
    });
    format!("{wins}-{losses}")
}

fn winrate<'a>(matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>) -> String {
    let (wins, total) = matches.into_iter().fold((0u32, 0u32), |(wins, total), m| {
        (wins + u32::from(m.won()), total + 1)
    });
    format!("{:.2}%", f64::from(wins) / f64::from(total.max(1)) * 100.0)
}

fn most_played_hero<'a>(
    matches: impl IntoIterator<Item = &'a PlayerMatchHistoryEntry>,
) -> Option<u8> {
    matches
        .into_iter()
        .counts_by(|m| m.hero_id)
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(hero_id, _)| hero_id)
}
