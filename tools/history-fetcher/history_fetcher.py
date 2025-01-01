import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import sleep

import more_itertools
from clickhouse_driver import Client
from clickhouse_pool import ChPool
from ratemate import RateLimit
from tqdm import tqdm
from utils import PlayerMatchHistoryEntry, call_steam_proxy
from valveprotos_py.citadel_gcmessages_client_pb2 import (
    CMsgClientToGCGetMatchHistory,
    CMsgClientToGCGetMatchHistoryResponse,
    k_EMsgClientToGCGetMatchHistory,
)

logging.basicConfig(level=logging.DEBUG)

LOGGER = logging.getLogger(__name__)

CH_POOL = ChPool(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", 9000)),
    user=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DB", "default"),
)


def get_accounts(client: Client, empty_match_histories: set) -> list[int]:
    query = f"""
    SELECT DISTINCT account_id
    FROM player
    WHERE account_id NOT IN (SELECT account_id FROM player_match_history)
    AND account_id NOT IN ({','.join(str(a) for a in empty_match_histories)})

    UNION DISTINCT

    SELECT DISTINCT account_id
    FROM match_player
    INNER JOIN match_info mi USING (match_id)
    WHERE mi.start_time > now() - INTERVAL 1 WEEK
    """
    accounts = [r[0] for r in client.execute(query)]
    LOGGER.info(
        f"Found {len(accounts)} accounts with missing match history or recent matches"
    )
    return accounts


def update_account(account_id: int) -> tuple[int, list[PlayerMatchHistoryEntry]]:
    LOGGER.debug(f"Updating account {account_id}")
    try:
        msg = CMsgClientToGCGetMatchHistory()
        msg.account_id = account_id
        msg = call_steam_proxy(
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


def main(rate_limit: RateLimit, empty_histories: set[int]):
    start = time.time()
    with CH_POOL.get_client() as client:
        account_ids = get_accounts(client, empty_histories)

    if not account_ids:
        LOGGER.info("No accounts to update")
        sleep(5 * 60)
        return

    with ThreadPoolExecutor(
        max_workers=int(os.environ.get("HISTORY_WORKERS", 10))
    ) as pool:
        chunks = more_itertools.chunked(account_ids, 1000)
        for chunk in chunks:
            futures = []
            for a in chunk:
                rate_limit.wait()
                futures.append(pool.submit(update_account, a))
            with CH_POOL.get_client() as client:
                try:
                    match_histories = [
                        p.result()
                        for p in tqdm(
                            as_completed(futures, timeout=60), total=len(futures)
                        )
                    ]
                except TimeoutError:
                    LOGGER.warning("TimeoutError")
                    return
                for account_id, match_history in match_histories:
                    if match_history is None or not match_history:
                        empty_histories.add(account_id)
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
    end = time.time()
    duration = end - start
    LOGGER.info(f"Processed {len(account_ids)} accounts in {duration:.2f} seconds")


if __name__ == "__main__":
    # save 10% of accounts for on demand requests
    accounts = int(os.environ.get("NUM_ACCOUNTS", 50)) * 0.9
    rate_limit = RateLimit(
        max_count=accounts,
        per=60 / float(os.environ.get("HISTORY_REQ_PER_MIN_PER_ACCOUNT", 60)),
        greedy=False,
    )
    empty_histories = {0}
    i = 0
    while True:
        i += 1
        if i % 1000 == 0:
            empty_histories = {0}
        main(rate_limit, empty_histories)
