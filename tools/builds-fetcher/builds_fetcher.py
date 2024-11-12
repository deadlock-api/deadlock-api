import os
import time
from datetime import datetime
from time import sleep

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

UPDATE_INTERVAL = 30
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASS = os.environ.get("POSTGRES_PASS")


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


def upsert_builds(results: list[CMsgClientToGCFindHeroBuildsResponse.HeroBuildResult]):
    with POSTGRES_CONN.cursor() as cursor:
        execute_values(
            cursor,
            """
            INSERT INTO hero_builds(hero, build_id, version, author_id, favorites, ignores, reports, language, updated_at, data)
            VALUES %s
            ON CONFLICT(hero, build_id, version)
            DO UPDATE
            SET author_id = EXCLUDED.author_id, favorites = EXCLUDED.favorites, ignores = EXCLUDED.ignores, reports = EXCLUDED.reports, language = EXCLUDED.language, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data
            """,
            [
                (
                    result.hero_build.hero_id,
                    result.hero_build.hero_build_id,
                    result.hero_build.version,
                    result.hero_build.author_account_id,
                    result.num_favorites,
                    result.num_ignores,
                    result.num_reports,
                    result.hero_build.language,
                    datetime.fromtimestamp(result.hero_build.last_updated_timestamp),
                    MessageToJson(result, preserving_proto_field_name=True),
                )
                for result in results
            ],
        )
    POSTGRES_CONN.commit()


def update_hero(hero: int):
    print(f"Updating hero {hero}")
    start = time.time()

    msg = CMsgClientToGCFindHeroBuilds()
    msg.hero_id = hero
    msg = call_steam_proxy(
        k_EMsgClientToGCFindHeroBuilds, msg, CMsgClientToGCFindHeroBuildsResponse
    )
    if msg.response != CMsgClientToGCFindHeroBuildsResponse.k_eSuccess:
        print(f"Failed to fetch hero {hero} builds")
        return

    upsert_builds(msg.results)

    end = time.time()
    duration = end - start
    if duration < UPDATE_INTERVAL:
        sleep(UPDATE_INTERVAL - (end - start))


if __name__ == "__main__":
    while True:
        try:
            heroes = fetch_all_hero_ids()
            for hero in heroes:
                update_hero(hero)
        except Exception as e:
            print(e)
            POSTGRES_CONN = create_pg_conn()
