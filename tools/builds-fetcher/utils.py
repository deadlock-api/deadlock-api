import os
from base64 import b64decode, b64encode
from typing import TypeVar

import requests
from google.protobuf.message import Message
from pydantic import BaseModel, ConfigDict, computed_field
from valveprotos_py.citadel_gcmessages_client_pb2 import CMsgCitadelProfileCard

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
            print(f"[Warning] Failed to call steam proxy: {e}")
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


class PlayerCardSlotHero(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hero_id: int | None
    hero_kills: int | None
    hero_wins: int | None

    @classmethod
    def from_msg(cls, msg: CMsgCitadelProfileCard.Slot.Hero) -> "PlayerCardSlotHero":
        return cls(
            hero_id=msg.hero_id if hasattr(msg, "hero_id") else None,
            hero_kills=msg.hero_kills if hasattr(msg, "hero_kills") else None,
            hero_wins=msg.hero_wins if hasattr(msg, "hero_wins") else None,
        )


class PlayerCardSlotStat(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stat_id: int | str | None
    stat_score: int | None

    @classmethod
    def from_msg(cls, msg: CMsgCitadelProfileCard.Slot.Stat) -> "PlayerCardSlotStat":
        return cls(
            stat_id=msg.stat_id if hasattr(msg, "stat_id") else None,
            stat_score=msg.stat_score if hasattr(msg, "stat_score") else None,
        )


class PlayerCardSlot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slot_id: int | None
    hero: PlayerCardSlotHero | None
    stat: PlayerCardSlotStat | None

    @classmethod
    def from_msg(cls, msg: CMsgCitadelProfileCard.Slot) -> "PlayerCardSlot":
        return cls(
            slot_id=msg.slot_id if hasattr(msg, "slot_id") else None,
            hero=(
                PlayerCardSlotHero.from_msg(msg.hero)
                if hasattr(msg, "hero") and msg.hero
                else None
            ),
            stat=(
                PlayerCardSlotStat.from_msg(msg.stat)
                if hasattr(msg, "stat") and msg.stat
                else None
            ),
        )


class PlayerCard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    account_id: int
    ranked_badge_level: int
    slots: list[PlayerCardSlot]

    @computed_field
    @property
    def ranked_rank(self) -> int | None:
        return (
            self.ranked_badge_level // 10
            if self.ranked_badge_level is not None
            else None
        )

    @computed_field
    @property
    def ranked_subrank(self) -> int | None:
        return (
            self.ranked_badge_level % 10
            if self.ranked_badge_level is not None
            else None
        )

    @classmethod
    def from_msg(cls, msg: CMsgCitadelProfileCard) -> "PlayerCard":
        return cls(
            account_id=msg.account_id,
            ranked_badge_level=msg.ranked_badge_level,
            slots=[PlayerCardSlot.from_msg(slot) for slot in msg.slots],
        )
