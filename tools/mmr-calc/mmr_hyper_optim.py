import logging
import math
import os
import pickle
from functools import partial

import optuna
from clickhouse_driver import Client
from optuna import Trial
from optuna.study import StudyDirection
from pydantic import BaseModel
from tqdm import tqdm


logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)
ch_client = Client(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", 9000)),
    user=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DB", "default"),
)

RANKS = [
    0,
    11,
    12,
    13,
    14,
    15,
    16,
    21,
    22,
    23,
    24,
    25,
    26,
    31,
    32,
    33,
    34,
    35,
    36,
    41,
    42,
    43,
    44,
    45,
    46,
    51,
    52,
    53,
    54,
    55,
    56,
    61,
    62,
    63,
    64,
    65,
    66,
    71,
    72,
    73,
    74,
    75,
    76,
    81,
    82,
    83,
    84,
    85,
    86,
    91,
    92,
    93,
    94,
    95,
    96,
    101,
    102,
    103,
    104,
    105,
    106,
    111,
    112,
    113,
    114,
    115,
    116,
]
RANK_TO_INDEX = {rank: idx for idx, rank in enumerate(RANKS)}


class MatchTeam(BaseModel):
    players: list[int]
    average_badge_team: int
    won: bool


class Match(BaseModel):
    match_id: int
    teams: list[MatchTeam]


def get_matches() -> list[Match]:
    query = f"""
    SELECT match_id,
           groupArrayIf(account_id, team = 'Team0') as team0_players,
           groupArrayIf(account_id, team = 'Team1') as team1_players,
           any(average_badge_team0)                 as avg_badge_team0,
           any(average_badge_team1)                 as avg_badge_team1,
           any(winning_team)                        as winning_team
    FROM match_player FINAL
        INNER JOIN match_info mi FINAL USING (match_id)
    WHERE match_mode IN ('Ranked', 'Unranked')
      AND average_badge_team0 IS NOT NULL
      AND average_badge_team1 IS NOT NULL
      AND match_id > 28626948
    GROUP BY match_id
    HAVING length(team0_players) = 6 AND length(team1_players) = 6
    ORDER BY match_id
    """
    with ch_client as client:
        result = client.execute_iter(query)
        return [
            Match(
                match_id=row[0],
                teams=[
                    MatchTeam(
                        players=row[1], average_badge_team=row[3], won=row[5] == "Team0"
                    ),
                    MatchTeam(
                        players=row[2], average_badge_team=row[4], won=row[5] == "Team1"
                    ),
                ],
            )
            for row in tqdm(result)
        ]


def objective(trial: Trial, matches) -> float:
    learning_rate = trial.suggest_float("learning_rate", 0.1, 5.0)
    LOGGER.info(f"Testing parameters: {learning_rate=}")

    all_player_mmrs = {}
    total_error = 0
    for match in tqdm(matches, desc="Processing matches"):
        for team in match.teams:
            avg_team_rank_true = RANK_TO_INDEX[team.average_badge_team]

            team_ranks = {}
            avg_team_rank_pred = 0
            for p_id in team.players:
                p_mmr = all_player_mmrs.get(p_id, avg_team_rank_true)
                team_ranks[p_id] = p_mmr
                avg_team_rank_pred += p_mmr

            avg_team_rank_pred /= 6.0
            team_error = avg_team_rank_true - avg_team_rank_pred
            player_error = team_error / 6.0
            mmr_update = learning_rate * player_error

            for p_id, p_mmr in team_ranks.items():
                all_player_mmrs[p_id] = p_mmr + mmr_update

            total_error += player_error**2

    return math.sqrt(total_error / len(matches))


if __name__ == "__main__":
    if os.path.exists("matches.cache"):
        with open("matches.cache", "rb") as f:
            matches = pickle.load(f)
    else:
        matches = get_matches()
        with open("matches.cache", "wb") as f:
            pickle.dump(matches, f)
    study = optuna.create_study(
        study_name="mmr-params",
        direction=StudyDirection.MINIMIZE,
        storage="sqlite:///study.db",
        load_if_exists=True,
    )
    study.optimize(
        partial(objective, matches=matches),
        show_progress_bar=True,
        n_trials=100,
    )
    for trial in study.best_trials:
        print(trial.params, trial.values)
