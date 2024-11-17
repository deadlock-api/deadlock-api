import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from time import sleep

from clickhouse_driver import Client
from clickhouse_pool import ChPool
from tqdm import tqdm
from utils import PlayerCard, call_steam_proxy
from valveprotos_py.citadel_gcmessages_client_pb2 import (
    CMsgCitadelProfileCard,
    CMsgClientToGCGetProfileCard,
    k_EMsgClientToGCGetProfileCard,
)

UPDATE_INTERVAL = 10

CH_POOL = ChPool(
    host=os.getenv("CLICKHOUSE_HOST", "localhost"),
    port=int(os.getenv("CLICKHOUSE_PORT", 9000)),
    user=os.getenv("CLICKHOUSE_USER", "default"),
    password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    database=os.getenv("CLICKHOUSE_DB", "default"),
)


def get_accounts(client: Client, empty_cards: set) -> list[int]:
    query = f"""
    SELECT DISTINCT account_id
    FROM player
    WHERE account_id NOT IN (SELECT account_id FROM player_card)
    AND account_id NOT IN ({','.join(str(a) for a in empty_cards)})
    LIMIT 500;
    """
    accounts = [r[0] for r in client.execute(query)]
    print(f"Found {len(accounts)} new accounts")
    if len(accounts) < 500:
        query = """
        WITH last_cards AS (SELECT *
                            FROM player_card
                            ORDER BY account_id, created_at DESC
                            LIMIT 1 BY account_id)
        SELECT account_id
        FROM last_cards
        ORDER BY created_at
        LIMIT %(limit)s;
        """
        accounts += [
            r[0] for r in client.execute(query, {"limit": 500 - len(accounts)})
        ]
    return accounts


def update_account(account_id: int) -> (int, PlayerCard):
    try:
        msg = CMsgClientToGCGetProfileCard()
        msg.account_id = account_id
        msg = call_steam_proxy(
            k_EMsgClientToGCGetProfileCard,
            msg,
            CMsgCitadelProfileCard,
            cooldown_time=10,
            groups=["LowRateLimitApis"],
        )
        return account_id, PlayerCard.from_msg(msg)
    except Exception as e:
        print(f"Failed to update account {account_id}: {e}")
        return account_id, None


def main(empty_cards: set[int]):
    start = time.time()
    with CH_POOL.get_client() as client:
        account_ids = get_accounts(client, empty_cards)

    with ThreadPoolExecutor(max_workers=40) as pool:
        futures = [pool.submit(update_account, a) for a in account_ids]
        with CH_POOL.get_client() as client:
            try:
                player_cards = [
                    p.result()
                    for p in tqdm(as_completed(futures, timeout=10), total=len(futures))
                ]
            except TimeoutError:
                print("TimeoutError")
                return
            for account_id, card in player_cards:
                if card is None:
                    empty_cards.add(account_id)
            client.execute(
                "INSERT INTO player_card (* EXCEPT(created_at)) VALUES",
                [
                    {
                        "account_id": account_id,
                        "ranked_badge_level": card.ranked_badge_level,
                        "slots_slots_id": [s.slot_id for s in card.slots],
                        "slots_hero_id": [s.hero.hero_id for s in card.slots],
                        "slots_hero_kills": [s.hero.hero_kills for s in card.slots],
                        "slots_hero_wins": [s.hero.hero_wins for s in card.slots],
                        "slots_stat_id": [s.stat.stat_id for s in card.slots],
                        "slots_stat_score": [s.stat.stat_score for s in card.slots],
                    }
                    for account_id, card in player_cards
                    if card is not None
                ],
            )
    end = time.time()
    duration = end - start
    print(f"Processed {len(account_ids)} accounts in {duration:.2f} seconds")
    if duration < UPDATE_INTERVAL:
        sleep(UPDATE_INTERVAL - (end - start))


if __name__ == "__main__":
    empty_cards = {0}
    i = 0
    while True:
        i += 1
        if i % 1000 == 0:
            empty_cards = {0}
        main(empty_cards)
