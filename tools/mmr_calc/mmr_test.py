import os

import more_itertools
from clickhouse_pool import ChPool
from pydantic import BaseModel
from tqdm import tqdm

DEFAULT_PLAYER_MMR = 1500
LEARNING_RATE = 0.6
UPDATE_INTERVAL = 60

CH_POOL = ChPool(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", 9000)),
    user=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DB", "default"),
)


class PlayerMMR(BaseModel):
    account_id: int
    match_id: int
    player_score: float


def get_all_player_mmrs(client) -> list[PlayerMMR]:
    query = f"""
    SELECT account_id, match_id, player_score
    FROM mmr_history
    ORDER BY account_id, match_id DESC
    LIMIT 1 BY account_id;
    """
    result = client.execute(query)
    return [
        PlayerMMR(account_id=row[0], match_id=row[1], player_score=row[2])
        for row in result
    ]


def get_match_scores(client, match_ids: list[int]) -> dict[int, int]:
    query = f"""
    SELECT match_id, match_score
    FROM active_matches
    WHERE match_id IN %(match_ids)s
    """
    return {r[0]: r[1] for r in client.execute(query, {"match_ids": match_ids})}


if __name__ == "__main__":
    ae = 0
    n = 0
    with CH_POOL.get_client() as client:
        all_player_mmrs = get_all_player_mmrs(client)
        match_ids = [mmr.match_id for mmr in all_player_mmrs]
        batch_size = 10_000
        pbar = tqdm(
            more_itertools.chunked(match_ids, batch_size),
            total=len(match_ids) // batch_size,
        )
        for batch in pbar:
            match_scores = get_match_scores(client, batch)
            for match_id in batch:
                match_score = match_scores.get(match_id)
                if match_score is None:
                    continue
                all_players = [p for p in all_player_mmrs if p.match_id == match_id]
                avg_player_mmr = sum(p.player_score for p in all_players) / len(
                    all_players
                )
                t_ae = abs(float(avg_player_mmr) - float(match_score))
                tqdm.write(f"P: {avg_player_mmr}, A: {match_score}, AE: {t_ae}")
                ae += t_ae
                n += 1
                pbar.set_description(f"MAE: {ae / n}")
