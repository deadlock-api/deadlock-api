#!/usr/bin/env python3
"""Generate the `/v1/assets/map` geometry module from a decompiled map entity lump.

The zip-line lane splines and neutral camp positions are not in any vdata/css
file the asset pipeline uploads; they live in the map's entity lump. Extract it
with Source2Viewer-CLI (tested with 20.0) and run this script on the result:

    Source2Viewer-CLI -i game/citadel/maps/dl_midtown.vpk -d \
        -f maps/dl_midtown/entities/ -e vents_c -o out
    python3 scripts/extract_map_geometry.py \
        out/maps/dl_midtown/entities/default_ents.vents \
        > api/src/services/assets/versions/map/city_never_sleeps.rs
    cargo fmt -p deadlock-api-rust

Output (Rust statics, world coordinates):
- `LANE_ORIGINS` / `LANES`: one `citadel_zipline_path` per lane, in `LANE_ORDER`
  (matching `geometry::LANE_COLORS`). `pathnodes` is copied as-is: per node
  `[P0 (position), P1 (in tangent), P2 (out tangent)]`, relative to the origin.
- `OBJECTIVES`: the world (x, y) of each base objective, keyed by the
  `/v1/assets/map` `objective_positions` name, with the entity it came from:
  patrons (`npc_boss_tier3`) as `titan`, the centroid of a team's
  `info_team_spawn` entities as `core`, walkers (`npc_boss_tier2`) as `tier2`
  and guardians (`info_super_trooper_spawn` in the lane, |y| < 5000) as `tier1`.
  Team 2 is the API's team0, team 3 is team1; lane `lanenum` 1/4/6 (yellow /
  blue / purple) is the `_1` / `_3` / `_4` suffix.
- `NEUTRAL_CAMPS`: every `info_neutral_trooper_camp` except the mid boss, with
  its name, `subclass_name` (misc.vdata camp class) and origin.
"""

from __future__ import annotations

import re
import sys

# `lane_number` order of the zip-line paths; matches `geometry::LANE_COLORS`
# (generic_data `m_LaneInfo[n].m_Color`: 4 = blue, 6 = green, 1 = yellow).
LANE_ORDER = ("4", "6", "1")
TEAM_KEYS = {"2": "team0", "3": "team1"}
LANE_SUFFIX = {"1": "1", "4": "3", "6": "4"}
CAMP_KINDS = {
    "neutral_camp_weak": "Weak",
    "neutral_camp_medium": "Medium",
    "neutral_camp_strong": "Strong",
    "neutral_camp_vaults": "Vault",
}


def parse_vents(text: str) -> list[dict[str, str]]:
    """Parse Source2Viewer's `.vents` dump (`====N====` blocks of `key value`)."""
    ents: list[dict[str, str]] = []
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        i += 1
        if line.startswith("===="):
            ents.append({})
            continue
        m = re.match(r"^(\S+)\s+(.*)$", line)
        if not m or not ents:
            continue
        key, value = m.groups()
        if value.strip() == '"""':  # multi-line string
            body = []
            while lines[i].strip() != '"""':
                body.append(lines[i])
                i += 1
            i += 1
            value = "\n".join(body)
        ents[-1][key] = value.strip('"')
    return ents


def floats(s: str) -> list[float]:
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", s)]


def fmt(v: float) -> str:
    s = repr(float(v))
    return "0.0" if s == "-0.0" else s


def vec(vs: list[float]) -> str:
    return "[" + ", ".join(fmt(v) for v in vs) + "]"


def objectives(ents: list[dict[str, str]]) -> list[str]:
    """`ObjectiveSource` literals in `objective_positions` key order."""
    found: dict[str, tuple[str, str, list[float]]] = {}

    def add(key: str, source: str, name: str, pos: list[float]) -> None:
        assert key not in found, f"duplicate objective {key}"
        found[key] = (source, name, pos[:2])

    for team in ("2", "3"):
        t = TEAM_KEYS[team]
        spawns = [
            floats(e["origin"])
            for e in ents
            if e.get("classname") == "info_team_spawn" and e.get("teamnumber") == team
        ]
        assert spawns, f"no info_team_spawn for team {team}"
        add(
            f"{t}_core",
            f"info_team_spawn (centroid of {len(spawns)})",
            "",
            [sum(p[i] for p in spawns) / len(spawns) for i in range(2)],
        )
        for e in ents:
            if e.get("teamnumber") != team:
                continue
            cls = e.get("classname")
            pos = floats(e["origin"])
            if cls == "npc_boss_tier3":
                add(f"{t}_titan", cls, e.get("targetname", ""), pos)
            elif cls == "npc_boss_tier2":
                add(f"{t}_tier2_{LANE_SUFFIX[e['lanenum']]}", cls, e.get("targetname", ""), pos)
            elif cls == "info_super_trooper_spawn" and abs(pos[1]) < 5000:
                add(f"{t}_tier1_{LANE_SUFFIX[e['lanenum']]}", cls, e.get("targetname", ""), pos)

    # Response key order (see `ObjectiveMarker`): cores, titans, tier2, tier1.
    order = [f"{t}_{kind}" for kind in ("core", "titan") for t in ("team0", "team1")]
    for kind in ("tier2", "tier1"):
        order += [f"{t}_{kind}_{n}" for t in ("team0", "team1") for n in ("1", "3", "4")]
    assert sorted(order) == sorted(found), sorted(found)
    name = lambda n: re.sub(r"^\[PR#\]", "", n)
    return [
        f'ObjectiveSource {{ key: "{k}", source: "{found[k][0]}", name: "{name(found[k][1])}", '
        f"position: {vec(found[k][2])} }}"
        for k in order
    ]


def main() -> None:
    ents = parse_vents(open(sys.argv[1], encoding="utf-8").read())

    paths = {
        e["lane_number"]: e
        for e in ents
        if e.get("classname") == "citadel_zipline_path" and e.get("pathnodes", "[  ]").strip() != "[  ]"
    }
    origins, lanes = [], []
    for lane in LANE_ORDER:
        p = paths[lane]
        origins.append(vec(floats(p["origin"])))
        nums = floats(p["pathnodes"])
        assert len(nums) % 9 == 0, f"lane {lane}: {len(nums)} pathnode floats"
        nodes = [vec(nums[j : j + 9]) for j in range(0, len(nums), 9)]
        lanes.append("&[" + ", ".join(nodes) + "]")

    camps = []
    for e in ents:
        kind = CAMP_KINDS.get(e.get("subclass_name", ""))
        if e.get("classname") != "info_neutral_trooper_camp" or kind is None:
            continue
        name = e.get("targetname") or e.get("campname", "")
        name = re.sub(r"^\d+_", "", name.removeprefix("[PR#]"))
        camps.append(
            f'NeutralCampSource {{ name: "{name}", kind: NeutralCampKind::{kind}, '
            f"position: {vec(floats(e['origin']))} }}"
        )

    objs = objectives(ents)
    n = len(LANE_ORDER)
    print(f"""//! Map geometry for the "City Never Sleeps" map (build 6711+).
//!
//! GENERATED by `scripts/extract_map_geometry.py` from the `dl_midtown`
//! entity lump; do not edit by hand. World coordinates.

use super::geometry::{{NeutralCampKind, NeutralCampSource, ObjectiveSource}};

/// Lane spline origins (`citadel_zipline_path` origin), lanes {", ".join(LANE_ORDER)}.
pub(super) static LANE_ORIGINS: [[f64; 3]; {n}] = [{", ".join(origins)}];

/// Lane spline path nodes, packed like [`super::geometry::LANES`].
pub(super) static LANES: [&[[f64; 9]]; {n}] = [{", ".join(lanes)}];

/// Base objective world positions `[x, y]`, keyed like `objective_positions`.
pub(super) static OBJECTIVES: [ObjectiveSource; {len(objs)}] = [{", ".join(objs)}];

/// Neutral camps (`info_neutral_trooper_camp`, mid boss excluded).
pub(super) static NEUTRAL_CAMPS: [NeutralCampSource; {len(camps)}] = [{", ".join(camps)}];""")


if __name__ == "__main__":
    main()
