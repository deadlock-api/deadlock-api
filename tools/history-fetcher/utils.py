import logging
import os
from base64 import b64decode, b64encode
from typing import TypeVar

import httpx
from google.protobuf.message import Message
from pydantic import BaseModel, ConfigDict
from valveprotos_py.citadel_gcmessages_client_pb2 import (
    CMsgClientToGCGetMatchHistoryResponse,
)

LOGGER = logging.getLogger(__name__)

PROXY_URL = os.environ.get("PROXY_URL")
PROXY_API_TOKEN = os.environ.get("PROXY_API_TOKEN")

http_client = httpx.AsyncClient(http2=True)

R = TypeVar("R", bound=Message)


async def call_steam_proxy(
    msg_type: int,
    msg: Message,
    response_type: type[R],
    cooldown_time: int,
    groups: list[str],
) -> R:
    MAX_RETRIES = 3
    for i in range(MAX_RETRIES):
        try:
            data = await call_steam_proxy_raw(msg_type, msg, cooldown_time, groups)
            return response_type.FromString(data)
        except Exception as e:
            LOGGER.warning(f"Failed to call steam proxy: {e}")
            if i == MAX_RETRIES - 1:
                raise
    raise RuntimeError(
        "steam proxy retry raise invariant broken: - should never hit this point"
    )


async def call_steam_proxy_raw(
    msg_type: int, msg: Message, cooldown_time: int, groups: list[str]
) -> bytes:
    assert PROXY_URL, "PROXY_URL must be defined"
    assert PROXY_API_TOKEN, "PROXY_API_TOKEN must be defined"

    msg_data = b64encode(msg.SerializeToString()).decode("utf-8")
    body = {
        "message_kind": msg_type,
        "job_cooldown_millis": cooldown_time,
        "bot_in_all_groups": groups,
        "data": msg_data,
    }
    response = await http_client.post(
        PROXY_URL,
        json=body,
        headers={"Authorization": f"Bearer {PROXY_API_TOKEN}"},
        timeout=10,
    )
    response.raise_for_status()
    data = response.json()["data"]
    return b64decode(data)


class PlayerMatchHistoryEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    match_id: int
    hero_id: int
    hero_level: int
    start_time: int
    game_mode: int
    match_mode: int
    player_team: int
    player_kills: int
    player_deaths: int
    player_assists: int
    denies: int
    net_worth: int
    last_hits: int
    team_abandoned: bool
    abandoned_time_s: int
    match_duration_s: int
    match_result: int
    objectives_mask_team0: int
    objectives_mask_team1: int

    @classmethod
    def from_msg(
        cls, msg: CMsgClientToGCGetMatchHistoryResponse.Match
    ) -> "PlayerMatchHistoryEntry":
        return cls(
            abandoned_time_s=msg.abandoned_time_s,
            denies=msg.denies,
            game_mode=msg.game_mode,
            hero_id=msg.hero_id,
            hero_level=msg.hero_level,
            last_hits=msg.last_hits,
            match_duration_s=msg.match_duration_s,
            match_id=msg.match_id,
            match_mode=msg.match_mode,
            match_result=msg.match_result,
            net_worth=msg.net_worth,
            objectives_mask_team0=msg.objectives_mask_team0,
            objectives_mask_team1=msg.objectives_mask_team1,
            player_assists=msg.player_assists,
            player_deaths=msg.player_deaths,
            player_kills=msg.player_kills,
            player_team=msg.player_team,
            start_time=msg.start_time,
            team_abandoned=msg.team_abandoned,
        )
