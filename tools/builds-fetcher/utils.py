import logging
import os
from base64 import b64decode, b64encode
from typing import TypeVar

import requests
from google.protobuf.message import Message

LOGGER = logging.getLogger(__name__)

PROXY_URL = os.environ.get("PROXY_URL")
PROXY_API_TOKEN = os.environ.get("PROXY_API_TOKEN")

R = TypeVar("R", bound=Message)


def call_steam_proxy(
    msg_type: int,
    msg: Message,
    response_type: type[R],
    cooldown_time: int,
    groups: list[str],
) -> R:
    MAX_RETRIES = 3
    for i in range(MAX_RETRIES):
        try:
            data = call_steam_proxy_raw(msg_type, msg, cooldown_time, groups)
            return response_type.FromString(data)
        except Exception as e:
            LOGGER.warning(f"Failed to call steam proxy: {e}")
            if i == MAX_RETRIES - 1:
                raise
    raise RuntimeError(
        "steam proxy retry raise invariant broken: - should never hit this point"
    )


def call_steam_proxy_raw(
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
    response = requests.post(
        PROXY_URL,
        json=body,
        headers={"Authorization": f"Bearer {PROXY_API_TOKEN}"},
    )
    response.raise_for_status()
    data = response.json()["data"]
    return b64decode(data)
