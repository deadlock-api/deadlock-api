import itertools
import logging
import os
import random
import string
import time
from collections.abc import Sequence
from datetime import datetime
from time import sleep

import more_itertools
import psycopg2
import requests
from google.protobuf.json_format import MessageToJson
from psycopg2.extras import execute_values
from utils import call_steam_proxy
from valveprotos_py.citadel_gcmessages_client_pb2 import (
    CMsgClientToGCFindHeroBuilds,
    CMsgClientToGCFindHeroBuildsResponse,
    k_EMsgClientToGCFindHeroBuilds,
)

logging.basicConfig(level=logging.INFO)
logging.getLogger("urllib3").setLevel(logging.WARNING)

LOGGER = logging.getLogger(__name__)
UPDATE_INTERVAL = int(os.environ.get("UPDATE_INTERVAL", 3))
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASS = os.environ.get("POSTGRES_PASS")

ALL_LANGS = [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    21,
    22,
    24,
    25,
    26,
    27,
    255,
]


def create_pg_conn():
    return psycopg2.connect(
        host=POSTGRES_HOST, port=5432, user=POSTGRES_USER, password=POSTGRES_PASS
    )


POSTGRES_CONN = create_pg_conn()


def fetch_all_hero_ids() -> list[int]:
    return [
        h["id"]
        for h in requests.get(
            "https://assets.deadlock-api.com/v2/heroes?only_active=true"
        ).json()
    ]


def upsert_builds(
    results: Sequence[CMsgClientToGCFindHeroBuildsResponse.HeroBuildResult],
):
    with POSTGRES_CONN.cursor() as cursor:
        execute_values(
            cursor,
            """
            INSERT INTO hero_builds(hero, build_id, version, author_id, weekly_favorites, favorites, ignores, reports, rollup_category, language, updated_at, data)
            VALUES %s
            ON CONFLICT(hero, build_id, version)
            DO UPDATE
            SET author_id = EXCLUDED.author_id, weekly_favorites = EXCLUDED.weekly_favorites, rollup_category = EXCLUDED.rollup_category, favorites = EXCLUDED.favorites, ignores = EXCLUDED.ignores, reports = EXCLUDED.reports, language = EXCLUDED.language, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data
            """,
            [
                (
                    result.hero_build.hero_id,
                    result.hero_build.hero_build_id,
                    result.hero_build.version,
                    result.hero_build.author_account_id,
                    result.num_weekly_favorites,
                    result.num_favorites,
                    result.num_ignores,
                    result.num_reports,
                    result.rollup_category,
                    result.hero_build.language,
                    datetime.fromtimestamp(result.hero_build.last_updated_timestamp),
                    MessageToJson(result, preserving_proto_field_name=True),
                )
                for result in results
            ],
        )
    POSTGRES_CONN.commit()


def fetch_builds(hero: int, langs: (int, int), search: str):
    LOGGER.debug(
        f"Updating builds for hero {hero} in langs {langs} with search {search}"
    )
    start = time.time()

    msg = CMsgClientToGCFindHeroBuilds()
    msg.search_text = search
    msg.hero_id = hero
    for lang in langs:
        msg.language.append(lang)
    msg = call_steam_proxy(
        k_EMsgClientToGCFindHeroBuilds,
        msg,
        CMsgClientToGCFindHeroBuildsResponse,
        cooldown_time=10 * 60 * 1000,  # 10 minutes
    )
    if msg.response != CMsgClientToGCFindHeroBuildsResponse.k_eSuccess:
        LOGGER.error(f"Failed to fetch hero {hero} builds")
        return

    LOGGER.info(
        f"Found {len(msg.results)} builds for hero {hero} in langs {langs} with search {search}"
    )
    upsert_builds(msg.results)

    end = time.time()
    duration = end - start
    if duration < UPDATE_INTERVAL:
        LOGGER.debug(f"Sleeping for {UPDATE_INTERVAL - duration} seconds")
        sleep(UPDATE_INTERVAL - (end - start))


if __name__ == "__main__":
    LOGGER.info("Starting hero builds fetcher")
    while True:
        LOGGER.info("Updating hero builds")
        try:
            heroes = fetch_all_hero_ids()
            random.shuffle(heroes)
        except requests.exceptions.HTTPError:
            LOGGER.exception("Failed to fetch heroes")
            sleep(10)
            continue
        for hero, langs, search in itertools.product(
            heroes,
            more_itertools.chunked(ALL_LANGS, 2),
            itertools.product(string.ascii_lowercase, repeat=2),
        ):
            try:
                fetch_builds(hero, langs, "".join(search))
            except requests.exceptions.HTTPError:
                LOGGER.exception(
                    f"Failed to fetch builds for hero {hero} in langs {langs} with search {search} builds"
                )
                sleep(10)
