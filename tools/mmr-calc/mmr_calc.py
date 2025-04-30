import logging
import os
import time
from time import sleep

from clickhouse_driver import Client
from pydantic import BaseModel
from tqdm import tqdm


logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)
LEARNING_RATE = 0.9
UPDATE_INTERVAL = 2 * 60
ERROR_ADJUSTMENT = 0.2

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


class MatchTeam(BaseModel):
    players: list[int]
    average_badge_team: int
    won: bool


class Match(BaseModel):
    match_id: int
    teams: list[MatchTeam]


def get_matches_starting_from(client, start_id: int = 28626948) -> list[Match]:
    query = f"""
    SELECT match_id,
           groupArrayIf(account_id, team = 'Team0') as team0_players,
           groupArrayIf(account_id, team = 'Team1') as team1_players,
           any(average_badge_team0)                 as avg_badge_team0,
           any(average_badge_team1)                 as avg_badge_team1,
           any(winning_team)                        as winning_team
    FROM match_player FINAL
        INNER JOIN match_info mi FINAL USING (match_id)
    WHERE match_outcome = 'TeamWin'
      AND match_mode IN ('Ranked', 'Unranked')
      AND game_mode = 'Normal'
      AND average_badge_team0 IS NOT NULL
      AND average_badge_team1 IS NOT NULL
      AND match_id > {start_id}
    GROUP BY match_id
    HAVING length(team0_players) = 6 AND length(team1_players) = 6
    ORDER BY match_id
    """
    result = client.execute(query)
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
        for row in result
    ]


def get_regression_starting_id(client) -> int:
    min_created_at_query = """
    SELECT start_time
    FROM mmr_history
    INNER JOIN match_info USING (match_id)
    WHERE match_outcome = 'TeamWin'
      AND match_mode IN ('Ranked', 'Unranked')
      AND game_mode = 'Normal'
      AND average_badge_team0 IS NOT NULL
      AND average_badge_team1 IS NOT NULL
    ORDER BY match_id DESC
    LIMIT 1
    """
    results = client.execute(min_created_at_query)
    if len(results) == 0:
        min_created_at = "2024-01-01 00:00:00"
    else:
        min_created_at = client.execute(min_created_at_query)[0][0].isoformat()

    query = f"""
    SELECT match_id
    FROM match_info
    WHERE match_outcome = 'TeamWin'
        AND match_mode IN ('Ranked', 'Unranked')
        AND game_mode = 'Normal'
        AND average_badge_team0 IS NOT NULL
        AND average_badge_team1 IS NOT NULL
        AND created_at > '{min_created_at}'
        AND match_id > 28626948
    ORDER BY created_at
    LIMIT 1
    """
    return client.execute(query)[0][0]


def get_all_player_mmrs(client, at_match_id: int) -> dict[int, float]:
    query = f"""
    SELECT account_id, player_score
    FROM mmr_history
    WHERE match_id <= {at_match_id}
    ORDER BY account_id, match_id DESC
    LIMIT 1 BY account_id;
    """
    result = client.execute(query)
    return {row[0]: row[1] for row in result}


def set_player_mmr(client, data: list[tuple[int, dict[int, float]]]):
    client.execute(
        """
        INSERT INTO mmr_history (account_id, match_id, player_score)
        VALUES
        """,
        [
            {"account_id": account_id, "match_id": match_id, "player_score": mmr}
            for match_id, player_mmr in data
            for account_id, mmr in player_mmr.items()
        ],
    )


def clamp_to_rank(mmr: float) -> float:
    min_rank = min(RANKS)
    max_rank = max(RANKS)
    return max(min_rank, min(max_rank, mmr))


def run_regression(
    match: Match, all_player_mmrs: dict[int, float]
) -> (dict[int, float], float):
    updates = {}
    sum_errors = 0
    for team in match.teams:
        # Get the average MMR of the team
        avg_team_rank_true = RANKS.index(team.average_badge_team)

        # Get the predicted average MMR of the players in the team
        team_ranks = {
            p_id: all_player_mmrs.get(p_id, avg_team_rank_true) for p_id in team.players
        }
        avg_team_rank_pred = sum(team_ranks.values()) / len(team_ranks)

        # Calculate the error and update the MMR of each player in the team
        error = (avg_team_rank_true - avg_team_rank_pred) / len(team_ranks)

        if team.won:
            error += ERROR_ADJUSTMENT
        else:
            error -= ERROR_ADJUSTMENT

        # gamma = max(2, abs(avg_team_rank_true - 6)) / 2
        # lr = LEARNING_RATE / gamma
        updates.update(
            {p_id: p_mmr + LEARNING_RATE * error for p_id, p_mmr in team_ranks.items()}
        )

        LOGGER.info(
            f"Match {match.match_id}: Team {avg_team_rank_true} - "
            f"Average MMR {avg_team_rank_pred} - Error {error}"
        )
        sum_errors += abs(error)
    return updates, sum_errors


def main(client):
    starting_id = get_regression_starting_id(client)
    matches = get_matches_starting_from(client, starting_id)
    if len(matches) <= 0:
        return

    all_player_mmrs = get_all_player_mmrs(client, starting_id)
    updates = []
    errors = []
    for i, match in tqdm(enumerate(matches), desc="Processing matches"):
        updated_mmrs, error = run_regression(match, all_player_mmrs)
        errors.append(error)
        all_player_mmrs.update(updated_mmrs)
        updates.append((match.match_id, updated_mmrs))
        if i % 10000 == 0:
            set_player_mmr(client, updates)
            updates = []
    set_player_mmr(client, updates)
    errors = errors[-1000:]
    LOGGER.info(
        f"Processed {len(matches)} matches, Average error: {sum(errors) / max(1, len(errors))}"
    )


if __name__ == "__main__":
    with ch_client as client:
        while True:
            try:
                start = time.time()
                main(client)
                end = time.time()
                duration = end - start
                if duration < UPDATE_INTERVAL:
                    sleep(UPDATE_INTERVAL - (end - start))
            except:
                LOGGER.exception(
                    "Error while running regression, retrying in 10 seconds"
                )
                sleep(10)
