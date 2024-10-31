import os
import time
from time import sleep

from clickhouse_pool import ChPool
from pydantic import BaseModel
from tqdm import tqdm

LEARNING_RATE = 0.6
UPDATE_INTERVAL = 60

CH_POOL = ChPool(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", 9000)),
    user=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DB", "default"),
)


class Match(BaseModel):
    match_id: int
    player_ids: list[int]
    match_mode: int
    match_score: int
    ranked_badge_level: int | None


def get_matches_starting_from(client, start_id: int = 0) -> list[Match]:
    query = f"""
    SELECT DISTINCT match_id, `players.account_id`, match_score, match_mode, ranked_badge_level
    FROM active_matches
    WHERE match_id > {start_id} AND start_time > '2024-10-11 06:00:00'
    ORDER BY match_id;
    """
    result = client.execute(query)
    return [
        Match(
            match_id=row[0],
            player_ids=row[1],
            match_score=row[2],
            match_mode=1 if row[3] == "Unranked" else 4,
            ranked_badge_level=row[4],
        )
        for row in result
    ]


def get_regression_starting_id(client) -> int:
    query = """
    SELECT max(match_id)
    FROM mmr_history;
    """
    return client.execute(query)[0][0]


def get_all_player_mmrs(client) -> dict[int, float]:
    query = f"""
    SELECT account_id, player_score
    FROM mmr_history
    ORDER BY account_id, match_id DESC
    LIMIT 1 BY account_id;
    """
    result = client.execute(query)
    return {row[0]: row[1] for row in result}


def set_player_mmr(
    client,
    player_mmr: dict[int, float],
    match_id: int,
    match_mode: int,
    ranked_badge_level: int | None,
):
    query = """
    INSERT INTO mmr_history (account_id, match_id, match_mode, player_score, ranked_badge_level)
    VALUES
    """

    client.execute(
        query,
        [
            {
                "account_id": account_id,
                "match_id": match_id,
                "match_mode": match_mode,
                "player_score": mmr,
                "ranked_badge_level": ranked_badge_level,
            }
            for account_id, mmr in player_mmr.items()
        ],
    )


def run_regression(match: Match, all_player_mmrs: dict[int, float]) -> dict[int, float]:
    players_mmr = {
        p_id: all_player_mmrs.get(p_id, match.match_score) for p_id in match.player_ids
    }
    error = match.match_score - sum(players_mmr.values()) / len(players_mmr)
    error_per_player = error / len(players_mmr)
    return {
        p_id: p_mmr + LEARNING_RATE * error_per_player
        for p_id, p_mmr in players_mmr.items()
    }


if __name__ == "__main__":
    while True:
        start = time.time()
        with CH_POOL.get_client() as client:
            starting_id = get_regression_starting_id(client)
            matches = get_matches_starting_from(client, starting_id)
            if len(matches) > 0:
                all_player_mmrs = get_all_player_mmrs(client)
                for match in tqdm(matches, desc="Processing matches"):
                    updated_mmrs = run_regression(match, all_player_mmrs)
                    all_player_mmrs.update(updated_mmrs)
                    set_player_mmr(
                        client,
                        updated_mmrs,
                        match.match_id,
                        match.match_mode,
                        match.ranked_badge_level,
                    )
        end = time.time()
        duration = end - start
        print(f"Processed {len(matches)} matches in {duration:.2f} seconds")
        if duration < UPDATE_INTERVAL:
            sleep(UPDATE_INTERVAL - (end - start))
