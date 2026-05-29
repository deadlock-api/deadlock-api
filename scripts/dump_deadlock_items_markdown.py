#!/usr/bin/env python3
"""Dump Deadlock item data from the assets API as readable Markdown."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import textwrap
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


DEFAULT_API_BASE = "https://api.deadlock-api.com"
DEFAULT_USER_AGENT = "deadlock-api-item-markdown-dump"
TIMING_PROPERTIES = (
    "AbilityCooldown",
    "AbilityChargeUpTime",
    "AbilityCooldownBetweenCharge",
    "BuffFrequency",
    "ProcCooldown",
    "Cooldown",
)
SECTION_ORDER = {"innate": 0, "passive": 1, "active": 2}
SLOT_ORDER = {"weapon": 0, "vitality": 1, "spirit": 2}
STAT_SCALE_NAMES = {
    "ETechPower": "spirit power",
    "EWeaponPower": "weapon power",
    "EBaseWeaponDamage": "weapon damage",
    "ELevelUpBoons": "level",
}
SCALE_FUNCTION_NAMES = {
    "scale_function_healing_boon_scale": "level",
    "scale_function_healing_spirit_scale": "spirit power",
    "scale_function_tech_damage": "spirit power",
}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        tag = tag.lower()
        if tag in {"svg", "style", "script"}:
            self.skip_stack.append(tag)
            return
        if self.skip_stack:
            return
        if tag == "br":
            self.parts.append("\n")
        elif tag in {"p", "div", "li"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.skip_stack:
            if self.skip_stack[-1] == tag:
                self.skip_stack.pop()
            return
        if tag in {"p", "div", "li"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_stack:
            self.parts.append(data.replace("\n", " "))


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if not text:
        return ""
    parser = TextExtractor()
    parser.feed(text)
    parser.close()
    text = html.unescape("".join(parser.parts))
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text.strip()


def markdown_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")


def clean_postfix(value: Any) -> str:
    if value is None:
        return ""
    raw = str(value)
    postfix = clean_text(raw)
    if postfix and raw[:1].isspace():
        return f" {postfix}"
    return postfix


def fetch_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            charset = res.headers.get_content_charset() or "utf-8"
            return json.loads(res.read().decode(charset))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"HTTP {exc.code} while fetching {url}: {body}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Failed to fetch {url}: {exc.reason}") from exc


def load_items(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.input_json:
        with Path(args.input_json).open("r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        query: dict[str, str] = {"language": args.language}
        if args.client_version is not None:
            query["client_version"] = str(args.client_version)
        url = f"{args.api_base.rstrip('/')}/v1/assets/items?{urllib.parse.urlencode(query)}"
        data = fetch_json(url)
    if not isinstance(data, list):
        raise SystemExit("Expected item data to be a JSON array")
    return [item for item in data if isinstance(item, dict)]


def item_name(item: dict[str, Any]) -> str:
    name = clean_text(item.get("name"))
    return name or str(item.get("class_name") or item.get("id") or "Unknown Item")


def item_heading(item: dict[str, Any]) -> str:
    name = markdown_escape(item_name(item))
    if item.get("type") != "upgrade":
        return name

    tier = item.get("item_tier")
    slot = clean_text(item.get("item_slot_type")).title()
    if isinstance(tier, int) and slot:
        return f"{name} [T{tier} {slot}]"
    if slot:
        return f"{name} [{slot}]"
    if isinstance(tier, int):
        return f"{name} [T{tier}]"
    return name


def item_cost(item: dict[str, Any]) -> str:
    cost = item.get("cost")
    if isinstance(cost, int):
        return f"${cost:,}"
    if isinstance(cost, float) and cost.is_integer():
        return f"${int(cost):,}"
    return "Unknown"


def is_zeroish(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (int, float)):
        return abs(value) < 0.000001
    text = str(value).strip().lower()
    if text in {"", "0", "0.0", "-0", "-0.0"}:
        return True
    return False


def number_value(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    if not match:
        return None
    return float(match.group(0))


def trim_number(text: str) -> str:
    return re.sub(r"^-?(\d+)\.0$", lambda m: text[:-2], text)


def raw_property_value(prop: dict[str, Any]) -> Any:
    if prop.get("value") is not None:
        return prop.get("value")
    return prop.get("street_brawl_value")


def format_value(value: Any) -> str:
    if isinstance(value, list):
        return " / ".join(format_value(v) for v in value)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return trim_number(str(value).strip())


def format_prefix(prop: dict[str, Any], value: Any) -> str:
    prefix = clean_text(prop.get("prefix"))
    if not prefix:
        return ""
    num = number_value(value)
    if prefix == "{s:sign}":
        return "+" if num is not None and num > 0 else ""
    if prefix == "+":
        return "+" if num is None or num >= 0 else ""
    return prefix


def format_property(key: str, prop: dict[str, Any]) -> str | None:
    value = raw_property_value(prop)
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    if is_disabled_value(value, prop.get("disable_value")):
        return None
    if is_zeroish(value) and not prop.get("provided_property_type") and prop.get("tooltip_section") is None:
        return None

    label = clean_text(prop.get("label")) or clean_text(prop.get("postvalue_label")) or titleize_key(key)
    rendered_value = format_value(value)
    prefix = format_prefix(prop, value)
    postfix = clean_postfix(prop.get("postfix"))
    if not postfix and label_needs_percent(key, label):
        postfix = "%"
    if postfix:
        rendered_value = append_postfix(rendered_value, postfix)

    line = f"{prefix}{rendered_value} {label}".strip()
    conditional = clean_text(prop.get("conditional"))
    if conditional and not conditional_is_redundant(conditional, line):
        line = f"{line} ({conditional})"

    annotations = property_annotations(prop)
    if annotations:
        line = f"{line} [{'; '.join(annotations)}]"
    return line


def conditional_is_redundant(conditional: str, line: str) -> bool:
    conditional_lower = conditional.lower()
    line_lower = line.lower()
    if conditional_lower in line_lower:
        return True
    if "npc" in conditional_lower and "npc" in line_lower:
        return True
    return False


def label_needs_percent(key: str, label: str) -> bool:
    text = f"{key} {label}".lower()
    return "threshold" in text and "health" in text


def is_disabled_value(value: Any, disable_value: Any) -> bool:
    if disable_value is None:
        return False
    value_num = number_value(value)
    disable_num = number_value(disable_value)
    if value_num is not None and disable_num is not None:
        return abs(value_num - disable_num) < 0.000001
    return str(value) == str(disable_value)


def append_postfix(rendered_value: str, postfix: str) -> str:
    if rendered_value.lower().endswith(postfix.lower()):
        return rendered_value
    suffix_match = re.search(r"([A-Za-z%]+)$", rendered_value)
    stripped_postfix = postfix.lstrip()
    if (
        suffix_match
        and stripped_postfix
        and stripped_postfix.lower().startswith(suffix_match.group(1).lower())
    ):
        return f"{rendered_value}{stripped_postfix[len(suffix_match.group(1)):]}"
    if postfix.startswith(" "):
        if stripped_postfix in {"%", "s", "m", "%/sec"}:
            return f"{rendered_value}{stripped_postfix}"
        return f"{rendered_value}{postfix}"
    return f"{rendered_value}{postfix}"


def property_annotations(prop: dict[str, Any]) -> list[str]:
    annotations: list[str] = []
    scale = prop.get("scale_function")
    if isinstance(scale, dict):
        stat_names: list[str] = []
        specific = scale.get("specific_stat_scale_type")
        if isinstance(specific, str):
            stat_names.append(specific)
        scaling_stats = scale.get("scaling_stats")
        if isinstance(scaling_stats, list):
            stat_names.extend(str(s) for s in scaling_stats if s)

        friendly = [STAT_SCALE_NAMES[s] for s in stat_names if s in STAT_SCALE_NAMES]
        class_name = str(scale.get("class_name") or "")
        if not friendly and class_name in SCALE_FUNCTION_NAMES:
            friendly.append(SCALE_FUNCTION_NAMES[class_name])
        if not friendly:
            scale_text = f"{class_name} {scale.get('subclass_name') or ''}".lower()
            if "tech_damage" in scale_text:
                friendly.append("spirit power")
        if friendly:
            friendly = [
                "boons (level)" if value == "level" else value
                for value in dedupe(friendly)
            ]
            annotations.append(f"Scales with {', '.join(friendly)}")
    if prop.get("negative_attribute") is True:
        annotations.append("Negative attribute")
    return annotations


def titleize_enum(value: str) -> str:
    value = re.sub(r"^E", "", value)
    value = re.sub(r"^(Tech|Base|Bonus|Max)", r"\1 ", value)
    value = re.sub(r"([a-z])([A-Z])", r"\1 \2", value)
    value = value.replace("_", " ")
    return value.strip().lower()


def titleize_key(key: str) -> str:
    key = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", key)
    key = key.replace("_", " ")
    return key.strip().title()


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value not in seen:
            out.append(value)
            seen.add(value)
    return out


def section_title(section_type: str | None) -> str:
    if not section_type:
        return "Details"
    return section_type.replace("_", " ").title()


def effective_section_type(item: dict[str, Any], section: dict[str, Any]) -> str | None:
    section_type = section.get("section_type")
    if section_type:
        return str(section_type)
    activation = str(item.get("activation") or "")
    if activation == "passive":
        return "passive"
    if activation in {
        "press",
        "instant_cast",
        "hold_toggle",
        "on_button_is_down",
        "press_toggle",
        "instant_cast_toggle",
    }:
        return "active"
    return None


def section_sort_key(item: dict[str, Any], section: dict[str, Any]) -> tuple[int, str]:
    section_type = str(effective_section_type(item, section) or "")
    return (SECTION_ORDER.get(section_type, 99), section_type)


def property_refs(attr: dict[str, Any]) -> list[str]:
    refs: list[str] = []
    for field in ("properties", "elevated_properties", "important_properties"):
        values = attr.get(field)
        if isinstance(values, list):
            refs.extend(str(v) for v in values if v)

    with_icon = attr.get("important_properties_with_icon")
    if isinstance(with_icon, list):
        for entry in with_icon:
            if isinstance(entry, dict) and entry.get("name"):
                refs.append(str(entry["name"]))
    return dedupe(refs)


def normalized_ref(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def property_for_ref(ref: str, properties: dict[str, Any]) -> dict[str, Any] | None:
    prop = properties.get(ref)
    if isinstance(prop, dict):
        return prop

    normalized = normalized_ref(ref)
    for key, candidate in properties.items():
        if isinstance(candidate, dict) and normalized_ref(str(key)) == normalized:
            return candidate

    for suffix in ("Percentage", "Percent", "Pct"):
        prop = properties.get(f"{ref}{suffix}")
        if isinstance(prop, dict):
            return prop
    return None


def attr_regular_refs(attr: dict[str, Any]) -> list[str]:
    values = attr.get("properties")
    if not isinstance(values, list):
        return []
    return [str(v) for v in values if v]


def icon_property_labels(attr: dict[str, Any]) -> dict[str, str]:
    labels: dict[str, str] = {}
    with_icon = attr.get("important_properties_with_icon")
    if not isinstance(with_icon, list):
        return labels
    for entry in with_icon:
        if not isinstance(entry, dict) or not entry.get("name"):
            continue
        labels[str(entry["name"])] = clean_text(entry.get("localized_name")) or titleize_key(
            str(entry["name"])
        )
    return labels


def format_timing(prop: dict[str, Any]) -> str | None:
    value = raw_property_value(prop)
    if is_zeroish(value) or str(value).strip() in {"-1", "-1.0", "-2"}:
        return None
    rendered = format_value(value)
    postfix = clean_postfix(prop.get("postfix"))
    if postfix:
        rendered = append_postfix(rendered, postfix)
    annotations = property_annotations(prop)
    if annotations:
        rendered = f"{rendered}; {'; '.join(annotations)}"
    return rendered


def timing_for_section(
    item: dict[str, Any], section: dict[str, Any], properties: dict[str, Any]
) -> tuple[str | None, set[str]]:
    attrs = section.get("section_attributes")
    if not isinstance(attrs, list):
        return None, set()

    regular_refs: list[str] = []
    timing_refs: list[str] = []
    for attr in attrs:
        if isinstance(attr, dict):
            regular_refs.extend(attr_regular_refs(attr))
            timing_refs.extend(property_refs(attr))
    regular_refs = dedupe(regular_refs)
    timing_refs = dedupe(timing_refs)

    for key in TIMING_PROPERTIES:
        if key not in timing_refs:
            continue
        prop = property_for_ref(key, properties)
        if not prop:
            continue
        rendered = format_timing(prop)
        if rendered:
            return rendered, {key}

    section_type = effective_section_type(item, section)
    if section_type == "active" or (
        section_type == "passive"
        and str(item.get("activation") or "") == "passive"
        and not regular_refs
    ):
        prop = property_for_ref("AbilityCooldown", properties)
        if isinstance(prop, dict):
            rendered = format_timing(prop)
            if rendered:
                return rendered, set()

    return None, set()


def description_for_section(
    item: dict[str, Any], section_type: str | None, fallback_general: bool = False
) -> str:
    desc = item.get("description")
    if not isinstance(desc, dict):
        return ""
    if section_type and clean_text(desc.get(section_type)):
        return clean_text(desc.get(section_type))
    if not fallback_general:
        return ""
    for key in ("desc", "desc2", "active", "passive"):
        text = clean_text(desc.get(key))
        if text:
            return text
    return ""


def fallback_properties(item: dict[str, Any], section_type: str | None = None) -> list[str]:
    properties = item.get("properties")
    if not isinstance(properties, dict):
        return []
    refs: list[str] = []
    for key, prop in properties.items():
        if not isinstance(prop, dict):
            continue
        if section_type and prop.get("tooltip_section") != section_type:
            continue
        if prop.get("tooltip_is_important") or prop.get("tooltip_is_elevated"):
            refs.append(str(key))
    return refs


def render_sections(item: dict[str, Any]) -> list[str]:
    properties = item.get("properties") if isinstance(item.get("properties"), dict) else {}
    sections = item.get("tooltip_sections")
    chunks: list[str] = []

    if isinstance(sections, list) and sections:
        sorted_sections = sorted(
            (s for s in sections if isinstance(s, dict)),
            key=lambda section: section_sort_key(item, section),
        )
        for section in sorted_sections:
            section_type = effective_section_type(item, section)
            title = section_title(section_type)
            timing, timing_keys = timing_for_section(item, section, properties)
            if timing:
                title = f"{title} ({timing})"
            section_lines: list[str] = [f"### {title}"]

            attrs = section.get("section_attributes")
            if not isinstance(attrs, list):
                attrs = []

            wrote_text = False
            seen_bullets: set[str] = set()
            for attr in attrs:
                if not isinstance(attr, dict):
                    continue
                text = clean_text(attr.get("loc_string"))
                if text:
                    section_lines.append(wrap_markdown(text))
                    wrote_text = True

                bullet_refs = [ref for ref in property_refs(attr) if ref not in timing_keys]
                bullet_lines = format_property_refs(
                    bullet_refs, properties, seen_bullets, icon_property_labels(attr)
                )
                if bullet_lines:
                    section_lines.extend(bullet_lines)

            if not wrote_text:
                text = description_for_section(item, section_type)
                if text:
                    section_lines.insert(1, wrap_markdown(text))

            chunks.extend(section_lines)
            chunks.append("")

    else:
        desc = description_for_section(item, None, fallback_general=True)
        if desc:
            chunks.extend(["### Details", wrap_markdown(desc), ""])
        refs = fallback_properties(item)
        bullet_lines = format_property_refs(refs, properties, set())
        if bullet_lines:
            if not desc:
                chunks.append("### Details")
            chunks.extend(bullet_lines)
            chunks.append("")

    return chunks


def format_property_refs(
    refs: list[str],
    properties: dict[str, Any],
    seen: set[str],
    icon_labels: dict[str, str] | None = None,
) -> list[str]:
    icon_labels = icon_labels or {}
    lines: list[str] = []
    for ref in dedupe(refs):
        prop = property_for_ref(ref, properties)
        formatted = format_property(ref, prop) if prop else None
        if not formatted and ref in icon_labels:
            formatted = icon_labels[ref]
        if not formatted or formatted in seen:
            continue
        seen.add(formatted)
        lines.append(f"- {formatted}")
    return lines


def wrap_markdown(text: str) -> str:
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    return "\n\n".join(textwrap.fill(p, width=100, break_long_words=False) for p in paragraphs)


def build_upgrade_targets(items: list[dict[str, Any]]) -> dict[str, list[str]]:
    targets: dict[str, list[str]] = defaultdict(list)
    for item in items:
        for component in item.get("component_items") or []:
            targets[str(component)].append(item_name(item))
    return {key: sorted(dedupe(values), key=str.lower) for key, values in targets.items()}


def render_components(
    item: dict[str, Any], names_by_class: dict[str, str], upgrade_targets: dict[str, list[str]]
) -> list[str]:
    lines: list[str] = []
    component_items = item.get("component_items")
    builds_from: list[str] = []
    if isinstance(component_items, list):
        builds_from = [names_by_class.get(str(component), str(component)) for component in component_items]
    upgrades_to = upgrade_targets.get(str(item.get("class_name")), [])
    if not builds_from and not upgrades_to:
        return lines

    lines.append("### Components")
    if builds_from:
        lines.append(f"Builds from: {', '.join(markdown_escape(name) for name in builds_from)}")
    if upgrades_to:
        lines.append(f"Upgrades to: {', '.join(markdown_escape(name) for name in upgrades_to)}")
    lines.append("")
    return lines


def keep_item(item: dict[str, Any], args: argparse.Namespace) -> bool:
    item_type = item.get("type")
    if args.all_api_items:
        pass
    elif item_type == "upgrade":
        if not args.include_unshopable and item.get("shopable") is not True:
            return False
        if not args.include_disabled and item.get("disabled") is True:
            return False
    else:
        if item_type == "ability" and not args.include_abilities:
            return False
        if item_type == "weapon" and not args.include_weapons:
            return False
        if item_type not in {"ability", "weapon"}:
            return False
    return True


def item_sort_key(item: dict[str, Any]) -> tuple[int, int, int, str]:
    item_type = str(item.get("type") or "")
    type_order = {"upgrade": 0, "ability": 1, "weapon": 2}.get(item_type, 9)
    slot_order = SLOT_ORDER.get(str(item.get("item_slot_type") or ""), 9)
    tier = item.get("item_tier")
    tier_order = int(tier) if isinstance(tier, int) else 99
    cost = item.get("cost")
    cost_order = int(cost) if isinstance(cost, int) else 999999
    return (type_order, slot_order, tier_order * 100000 + cost_order, item_name(item).lower())


def render_item(
    item: dict[str, Any], names_by_class: dict[str, str], upgrade_targets: dict[str, list[str]]
) -> list[str]:
    lines = [f"## {item_heading(item)}", ""]
    if item.get("type") == "upgrade":
        lines.extend([f"Cost: {item_cost(item)}", ""])
    else:
        item_type = section_title(str(item.get("type") or "item"))
        lines.extend([f"Type: {item_type}", ""])

    lines.extend(render_sections(item))
    lines.extend(render_components(item, names_by_class, upgrade_targets))
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def render_markdown(items: list[dict[str, Any]], args: argparse.Namespace) -> str:
    filtered = [item for item in items if keep_item(item, args)]
    filtered.sort(key=item_sort_key)

    names_by_class = {
        str(item.get("class_name")): item_name(item)
        for item in items
        if item.get("class_name") is not None
    }
    upgrade_targets = build_upgrade_targets(items)

    lines = ["# Deadlock Items", ""]
    if args.include_summary:
        lines.append(f"{len(filtered)} items")
        if args.client_version is not None:
            lines.append(f"Client version: {args.client_version}")
        lines.append(f"Language: {args.language}")
        lines.append("")

    for index, item in enumerate(filtered):
        if args.separators:
            lines.extend(["---", ""])
        lines.extend(render_item(item, names_by_class, upgrade_targets))
        if index != len(filtered) - 1:
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dump Deadlock shop items from /v1/assets/items as readable Markdown."
    )
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="API base URL")
    parser.add_argument("--client-version", type=int, help="Optional Deadlock client version")
    parser.add_argument("--language", default="english", help="Localization language")
    parser.add_argument("--input-json", help="Read an existing /v1/assets/items JSON file")
    parser.add_argument("-o", "--output", help="Write Markdown to this file instead of stdout")
    parser.add_argument(
        "--include-unshopable",
        action="store_true",
        help="Include hidden or non-shopable upgrades",
    )
    parser.add_argument(
        "--include-disabled",
        action="store_true",
        help="Include disabled upgrades",
    )
    parser.add_argument("--include-abilities", action="store_true", help="Include ability records")
    parser.add_argument("--include-weapons", action="store_true", help="Include weapon records")
    parser.add_argument(
        "--all-api-items",
        action="store_true",
        help="Include every item returned by the API",
    )
    parser.add_argument(
        "--no-summary",
        dest="include_summary",
        action="store_false",
        help="Omit the generated count/language summary",
    )
    parser.add_argument(
        "--no-separators",
        dest="separators",
        action="store_false",
        help="Omit horizontal rules between items",
    )
    parser.set_defaults(include_summary=True, separators=True)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    items = load_items(args)
    markdown = render_markdown(items, args)
    if args.output:
        Path(args.output).write_text(markdown, encoding="utf-8")
    else:
        sys.stdout.write(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
