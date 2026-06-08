#!/usr/bin/env python3
# /// script
# dependencies = [
#   "keyvalues3>=0.6",
#   "zstandard>=0.23",
# ]
# ///
"""Export local Deadlock hero builds as base64(zstd(CMsgHeroBuild)).

Steam's cached_hero_builds.kv3 stores build list entries as
CMsgClientToGCFindHeroBuildsResponse.HeroBuildResult blobs. The in-game
paste/import format is a zstd-compressed bare CMsgHeroBuild protobuf blob, then
base64 encoded. This script extracts that inner CMsgHeroBuild message.
"""

from __future__ import annotations

import argparse
import base64
import json
import struct
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from tempfile import gettempdir
from typing import Any

import keyvalues3 as kv3
import zstandard as zstd


DEFAULT_STEAM_ROOT = Path.home() / ".local/share/Steam"
DEADLOCK_APP_ID = "1422450"
DEFAULT_SOURCE_CACHE = (
    DEFAULT_STEAM_ROOT
    / "userdata/127331261"
    / DEADLOCK_APP_ID
    / "remote/cfg/cached_hero_builds.kv3"
)
DEFAULT_OUTPUT = Path(gettempdir()) / "deadlock_wraith_build_blobs.txt"
DEFAULT_API_BASE_URL = "https://api.deadlock-api.com"
DEFAULT_API_OUTPUT = Path(gettempdir()) / "deadlock_api_top_public_build_blobs.txt"
DEFAULT_API_AUTHOR_OUTPUT_TEMPLATE = "deadlock_api_author_{author_id}_build_blobs.txt"
SECTION_ORDER = ("SavedLastUsed", "Favorites", "Unpublished")


@dataclass(frozen=True)
class ProtoField:
    field: int
    wire_type: int
    value: int | bytes


@dataclass(frozen=True)
class ExportedBuild:
    section: str
    hero_build: bytes
    build_id: int | None
    hero_id: int | None
    author_account_id: int | None
    last_updated_timestamp: int | None
    name: str | None
    origin_build_id: int | None
    encoded: str
    hero_name: str | None = None
    hero_class_name: str | None = None
    num_favorites: int | None = None
    num_weekly_favorites: int | None = None
    rollup_category: int | None = None


def encode_varint(value: int) -> bytes:
    if value < 0:
        value &= (1 << 64) - 1
    output = bytearray()
    while value >= 0x80:
        output.append((value & 0x7F) | 0x80)
        value >>= 7
    output.append(value)
    return bytes(output)


def proto_key(field: int, wire_type: int) -> bytes:
    return encode_varint((field << 3) | wire_type)


def varint_field(field: int, value: int | None) -> bytes:
    if value is None:
        return b""
    return proto_key(field, 0) + encode_varint(value)


def bool_field(field: int, value: bool | None) -> bytes:
    if value is None:
        return b""
    return varint_field(field, 1 if value else 0)


def float_field(field: int, value: float | int | None) -> bytes:
    if value is None:
        return b""
    return proto_key(field, 5) + struct.pack("<f", float(value))


def bytes_field(field: int, value: bytes) -> bytes:
    return proto_key(field, 2) + encode_varint(len(value)) + value


def string_field(field: int, value: str | None) -> bytes:
    if value is None:
        return b""
    return bytes_field(field, value.encode("utf-8"))


def message_field(field: int, value: bytes | None) -> bytes:
    if not value:
        return b""
    return bytes_field(field, value)


def int_value(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def str_value(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def read_varint(buf: bytes | bytearray, index: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while True:
        if index >= len(buf):
            raise ValueError("truncated varint")
        byte = buf[index]
        index += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, index
        shift += 7
        if shift > 70:
            raise ValueError("varint is too long")


def parse_proto_fields(buf: bytes | bytearray) -> list[ProtoField]:
    fields: list[ProtoField] = []
    index = 0
    while index < len(buf):
        key, index = read_varint(buf, index)
        field = key >> 3
        wire_type = key & 7

        if wire_type == 0:
            value, index = read_varint(buf, index)
        elif wire_type == 1:
            value = bytes(buf[index : index + 8])
            index += 8
        elif wire_type == 2:
            length, index = read_varint(buf, index)
            value = bytes(buf[index : index + length])
            index += length
        elif wire_type == 5:
            value = bytes(buf[index : index + 4])
            index += 4
        else:
            raise ValueError(f"unsupported protobuf wire type {wire_type}")

        if isinstance(value, bytes) and index > len(buf):
            raise ValueError("truncated length-delimited field")
        fields.append(ProtoField(field, wire_type, value))
    return fields


def extract_hero_build(blob: bytes | bytearray) -> bytes:
    """Return CMsgHeroBuild bytes from a HeroBuildResult or bare HeroBuild blob."""
    data = bytes(blob)
    fields = parse_proto_fields(data)

    # Cached list entries are HeroBuildResult, where field 1 is CMsgHeroBuild.
    for item in fields:
        if item.field == 1 and item.wire_type == 2 and isinstance(item.value, bytes):
            nested_fields = parse_proto_fields(item.value)
            nested_numbers = {field.field for field in nested_fields}
            if 2 in nested_numbers and 5 in nested_numbers:
                return item.value

    # Already a bare CMsgHeroBuild.
    return data


def hero_build_metadata(hero_build: bytes) -> dict[int, int | str]:
    metadata: dict[int, int | str] = {}
    for item in parse_proto_fields(hero_build):
        if item.wire_type == 0 and isinstance(item.value, int):
            metadata[item.field] = item.value
        elif item.wire_type == 2 and item.field in {5, 6} and isinstance(item.value, bytes):
            metadata[item.field] = item.value.decode("utf-8", errors="replace")
    return metadata


def export_build(section: str, blob: bytes | bytearray, compressor: zstd.ZstdCompressor) -> ExportedBuild:
    hero_build = extract_hero_build(blob)
    metadata = hero_build_metadata(hero_build)
    compressed = compressor.compress(hero_build)
    return ExportedBuild(
        section=section,
        hero_build=hero_build,
        build_id=metadata.get(1) if isinstance(metadata.get(1), int) else None,
        hero_id=metadata.get(2) if isinstance(metadata.get(2), int) else None,
        author_account_id=metadata.get(3) if isinstance(metadata.get(3), int) else None,
        last_updated_timestamp=metadata.get(4) if isinstance(metadata.get(4), int) else None,
        name=metadata.get(5) if isinstance(metadata.get(5), str) else None,
        origin_build_id=metadata.get(9) if isinstance(metadata.get(9), int) else None,
        encoded=base64.b64encode(compressed).decode("ascii"),
    )


def encode_build_mod_entry(entry: dict[str, Any]) -> bytes:
    output = bytearray()
    output += varint_field(1, int_value(entry.get("ability_id")))
    output += string_field(2, str_value(entry.get("annotation")))
    output += varint_field(3, int_value(entry.get("required_flex_slots")))
    output += varint_field(4, int_value(entry.get("sell_priority")))
    output += varint_field(5, int_value(entry.get("imbue_target_ability_id")))
    return bytes(output)


def encode_build_mod_category(category: dict[str, Any]) -> bytes:
    output = bytearray()
    for entry in category.get("mods") or []:
        output += message_field(1, encode_build_mod_entry(entry))
    output += string_field(2, str_value(category.get("name")))
    output += string_field(3, str_value(category.get("description")))
    output += float_field(4, category.get("width"))
    output += float_field(5, category.get("height"))
    output += bool_field(6, category.get("optional"))
    return bytes(output)


def encode_currency_change(change: dict[str, Any]) -> bytes:
    output = bytearray()
    output += varint_field(1, int_value(change.get("ability_id")))
    output += varint_field(2, int_value(change.get("currency_type")))
    output += varint_field(3, int_value(change.get("delta")))
    output += string_field(4, str_value(change.get("annotation")))
    return bytes(output)


def encode_ability_order(ability_order: dict[str, Any] | None) -> bytes:
    if not ability_order:
        return b""
    output = bytearray()
    for change in ability_order.get("currency_changes") or []:
        output += message_field(1, encode_currency_change(change))
    return bytes(output)


def encode_details(details: dict[str, Any]) -> bytes:
    output = bytearray()
    for category in details.get("mod_categories") or []:
        output += message_field(1, encode_build_mod_category(category))
    output += message_field(2, encode_ability_order(details.get("ability_order")))
    return bytes(output)


def encode_hero_build(hero_build: dict[str, Any]) -> bytes:
    """Encode API BuildHero JSON as CMsgHeroBuild protobuf bytes."""
    output = bytearray()
    output += varint_field(1, int_value(hero_build.get("hero_build_id")))
    output += varint_field(2, int_value(hero_build.get("hero_id")))
    output += varint_field(3, int_value(hero_build.get("author_account_id")))
    output += varint_field(4, int_value(hero_build.get("last_updated_timestamp")))
    output += string_field(5, str_value(hero_build.get("name")))
    output += string_field(6, str_value(hero_build.get("description")))
    output += varint_field(7, int_value(hero_build.get("language")))
    output += varint_field(8, int_value(hero_build.get("version")))
    output += varint_field(9, int_value(hero_build.get("origin_build_id")))
    output += message_field(10, encode_details(hero_build.get("details") or {}))
    for tag in hero_build.get("tags") or []:
        output += varint_field(11, int_value(tag))
    output += bool_field(12, hero_build.get("development_build"))
    output += varint_field(13, int_value(hero_build.get("publish_timestamp")))
    return bytes(output)


def export_api_build(
    build: dict[str, Any],
    compressor: zstd.ZstdCompressor,
    hero_name: str | None,
    hero_class_name: str | None,
    section: str = "deadlock-api",
) -> ExportedBuild:
    hero_build_json = build["hero_build"]
    hero_build = encode_hero_build(hero_build_json)
    compressed = compressor.compress(hero_build)
    return ExportedBuild(
        section=section,
        hero_build=hero_build,
        build_id=int_value(hero_build_json.get("hero_build_id")),
        hero_id=int_value(hero_build_json.get("hero_id")),
        author_account_id=int_value(hero_build_json.get("author_account_id")),
        last_updated_timestamp=int_value(hero_build_json.get("last_updated_timestamp")),
        name=str_value(hero_build_json.get("name")),
        origin_build_id=int_value(hero_build_json.get("origin_build_id")),
        encoded=base64.b64encode(compressed).decode("ascii"),
        hero_name=hero_name,
        hero_class_name=hero_class_name,
        num_favorites=int_value(build.get("num_favorites")),
        num_weekly_favorites=int_value(build.get("num_weekly_favorites")),
        rollup_category=int_value(build.get("rollup_category")),
    )


def collect_exports(
    cache: dict,
    compressor: zstd.ZstdCompressor,
    hero_id: int | None = None,
    selected_build_id: int | None = None,
    selected_only: bool = False,
) -> list[ExportedBuild]:
    exports: list[ExportedBuild] = []
    seen: set[tuple[str, int | None, bytes]] = set()
    for section in SECTION_ORDER:
        for blob in cache.get(section, []):
            exported = export_build(section, blob, compressor)
            if hero_id is not None and exported.hero_id != hero_id:
                continue
            if selected_only and exported.build_id != selected_build_id:
                continue
            dedupe_key = (section, exported.build_id, exported.hero_build)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            exports.append(exported)
    return exports


def api_get_json(base_url: str, path: str, params: dict[str, str | int | bool] | None = None) -> Any:
    url = base_url.rstrip("/") + path
    if params:
        normalized = {
            key: str(value).lower() if isinstance(value, bool) else str(value)
            for key, value in params.items()
            if value is not None
        }
        url += "?" + urllib.parse.urlencode(normalized)
    request = urllib.request.Request(url, headers={"User-Agent": "deadlock-build-export/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def fetch_api_builds(
    base_url: str,
    hero_id: int,
    sort_by: str,
    sort_direction: str,
    limit: int,
    only_latest: bool,
) -> list[dict[str, Any]]:
    data = api_get_json(
        base_url,
        "/v1/builds",
        {
            "hero_id": hero_id,
            "sort_by": sort_by,
            "sort_direction": sort_direction,
            "limit": limit,
            "only_latest": only_latest,
        },
    )
    if not isinstance(data, list):
        raise ValueError(f"expected /v1/builds to return a list, got {type(data).__name__}")
    return data


def fetch_api_author_builds(
    base_url: str,
    author_id: int,
    sort_by: str,
    sort_direction: str,
    limit: int,
    only_latest: bool,
) -> list[dict[str, Any]]:
    data = api_get_json(
        base_url,
        "/v1/builds",
        {
            "author_id": author_id,
            "sort_by": sort_by,
            "sort_direction": sort_direction,
            "limit": limit,
            "only_latest": only_latest,
        },
    )
    if not isinstance(data, list):
        raise ValueError(f"expected /v1/builds to return a list, got {type(data).__name__}")
    return data


def fetch_active_heroes(base_url: str) -> list[dict[str, Any]]:
    data = api_get_json(base_url, "/v1/assets/heroes", {"only_active": True})
    if not isinstance(data, list):
        raise ValueError(f"expected /v1/assets/heroes to return a list, got {type(data).__name__}")
    heroes = [
        hero
        for hero in data
        if isinstance(hero, dict) and hero.get("id") is not None and not hero.get("disabled", False)
    ]
    return sorted(heroes, key=lambda hero: int(hero["id"]))


def append_export(lines: list[str], index: int, exported: ExportedBuild, selected_for: list[str] | None = None) -> None:
    lines.extend(
        [
            f"# Build {index}",
            f"# section={exported.section}",
            f"# hero_name={exported.hero_name or ''}",
            f"# hero_class_name={exported.hero_class_name or ''}",
            f"# hero_id={exported.hero_id}",
            f"# hero_build_id={exported.build_id}",
            f"# name={exported.name or ''}",
            f"# author_account_id={exported.author_account_id}",
            f"# last_updated_timestamp={exported.last_updated_timestamp}",
            f"# origin_build_id={exported.origin_build_id}",
            f"# num_favorites={exported.num_favorites}",
            f"# num_weekly_favorites={exported.num_weekly_favorites}",
            f"# rollup_category={exported.rollup_category}",
        ]
    )
    if selected_for:
        lines.append(f"# selected_for={','.join(selected_for)}")
    lines.extend([exported.encoded, ""])


def build_output(cache_path: Path, hero_key: str, hero_id: int, selected_only: bool) -> str:
    cache = kv3.read(str(cache_path)).value
    selected_build_id = cache.get("LastUsedBuilds", {}).get(hero_key)
    compressor = zstd.ZstdCompressor()
    exports = collect_exports(cache, compressor, hero_id, selected_build_id, selected_only)

    lines = [
        "# Deadlock hero build export",
        f"# Source cache: {cache_path}",
        f"# Hero: {hero_key} (hero_id={hero_id})",
        f"# Selected build id from LastUsedBuilds: {selected_build_id}",
        "# Format: base64(zstd(CMsgHeroBuild protobuf bytes))",
        "",
    ]

    if not exports:
        lines.append("# No matching builds found.")
        return "\n".join(lines) + "\n"

    for index, exported in enumerate(exports, 1):
        append_export(lines, index, exported)

    return "\n".join(lines)


def build_all_output(cache_path: Path) -> str:
    cache = kv3.read(str(cache_path)).value
    compressor = zstd.ZstdCompressor()
    exports = collect_exports(cache, compressor)

    lines = [
        "# Deadlock all hero build export",
        f"# Source cache: {cache_path}",
        f"# Build count: {len(exports)}",
        "# Sections: SavedLastUsed, Favorites, Unpublished",
        "# Format: base64(zstd(CMsgHeroBuild protobuf bytes))",
        "",
    ]

    if not exports:
        lines.append("# No builds found.")
        return "\n".join(lines) + "\n"

    for index, exported in enumerate(exports, 1):
        append_export(lines, index, exported)

    return "\n".join(lines)


def build_api_public_output(
    base_url: str,
    requested_sort_by: str,
    sort_direction: str,
    limit: int,
    only_latest: bool,
) -> str:
    heroes = fetch_active_heroes(base_url)
    actual_sort_by = requested_sort_by
    sort_note: str | None = None
    compressor = zstd.ZstdCompressor()
    exports: list[ExportedBuild] = []
    per_hero_counts: list[tuple[int, str, int]] = []

    for hero in heroes:
        hero_id = int(hero["id"])
        hero_name = str_value(hero.get("name")) or ""
        hero_class_name = str_value(hero.get("class_name")) or ""
        try:
            builds = fetch_api_builds(base_url, hero_id, actual_sort_by, sort_direction, limit, only_latest)
        except urllib.error.HTTPError as error:
            if (
                error.code == 400
                and actual_sort_by == "daily_favorites"
                and requested_sort_by == "daily_favorites"
            ):
                actual_sort_by = "weekly_favorites"
                sort_note = (
                    "Requested sort_by=daily_favorites, but /v1/builds returned HTTP 400; "
                    "using sort_by=weekly_favorites instead."
                )
                builds = fetch_api_builds(base_url, hero_id, actual_sort_by, sort_direction, limit, only_latest)
            else:
                raise
        per_hero_counts.append((hero_id, hero_name, len(builds)))
        for build in builds:
            exports.append(export_api_build(build, compressor, hero_name, hero_class_name))

    lines = [
        "# Deadlock API public hero build export",
        f"# Generated: {date.today().isoformat()}",
        f"# API base URL: {base_url.rstrip('/')}",
        f"# Requested sort_by: {requested_sort_by}",
        f"# Actual sort_by: {actual_sort_by}",
        f"# sort_direction: {sort_direction}",
        f"# limit_per_hero: {limit}",
        f"# only_latest: {str(only_latest).lower()}",
        f"# Hero count: {len(heroes)}",
        f"# Build count: {len(exports)}",
        "# Format: base64(zstd(CMsgHeroBuild protobuf bytes))",
    ]
    if sort_note:
        lines.append(f"# Note: {sort_note}")
    lines.append("# Per hero counts:")
    for hero_id, hero_name, count in per_hero_counts:
        lines.append(f"#   {hero_id}: {hero_name} - {count}")
    lines.append("")

    if not exports:
        lines.append("# No builds found.")
        return "\n".join(lines) + "\n"

    for index, exported in enumerate(exports, 1):
        append_export(lines, index, exported)

    return "\n".join(lines)


def build_api_author_output(
    base_url: str,
    author_id: int,
    sort_by: str,
    sort_direction: str,
    limit: int,
    only_latest: bool,
) -> str:
    heroes = {
        int(hero["id"]): hero
        for hero in fetch_active_heroes(base_url)
        if hero.get("id") is not None
    }
    builds = fetch_api_author_builds(base_url, author_id, sort_by, sort_direction, limit, only_latest)
    compressor = zstd.ZstdCompressor()
    exports: list[ExportedBuild] = []
    for build in builds:
        hero_build = build["hero_build"]
        hero = heroes.get(int(hero_build["hero_id"]))
        exports.append(
            export_api_build(
                build,
                compressor,
                str_value(hero.get("name")) if hero else None,
                str_value(hero.get("class_name")) if hero else None,
            )
        )

    lines = [
        "# Deadlock API author hero build export",
        f"# Generated: {date.today().isoformat()}",
        f"# API base URL: {base_url.rstrip('/')}",
        f"# author_id: {author_id}",
        f"# sort_by: {sort_by}",
        f"# sort_direction: {sort_direction}",
        f"# limit: {limit}",
        f"# only_latest: {str(only_latest).lower()}",
        f"# Build count: {len(exports)}",
        "# Format: base64(zstd(CMsgHeroBuild protobuf bytes))",
        "",
    ]

    if not exports:
        lines.append("# No builds found.")
        return "\n".join(lines) + "\n"

    for index, exported in enumerate(exports, 1):
        append_export(lines, index, exported)

    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export local Deadlock hero builds as base64 zstd CMsgHeroBuild blobs.",
    )
    parser.add_argument("--source-cache", type=Path, default=DEFAULT_SOURCE_CACHE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--hero-key", default="hero_wraith")
    parser.add_argument("--hero-id", type=int, default=7)
    parser.add_argument(
        "--all-heroes",
        action="store_true",
        help="Export all cached builds across all heroes instead of filtering by hero.",
    )
    parser.add_argument(
        "--api-top-public",
        action="store_true",
        help="Fetch top public builds for every active hero from deadlock-api instead of reading a local cache.",
    )
    parser.add_argument("--api-base-url", default=DEFAULT_API_BASE_URL)
    parser.add_argument(
        "--api-author-id",
        type=int,
        help="Fetch public builds for a specific author SteamID3 from deadlock-api.",
    )
    parser.add_argument(
        "--api-sort-by",
        default="daily_favorites",
        help="deadlock-api /v1/builds sort_by value. daily_favorites falls back to weekly_favorites if rejected.",
    )
    parser.add_argument("--api-sort-direction", default="desc")
    parser.add_argument("--api-limit", type=int, default=100, help="Maximum public builds to fetch per hero.")
    parser.add_argument(
        "--api-include-old-versions",
        action="store_true",
        help="Do not pass only_latest=true to /v1/builds.",
    )
    parser.add_argument(
        "--selected-only",
        action="store_true",
        help="Only export the build id currently selected in LastUsedBuilds.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_cache = args.source_cache.expanduser()
    if args.api_author_id is not None:
        if args.output == DEFAULT_OUTPUT:
            args.output = Path(gettempdir()) / DEFAULT_API_AUTHOR_OUTPUT_TEMPLATE.format(
                author_id=args.api_author_id
            )
        output = build_api_author_output(
            args.api_base_url,
            args.api_author_id,
            "updated_at" if args.api_sort_by == "daily_favorites" else args.api_sort_by,
            args.api_sort_direction,
            args.api_limit,
            not args.api_include_old_versions,
        )
    elif args.api_top_public:
        if args.output == DEFAULT_OUTPUT:
            args.output = DEFAULT_API_OUTPUT
        output = build_api_public_output(
            args.api_base_url,
            args.api_sort_by,
            args.api_sort_direction,
            args.api_limit,
            not args.api_include_old_versions,
        )
    elif args.all_heroes:
        output = build_all_output(source_cache)
    else:
        output = build_output(source_cache, args.hero_key, args.hero_id, args.selected_only)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
