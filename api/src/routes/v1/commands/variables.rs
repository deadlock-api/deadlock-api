use crate::config::Config;
use crate::routes::v1::leaderboard::route::fetch_parse_leaderboard;
use crate::routes::v1::leaderboard::types::{LeaderboardEntry, LeaderboardRegion};
use crate::routes::v1::patches::feed::fetch_patch_notes;
use crate::routes::v1::players::match_history::{
    fetch_match_history_from_clickhouse, fetch_steam_match_history,
};
use crate::routes::v1::players::types::PlayerMatchHistory;
use crate::state::AppState;
use cached::TimedCache;
use cached::proc_macro::cached;
use chrono::Duration;
use futures::future::join;
use itertools::{Itertools, chain};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt::Display;
use strum_macros::{EnumString, IntoStaticStr, VariantArray};

// TODO: Improve Error Handling

#[derive(Debug, Clone)]
pub enum VariableResolveError {
    FailedToFetchData(&'static str),
    FailedToFetchSteamName,
    PlayerNotFoundInLeaderboard,
    MissingArgument(&'static str),
}

impl Display for VariableResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FailedToFetchData(data) => write!(f, "Failed to fetch data: {}", data),
            Self::FailedToFetchSteamName => write!(f, "Failed to fetch steam name"),
            Self::PlayerNotFoundInLeaderboard => write!(f, "Player not found in leaderboard"),
            Self::MissingArgument(arg) => write!(f, "Missing argument: {}", arg),
        }
    }
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
    LeaderboardRankBadgeLevel,
    LeaderboardRankImg,
    LossesToday,
    MatchesToday,
    MostPlayedHero,
    MostPlayedHeroCount,
    SteamAccountName,
    TotalKd,
    TotalKills,
    TotalLosses,
    TotalMatches,
    TotalWinrate,
    TotalWins,
    WinrateToday,
    WinsLossesToday,
    WinsToday,
}

impl Variable {
    pub fn get_name(&self) -> &str {
        self.into()
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
            Self::LeaderboardRankBadgeLevel => "Get the leaderboard rank badge level",
            Self::LeaderboardRankImg => "Get the leaderboard rank",
            Self::LossesToday => "Get the number of losses today",
            Self::MatchesToday => "Get the number of matches today",
            Self::MostPlayedHero => "Get the most played hero",
            Self::MostPlayedHeroCount => "Get the most played hero count",
            Self::SteamAccountName => "Get the steam account name",
            Self::TotalKd => "Get the KD ratio",
            Self::TotalKills => "Get the total kills in all matches",
            Self::TotalLosses => "Get the total number of losses",
            Self::TotalMatches => "Get the total number of matches played",
            Self::TotalWinrate => "Get the total winrate",
            Self::TotalWins => "Get the total number of wins",
            Self::WinrateToday => "Get the winrate today",
            Self::WinsLossesToday => "Get the number of wins and losses today",
            Self::WinsToday => "Get the number of wins today",
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
        state: &AppState,
        steam_id: u32,
        region: LeaderboardRegion,
        extra_args: &HashMap<String, String>,
    ) -> Result<String, VariableResolveError> {
        match self {
            Self::LeaderboardRankImg => {
                let leaderboard_entry = Self::get_leaderboard_entry(
                    &state.config,
                    &state.http_client,
                    steam_id,
                    region,
                    None,
                )
                .await
                .map_err(|_| VariableResolveError::PlayerNotFoundInLeaderboard)?;
                let badge_level = leaderboard_entry.badge_level.ok_or(
                    VariableResolveError::FailedToFetchData("leaderboard badge level"),
                )?;
                let ranks = fetch_ranks(&state.http_client)
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
                let leaderboard_entry = Self::get_leaderboard_entry(
                    &state.config,
                    &state.http_client,
                    steam_id,
                    region,
                    None,
                )
                .await
                .map_err(|_| VariableResolveError::PlayerNotFoundInLeaderboard)?;
                let badge_level = leaderboard_entry.badge_level.ok_or(
                    VariableResolveError::FailedToFetchData("leaderboard badge level"),
                )?;
                let ranks = fetch_ranks(&state.http_client)
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("ranks"))?;
                let (rank, subrank) = (badge_level / 10, badge_level % 10);
                let rank_name = ranks
                    .iter()
                    .find(|r| r.tier == rank)
                    .map(|r| r.name.clone())
                    .ok_or(VariableResolveError::FailedToFetchData("rank"))?;
                Ok(format!("{rank_name} {subrank}"))
            }
            Self::HeroesPlayedToday => {
                let todays_matches = Self::get_todays_matches(
                    &state.clickhouse_client,
                    &state.config,
                    &state.http_client,
                    steam_id,
                )
                .await
                .map_err(|_| VariableResolveError::FailedToFetchData("matches"))?;
                let heroes_played = todays_matches.iter().fold(HashMap::new(), |mut acc, m| {
                    *acc.entry(m.hero_id).or_insert(0) += 1;
                    acc
                });
                let heroes = fetch_heroes(&state.http_client)
                    .await
                    .map_err(|_| VariableResolveError::FailedToFetchData("heroes"))?;
                let heroes = heroes
                    .into_iter()
                    .map(|h| (h.id, h.name))
                    .collect::<HashMap<_, _>>();
                Ok(heroes_played
                    .into_iter()
                    .map(|(hero_id, count)| format!("{} ({})", heroes[&hero_id], count))
                    .join(", "))
            }
            Self::HeroLeaderboardPlace => {
                let hero_id = fetch_hero_id_from_name(
                    &state.http_client,
                    extra_args
                        .get("hero_name")
                        .ok_or(VariableResolveError::MissingArgument("hero name"))?,
                )
                .await
                .ok()
                .flatten()
                .ok_or(VariableResolveError::FailedToFetchData("hero id"))?;
                let leaderboard_entry = Self::get_leaderboard_entry(
                    &state.config,
                    &state.http_client,
                    steam_id,
                    region,
                    Some(hero_id),
                )
                .await
                .map_err(|_| VariableResolveError::PlayerNotFoundInLeaderboard)?;
                Ok(format!("#{}", leaderboard_entry.rank.unwrap_or_default()))
            }
            Self::LeaderboardPlace => {
                let leaderboard_entry = Self::get_leaderboard_entry(
                    &state.config,
                    &state.http_client,
                    steam_id,
                    region,
                    None,
                )
                .await
                .map_err(|_| VariableResolveError::PlayerNotFoundInLeaderboard)?;
                Ok(format!("#{}", leaderboard_entry.rank.unwrap_or_default()))
            }
            Self::LeaderboardRankBadgeLevel => Self::get_leaderboard_entry(
                &state.config,
                &state.http_client,
                steam_id,
                region,
                None,
            )
            .await
            .map_err(|_| VariableResolveError::PlayerNotFoundInLeaderboard)
            .map(|e| e.badge_level.unwrap_or_default().to_string()),
            Self::SteamAccountName => {
                Self::get_steam_account_name(&state.config, &state.http_client, steam_id).await
            }
            Self::HighestDeathCount => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                matches
                    .iter()
                    .map(|m| m.player_deaths)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player deaths"))
            }
            Self::HighestDenies => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                matches
                    .iter()
                    .map(|m| m.denies)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player denies"))
            }
            Self::HighestKillCount => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                matches
                    .iter()
                    .map(|m| m.player_kills)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player kills"))
            }
            Self::HighestLastHits => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                matches
                    .iter()
                    .map(|m| m.last_hits)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player last hits"))
            }
            Self::HighestNetWorth => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                matches
                    .iter()
                    .map(|m| m.net_worth)
                    .max()
                    .map(|m| m.to_string())
                    .ok_or(VariableResolveError::FailedToFetchData("player net worth"))
            }
            Self::HoursPlayed => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                let seconds_playtime: u32 = matches.iter().map(|m| m.match_duration_s).sum();
                Ok(format!("{}h", seconds_playtime / 3600))
            }
            Self::WinrateToday => {
                let matches = Self::get_todays_matches(
                    &state.clickhouse_client,
                    &state.config,
                    &state.http_client,
                    steam_id,
                )
                .await
                .map_err(|_| VariableResolveError::FailedToFetchData("matches"))?;
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
                let matches = Self::get_todays_matches(
                    &state.clickhouse_client,
                    &state.config,
                    &state.http_client,
                    steam_id,
                )
                .await
                .map_err(|_| VariableResolveError::FailedToFetchData("matches"))?;
                let (wins, losses) = matches.iter().fold((0, 0), |(wins, losses), m| {
                    if m.match_result as i8 == m.player_team {
                        (wins + 1, losses)
                    } else {
                        (wins, losses + 1)
                    }
                });
                Ok(format!("{wins}-{losses}"))
            }
            Self::MatchesToday => Ok(Self::get_todays_matches(
                &state.clickhouse_client,
                &state.config,
                &state.http_client,
                steam_id,
            )
            .await?
            .len()
            .to_string()),
            Self::WinsToday => Ok(Self::get_todays_matches(
                &state.clickhouse_client,
                &state.config,
                &state.http_client,
                steam_id,
            )
            .await?
            .iter()
            .filter(|m| m.match_result as i8 == m.player_team)
            .count()
            .to_string()),
            Self::LossesToday => Ok(Self::get_todays_matches(
                &state.clickhouse_client,
                &state.config,
                &state.http_client,
                steam_id,
            )
            .await?
            .iter()
            .filter(|m| m.match_result as i8 != m.player_team)
            .count()
            .to_string()),
            Self::MostPlayedHero => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
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
                fetch_hero_name_from_id(&state.http_client, most_played_hero)
                    .await
                    .ok()
                    .flatten()
                    .ok_or(VariableResolveError::FailedToFetchData("hero name"))
            }
            Self::MostPlayedHeroCount => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
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
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                let (kills, deaths) = matches.iter().fold((0, 0), |(kills, deaths), m| {
                    (kills + m.player_kills, deaths + m.player_deaths)
                });
                Ok(format!("{:.2}", kills as f32 / deaths.max(1) as f32))
            }
            Self::TotalKills => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                Ok(matches
                    .iter()
                    .map(|m| m.player_kills)
                    .sum::<u32>()
                    .to_string())
            }
            Self::TotalLosses => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                Ok(matches
                    .iter()
                    .filter(|m| m.match_result as i8 != m.player_team)
                    .count()
                    .to_string())
            }
            Self::TotalMatches => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                Ok(matches.len().to_string())
            }
            Self::TotalWinrate => {
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
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
                let matches =
                    fetch_match_history_from_clickhouse(&state.clickhouse_client, steam_id)
                        .await
                        .map_err(|_| VariableResolveError::FailedToFetchData("match history"))?;
                Ok(matches
                    .iter()
                    .filter(|m| m.match_result as i8 == m.player_team)
                    .count()
                    .to_string())
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
                    &state.http_client,
                    &state.clickhouse_client,
                    steam_id,
                    extra_args,
                )
                .await?;
                let seconds_playtime: u32 = hero_matches.iter().map(|m| m.match_duration_s).sum();
                Ok(format!("{}h", seconds_playtime / 3600))
            }
            Self::HeroKd => {
                let hero_matches = Self::get_hero_matches(
                    &state.http_client,
                    &state.clickhouse_client,
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
                    &state.http_client,
                    &state.clickhouse_client,
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
            Self::HeroMatches => Self::get_hero_matches(
                &state.http_client,
                &state.clickhouse_client,
                steam_id,
                extra_args,
            )
            .await
            .map(|m| m.len().to_string()),
            Self::HeroLosses => {
                let hero_matches = Self::get_hero_matches(
                    &state.http_client,
                    &state.clickhouse_client,
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
                    &state.http_client,
                    &state.clickhouse_client,
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
                    &state.http_client,
                    &state.clickhouse_client,
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
        }
    }

    async fn get_hero_matches(
        http_client: &reqwest::Client,
        ch_client: &clickhouse::Client,
        steam_id: u32,
        extra_args: &HashMap<String, String>,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        let hero_name = extra_args
            .get("hero_name")
            .ok_or(VariableResolveError::MissingArgument("hero name"))?;
        let hero_id = fetch_hero_id_from_name(http_client, hero_name)
            .await
            .ok()
            .flatten()
            .ok_or(VariableResolveError::FailedToFetchData("hero id"))?;
        fetch_match_history_from_clickhouse(ch_client, steam_id)
            .await
            .map(|m| m.into_iter().filter(|m| m.hero_id == hero_id).collect())
            .map_err(|_| VariableResolveError::FailedToFetchData("matches"))
    }

    async fn get_todays_matches(
        ch_client: &clickhouse::Client,
        config: &Config,
        http_client: &reqwest::Client,
        steam_id: u32,
    ) -> Result<PlayerMatchHistory, VariableResolveError> {
        let (steam_match_history, ch_match_history) = join(
            fetch_steam_match_history(steam_id, config, http_client),
            fetch_match_history_from_clickhouse(ch_client, steam_id),
        )
        .await;
        let (steam_match_history, ch_match_history) = (
            steam_match_history.unwrap_or_default(),
            ch_match_history.map_err(|_| VariableResolveError::FailedToFetchData("matches"))?,
        );
        let matches = chain!(ch_match_history, steam_match_history)
            .sorted_by_key(|e| e.match_id)
            .rev()
            .unique_by(|e| e.match_id)
            .collect_vec();
        let first_match = matches
            .first()
            .ok_or(VariableResolveError::FailedToFetchData("matches"))?;

        // If the first match is older than 8 hours ago, we can assume that the player has no matches today
        if first_match.start_time < (chrono::Utc::now() - Duration::hours(8)).timestamp() as u32 {
            return Ok(vec![]);
        }

        Ok(vec![first_match]
            .into_iter()
            .chain(
                matches
                    .iter()
                    .tuple_windows()
                    .take_while(|(c, l)| c.start_time - l.start_time <= 6 * 60 * 60)
                    .map(|(_, c)| c),
            )
            .cloned()
            .collect())
    }

    async fn get_steam_account_name(
        config: &Config,
        http_client: &reqwest::Client,
        steam_id: u32,
    ) -> Result<String, VariableResolveError> {
        let steamid64 = steam_id as u64 + 76561197960265728;
        let response = http_client
            .get(format!(
                "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?steamids={}",
                steamid64
            ))
            .header("x-webapi-key", config.steam_api_key.clone())
            .send()
            .await
            .map_err(|_| VariableResolveError::FailedToFetchSteamName)?
            .json::<serde_json::Value>()
            .await
            .map_err(|_| VariableResolveError::FailedToFetchSteamName)?;
        response
            .get("response")
            .and_then(|r| r.get("players"))
            .and_then(|p| p.as_array())
            .and_then(|p| p.first())
            .and_then(|p| p.get("personaname"))
            .and_then(|p| p.as_str())
            .map(|p| p.to_string())
            .ok_or(VariableResolveError::FailedToFetchSteamName)
    }

    async fn get_leaderboard_entry(
        config: &Config,
        http_client: &reqwest::Client,
        steam_id: u32,
        region: LeaderboardRegion,
        hero_id: Option<u32>,
    ) -> Result<LeaderboardEntry, VariableResolveError> {
        let (leaderboard, steam_name) = join(
            fetch_parse_leaderboard(config, http_client, region, hero_id),
            Self::get_steam_account_name(config, http_client, steam_id),
        )
        .await;
        let leaderboard =
            leaderboard.map_err(|_| VariableResolveError::FailedToFetchData("leaderboard"))?;
        let steam_name = steam_name?;
        leaderboard
            .entries
            .into_iter()
            .find(|entry| entry.account_name.clone().is_some_and(|n| n == steam_name))
            .ok_or(VariableResolveError::PlayerNotFoundInLeaderboard)
    }
}

#[derive(Debug, Clone, Deserialize)]
struct AssetsHero {
    id: u32,
    name: String,
}

#[cached(
    ty = "TimedCache<String, Vec<AssetsHero>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("") }"#
)]
async fn fetch_heroes(http_client: &reqwest::Client) -> reqwest::Result<Vec<AssetsHero>> {
    http_client
        .get("https://assets.deadlock-api.com/v2/heroes")
        .send()
        .await?
        .json()
        .await
}

#[derive(Debug, Clone, Deserialize)]
struct AssetsRanks {
    tier: u32,
    name: String,
    images: HashMap<String, String>,
}

#[cached(
    ty = "TimedCache<String, Vec<AssetsRanks>>",
    create = "{ TimedCache::with_lifespan(60 * 60) }",
    result = true,
    convert = r#"{ format!("") }"#
)]
async fn fetch_ranks(http_client: &reqwest::Client) -> reqwest::Result<Vec<AssetsRanks>> {
    http_client
        .get("https://assets.deadlock-api.com/v2/ranks")
        .send()
        .await?
        .json()
        .await
}

async fn fetch_hero_id_from_name(
    http_client: &reqwest::Client,
    hero_name: &str,
) -> reqwest::Result<Option<u32>> {
    fetch_heroes(http_client)
        .await
        .map(|h| h.iter().find(|h| h.name == hero_name).map(|h| h.id))
}

async fn fetch_hero_name_from_id(
    http_client: &reqwest::Client,
    hero_id: u32,
) -> reqwest::Result<Option<String>> {
    fetch_heroes(http_client)
        .await
        .map(|h| h.iter().find(|h| h.id == hero_id).map(|h| h.name.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_get_name() {
        assert_eq!(Variable::HeroHoursPlayed.get_name(), "hero_hours_played");
    }

    #[test]
    fn test_get_description() {
        assert_eq!(
            Variable::HeroHoursPlayed.get_description(),
            "Get the total hours played in all matches for a specific hero"
        );
    }

    #[test]
    fn test_get_from_name() {
        assert_eq!(
            Variable::from_str("hero_hours_played").unwrap(),
            Variable::HeroHoursPlayed
        );
    }
}
