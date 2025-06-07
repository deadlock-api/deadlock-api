use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};

#[derive(
    Serialize_repr, Deserialize_repr, Copy, Clone, Debug, Default, PartialEq, Eq, clap::ValueEnum,
)]
#[repr(u8)]
pub enum AlgorithmType {
    #[default]
    Basic = 0,
}

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Deserialize, Serialize)]
pub(crate) struct PlayerMMR {
    pub(crate) algorithm: AlgorithmType,
    pub(crate) match_id: u64,
    pub(crate) account_id: u32,
    pub(crate) player_score: f32,
}

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Deserialize, Serialize)]
pub(crate) struct PlayerHeroMMR {
    pub(crate) algorithm: AlgorithmType,
    pub(crate) match_id: u64,
    pub(crate) account_id: u32,
    pub(crate) hero_id: u8,
    pub(crate) player_score: f32,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[allow(clippy::upper_case_acronyms)]
pub(crate) enum MMR {
    Player(PlayerMMR),
    Hero(PlayerHeroMMR),
}

impl From<PlayerMMR> for MMR {
    fn from(value: PlayerMMR) -> Self {
        Self::Player(value)
    }
}

impl From<PlayerHeroMMR> for MMR {
    fn from(value: PlayerHeroMMR) -> Self {
        Self::Hero(value)
    }
}

impl MMR {
    pub fn player_score(&self) -> f32 {
        match self {
            Self::Player(p) => p.player_score,
            Self::Hero(p) => p.player_score,
        }
    }
    pub fn player_score_mut(&mut self) -> &mut f32 {
        match self {
            Self::Player(p) => &mut p.player_score,
            Self::Hero(p) => &mut p.player_score,
        }
    }
}

#[derive(clickhouse::Row, Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub(crate) struct CHMatch {
    match_id: u64,
    team0_players: Vec<(u32, u32)>,
    team1_players: Vec<(u32, u32)>,
    avg_badge_team0: u32,
    avg_badge_team1: u32,
    winning_team: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub struct Match {
    pub match_id: u64,
    pub teams: [MatchTeam; 2],
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub struct MatchTeam {
    pub players: Vec<Player>,
    pub average_badge_team: u32,
    pub won: bool,
}

impl From<CHMatch> for Match {
    fn from(value: CHMatch) -> Self {
        Self {
            match_id: value.match_id,
            teams: [
                MatchTeam {
                    players: value.team0_players.iter().map(|p| p.into()).collect(),
                    average_badge_team: value.avg_badge_team0,
                    won: value.winning_team == 0,
                },
                MatchTeam {
                    players: value.team1_players.iter().map(|p| p.into()).collect(),
                    average_badge_team: value.avg_badge_team1,
                    won: value.winning_team == 1,
                },
            ],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize)]
pub struct Player {
    pub account_id: u32,
    pub hero_id: u32,
}

impl From<&(u32, u32)> for Player {
    fn from(value: &(u32, u32)) -> Self {
        Self {
            account_id: value.0,
            hero_id: value.1,
        }
    }
}
