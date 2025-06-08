use serde::{Deserialize, Serialize};

#[derive(clickhouse::Row, Debug, Copy, Clone, PartialEq, Deserialize, Serialize)]
pub(crate) struct PlayerMMR {
    pub(crate) match_id: u64,
    pub(crate) account_id: u32,
    pub(crate) hero_id: Option<u32>,
    pub(crate) player_score: f64,
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
