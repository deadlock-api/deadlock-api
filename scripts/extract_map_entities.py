#!/usr/bin/env python3
"""Extract the `/v1/assets/map` `entities` (interactable map features) from a
decompiled map entity lump.

Run by `scripts/build_version_and_upload.sh` on every assets build, so the
positions follow map changes without code changes. Manually:

    Source2Viewer-CLI -i game/citadel/maps/dl_midtown.vpk -d \
        -f maps/dl_midtown/entities/ -e vents_c -o out
    python3 scripts/extract_map_entities.py \
        out/maps/dl_midtown/entities/default_ents.vents > entities.json

Output: a JSON object of category -> list of entities, each with its world
`position` `[x, y, z]` (same space as the zip-line splines) and, where the
entity has one, `team` (the API's 0/1; Valve's teamnumber 2/3), `kind` (the
variant within the category) and `target` (world position it sends you to:
teleporter exit, bounce pad landing). Brush triggers (ropes, pads, veils, ...)
are placed at their entity origin.
"""

from __future__ import annotations

import json
import sys

from extract_map_geometry import floats, parse_vents

TEAMS = {"2": 0, "3": 1}

# Category -> (classname, subclass_name -> kind). A `None` subclass map takes
# every entity of the class; `kind` is then left out.
BREAKABLES = {
    "crates": {
        "citadel_breakable_prop_wooden_crate": "wooden_crate",
        "citadel_breakable_wooden_crate_02": "wooden_crate_02",
        "citadel_breakable_wooden_crate_03": "wooden_crate_03",
    },
    "tough_crates": {"citadel_breakable_prop_tough_crate": "tough_crate"},
    # The golden (stat buff) statues are `citadel_breakable_item_container` on
    # the current map; the older lion statue class is kept should it return.
    "golden_statues": {
        "citadel_breakable_item_container": "item_container",
        "citadel_breakable_lion_statue": "lion_statue",
    },
    "bells": {"citadel_breakable_bell_chinatown": "bell"},
}
SIMPLE = {
    "healing_snacks": "citadel_pickup_spawner",
    "bridge_buffs": "citadel_item_powerup_spawner",
    "climb_ropes": "citadel_trigger_climb_rope",
    "soul_urn_spawns": "item_crate_spawn",
    "soul_urn_pads": "citadel_trigger_idol_return",
    "base_sentries": "npc_base_defense_sentry",
    # Every street steam vent (`street_steam_02` particle) has an invisibility
    # volume; the one `citadel_obscured_volume` is a steam cloud too.
    "steam_vents": "citadel_invis_volume",
    "cosmic_veils": "citadel_passthrough_fake_wall",
    "unstable_rifts": "info_koth_spawn_location",
}
# Response key order.
CATEGORIES = [
    "crates",
    "tough_crates",
    "golden_statues",
    "bells",
    "healing_snacks",
    "bridge_buffs",
    "climb_ropes",
    "teleporters",
    "shops",
    "soul_urn_spawns",
    "soul_urn_pads",
    "base_sentries",
    "bounce_pads",
    "steam_vents",
    "cosmic_veils",
    "unstable_rifts",
]


def position(e: dict[str, str]) -> list[float]:
    return [round(v, 2) + 0.0 for v in floats(e["origin"])[:3]]


def entry(e: dict[str, str], **extra: object) -> dict[str, object]:
    out: dict[str, object] = {"position": position(e)}
    if (team := TEAMS.get(e.get("teamnumber", ""))) is not None:
        out["team"] = team
    out.update({k: v for k, v in extra.items() if v is not None})
    return out


def shop_kind(e: dict[str, str]) -> str:
    if e.get("teamnumber") not in TEAMS:
        return "secret"
    return "base" if e.get("lanenum") == "0" else "lane"


def extract(ents: list[dict[str, str]]) -> dict[str, list[dict[str, object]]]:
    by_name = {e["targetname"]: e for e in ents if e.get("targetname")}

    def target(name: str | None) -> list[float] | None:
        t = by_name.get(name or "")
        return position(t) if t else None

    out: dict[str, list[dict[str, object]]] = {c: [] for c in CATEGORIES}
    for e in ents:
        cls, sub = e.get("classname"), e.get("subclass_name", "")
        if cls == "citadel_breakable_prop":
            for cat, kinds in BREAKABLES.items():
                if sub in kinds:
                    out[cat].append(entry(e, kind=kinds[sub]))
        elif cls == "citadel_trigger_teleport":
            out["teleporters"].append(entry(e, target=target(e.get("exitpoint"))))
        elif cls == "trigger_item_shop":
            out["shops"].append(entry(e, kind=shop_kind(e)))
        elif cls == "trigger_catapult":
            out["bounce_pads"].append(entry(e, target=target(e.get("target"))))
        elif cls == "citadel_obscured_volume":
            out["steam_vents"].append(entry(e, kind="obscured"))
        else:
            for cat, want in SIMPLE.items():
                if cls == want:
                    out[cat].append(entry(e))
    for cat in out.values():
        cat.sort(key=lambda x: x["position"])  # type: ignore[arg-type, return-value]
    return out


def main() -> None:
    ents = parse_vents(open(sys.argv[1], encoding="utf-8").read())
    data = extract(ents)
    missing = [c for c, v in data.items() if not v]
    if missing:
        print(f"warning: no entities for {', '.join(missing)}", file=sys.stderr)
    json.dump(data, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
