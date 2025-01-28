import asyncio
import logging
import os
import time

import more_itertools
from clickhouse_driver import Client
from clickhouse_pool import ChPool
from tqdm import tqdm
from utils import PlayerMatchHistoryEntry, call_steam_proxy
from valveprotos_py.citadel_gcmessages_client_pb2 import (
    CMsgClientToGCGetMatchHistory,
    CMsgClientToGCGetMatchHistoryResponse,
    k_EMsgClientToGCGetMatchHistory,
)

logging.basicConfig(level=logging.INFO)

LOGGER = logging.getLogger(__name__)

CH_POOL = ChPool(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", 9000)),
    user=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DB", "default"),
)


def get_accounts(client: Client) -> list[int]:
    query = f"""
    SELECT DISTINCT account_id
    FROM player
    WHERE account_id NOT IN (SELECT account_id FROM player_match_history)
    ORDER BY rand()

    UNION DISTINCT

    SELECT DISTINCT account_id
    FROM match_player
    INNER JOIN match_info mi USING (match_id)
    WHERE mi.start_time > now() - INTERVAL 1 WEEK
    ORDER BY rand()
    """
    accounts = [r[0] for r in client.execute(query)]
    LOGGER.info(
        f"Found {len(accounts)} accounts with missing match history or recent matches"
    )
    return accounts


async def update_account(account_id: int) -> tuple[int, list[PlayerMatchHistoryEntry]]:
    LOGGER.debug(f"Updating account {account_id}")
    try:
        msg = CMsgClientToGCGetMatchHistory()
        msg.account_id = account_id
        msg = await call_steam_proxy(
            k_EMsgClientToGCGetMatchHistory,
            msg,
            CMsgClientToGCGetMatchHistoryResponse,
            cooldown_time=10000,
            groups=["GetMatchHistory"],
        )
        if msg.result != msg.k_eResult_Success:
            raise Exception(f"Failed to get match history: {msg.result}")
        return account_id, [
            PlayerMatchHistoryEntry.from_msg(match) for match in msg.matches
        ]
    except Exception as e:
        LOGGER.warning(f"Failed to update account {account_id}: {e}")
        return account_id, []


async def main(account_ids: list[int]):
    match_histories = await asyncio.gather(
        *(update_account(a) for a in account_ids), return_exceptions=True
    )
    match_histories = [m for m in match_histories if not isinstance(m, Exception)]
    with CH_POOL.get_client() as client:
        LOGGER.info(
            f"Insert {sum(len(m) for _, m in match_histories)} match history entries"
        )
        client.execute(
            "INSERT INTO player_match_history (* EXCEPT(created_at)) VALUES",
            [
                {
                    "account_id": account_id,
                    "match_id": e.match_id,
                    "hero_id": e.hero_id,
                    "hero_level": e.hero_level,
                    "start_time": e.start_time,
                    "game_mode": e.game_mode,
                    "match_mode": e.match_mode,
                    "player_team": e.player_team,
                    "player_kills": e.player_kills,
                    "player_deaths": e.player_deaths,
                    "player_assists": e.player_assists,
                    "denies": e.denies,
                    "net_worth": e.net_worth,
                    "last_hits": e.last_hits,
                    "team_abandoned": e.team_abandoned,
                    "abandoned_time_s": e.abandoned_time_s,
                    "match_duration_s": e.match_duration_s,
                    "match_result": e.match_result,
                    "objectives_mask_team0": e.objectives_mask_team0,
                    "objectives_mask_team1": e.objectives_mask_team1,
                }
                for account_id, match_history in match_histories
                for e in match_history or []
            ],
        )


async def loop():
    chunk_size = int(os.environ.get("CHUNK_SIZE", "100"))
    num_accounts = int(os.environ.get("NUM_ACCOUNTS", "100")) * 0.9  # 90% of accounts
    while True:
        with CH_POOL.get_client() as client:
            account_ids = get_accounts(client)

        if not account_ids:
            LOGGER.info("No accounts to update")
            await asyncio.sleep(5 * chunk_size)
            return

        for chunk in tqdm(
            more_itertools.chunked(account_ids, chunk_size),
            desc="Batches",
            total=len(account_ids) // chunk_size,
        ):
            start = time.time()
            await main(chunk)
            end = time.time()
            duration = end - start

            # 1 request per minute per account
            sleep_time = 60 * chunk_size / num_accounts - duration
            LOGGER.info(
                f"Processed batch in {duration :.2f} seconds, sleeping for {sleep_time} seconds"
            )
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)


if __name__ == "__main__":
    asyncio.run(loop())
