use clickhouse::Row;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use valveprotos::deadlock::c_msg_match_meta_data_contents::{MatchInfo, Players};

use crate::models::enums::Team;

#[derive(Serialize_repr, Deserialize_repr, Copy, Clone, PartialEq, Debug, Default)]
#[repr(i8)]
pub(crate) enum Source {
    #[default]
    HistoryFetcher = 1,
    MatchPlayer = 2,
}

#[derive(Debug, Clone, Serialize, Deserialize, Row)]
pub(crate) struct PlayerMatchHistoryEntry {
    pub account_id: u32,
    pub match_id: u64,
    pub hero_id: u32,
    pub hero_level: u32,
    pub start_time: u32,
    pub game_mode: i8,
    pub match_mode: i8,
    pub player_team: i8,
    pub player_kills: u32,
    pub player_deaths: u32,
    pub player_assists: u32,
    pub denies: u32,
    pub net_worth: u32,
    pub last_hits: u32,
    pub team_abandoned: Option<bool>,
    pub abandoned_time_s: Option<u32>,
    pub match_duration_s: u32,
    pub match_result: u32,
    pub objectives_mask_team0: u32,
    pub objectives_mask_team1: u32,
    pub brawl_score_team0: Option<u32>,
    pub brawl_score_team1: Option<u32>,
    pub brawl_avg_round_time_s: Option<u32>,
    pub source: Source,
    pub username: Option<String>,
}

impl PlayerMatchHistoryEntry {
    pub(crate) fn from_info_and_player(match_info: &MatchInfo, player: &Players) -> Option<Self> {
        Some(Self {
            account_id: player.account_id?,
            match_id: match_info.match_id?,
            hero_id: player.hero_id?,
            hero_level: player.level?,
            start_time: match_info.start_time?,
            game_mode: match_info.game_mode? as i8,
            match_mode: match_info.match_mode? as i8,
            player_team: player.team? as i8,
            player_kills: player.kills?,
            player_deaths: player.deaths?,
            player_assists: player.assists?,
            denies: player.denies?,
            net_worth: player.net_worth?,
            last_hits: player.last_hits?,
            team_abandoned: Some(false), // Not available by Valve
            abandoned_time_s: player.abandon_match_time_s,
            match_duration_s: match_info.duration_s?,
            match_result: match_info.winning_team? as u32,
            objectives_mask_team0: match_info.objectives_mask_team0? as u32,
            objectives_mask_team1: match_info.objectives_mask_team1? as u32,
            brawl_score_team0: (!match_info.street_brawl_rounds.is_empty()).then(|| {
                match_info
                    .street_brawl_rounds
                    .iter()
                    .filter_map(|r| r.winning_team)
                    .filter(|&r| r as u8 == Team::Team0 as u8)
                    .count() as u32
            }),
            brawl_score_team1: (!match_info.street_brawl_rounds.is_empty()).then(|| {
                match_info
                    .street_brawl_rounds
                    .iter()
                    .filter_map(|r| r.winning_team)
                    .filter(|&r| r as u8 == Team::Team1 as u8)
                    .count() as u32
            }),
            brawl_avg_round_time_s: (!match_info.street_brawl_rounds.is_empty()).then(|| {
                match_info
                    .street_brawl_rounds
                    .iter()
                    .filter_map(|&r| r.round_duration_s)
                    .sum::<u32>()
                    / match_info.street_brawl_rounds.len() as u32
            }),
            source: Source::MatchPlayer,
            username: Some("ingest-worker".to_string()),
        })
    }
}
