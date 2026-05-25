"""Merge per-category zstd-compressed Valve KeyValues localization files in
each `versions/<build>/localization/` folder into a single flat JSON per
language: `<lang>.json.zst` containing one key->value mapping (no nesting).

Removes the original `*_<lang>.txt.zst` files after a successful merge.
"""

import json
import re
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import zstandard as zstd

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = ROOT / "versions"

_LINE_KV = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"\s*$')
_LINE_KEY = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*$')


_ESC_MAP = {"n": "\n", "t": "\t", "\\": "\\", '"': '"'}


def _unescape(s: str) -> str:
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            nxt = s[i + 1]
            out.append(_ESC_MAP.get(nxt, nxt))
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def parse_kv(text: str) -> dict:
    if text.startswith("﻿"):
        text = text[1:]
    raw = text.splitlines()
    lines = [ln for ln in raw if not ln.lstrip().startswith("//")]
    pos = 0

    def block() -> dict:
        nonlocal pos
        d: dict = {}
        while pos < len(lines):
            stripped = lines[pos].strip()
            if not stripped:
                pos += 1
                continue
            if stripped == "}":
                pos += 1
                return d
            if stripped.startswith("{"):
                pos += 1
                continue
            m = _LINE_KV.match(lines[pos])
            if m:
                d[_unescape(m.group(1))] = _unescape(m.group(2))
                pos += 1
                continue
            km = _LINE_KEY.match(lines[pos])
            if km:
                key = _unescape(km.group(1))
                pos += 1
                while pos < len(lines) and not lines[pos].strip():
                    pos += 1
                if pos < len(lines) and lines[pos].strip().startswith("{"):
                    pos += 1
                    d[key] = block()
                continue
            pos += 1
        return d

    while pos < len(lines) and not lines[pos].strip():
        pos += 1
    if pos >= len(lines):
        return {}
    km = _LINE_KEY.match(lines[pos])
    top_key = _unescape(km.group(1)) if km else "root"
    pos += 1
    while pos < len(lines) and not lines[pos].strip():
        pos += 1
    if pos < len(lines) and lines[pos].strip().startswith("{"):
        pos += 1
        return {top_key: block()}
    return {top_key: {}}


def flat_tokens(parsed: dict) -> dict[str, str]:
    """Return the leaf string entries. Handles both `lang { Tokens { ... } }`
    and `accolades.vdata { ... }` shapes; flattens any nested dicts as a
    safety net (last key wins on collision)."""
    if not parsed:
        return {}
    top = next(iter(parsed.values()))
    if isinstance(top, dict) and "Tokens" in top and isinstance(top["Tokens"], dict):
        candidate = top["Tokens"]
    elif isinstance(top, dict):
        candidate = top
    else:
        return {}

    out: dict[str, str] = {}

    def walk(d: dict) -> None:
        for k, v in d.items():
            if isinstance(v, dict):
                walk(v)
            else:
                out[k] = str(v)

    walk(candidate)
    return out


_FNAME_TXT = re.compile(r"^(.+)_([a-z]+)\.txt\.zst$")
_FNAME_TXT_PLAIN = re.compile(r"^(.+)_([a-z]+)\.txt$")
_FNAME_JSON = re.compile(r"^([a-z]+)\.json\.zst$")


def merge_folder(folder: Path) -> tuple[Path, dict[str, int], list[str]]:
    dctx = zstd.ZstdDecompressor()
    cctx = zstd.ZstdCompressor(level=19)

    by_lang: dict[str, dict[str, str]] = {}
    txt_sources: list[Path] = []
    json_sources: list[Path] = []
    errors: list[str] = []

    for p in folder.iterdir():
        if not p.is_file():
            continue
        m = _FNAME_TXT.match(p.name)
        if m:
            lang = m.group(2)
            txt_sources.append(p)
            try:
                raw = dctx.decompress(p.read_bytes())
                tokens = flat_tokens(parse_kv(raw.decode("utf-8", errors="replace")))
            except Exception as e:
                errors.append(f"parse {p.name}: {e}")
                continue
            if tokens:
                by_lang.setdefault(lang, {}).update(tokens)
            continue
        m = _FNAME_TXT_PLAIN.match(p.name)
        if m:
            lang = m.group(2)
            txt_sources.append(p)
            try:
                tokens = flat_tokens(parse_kv(p.read_text(encoding="utf-8", errors="replace")))
            except Exception as e:
                errors.append(f"parse {p.name}: {e}")
                continue
            if tokens:
                by_lang.setdefault(lang, {}).update(tokens)
            continue
        m = _FNAME_JSON.match(p.name)
        if m:
            lang = m.group(1)
            json_sources.append(p)
            try:
                data = json.loads(dctx.decompress(p.read_bytes()))
            except Exception as e:
                errors.append(f"parse {p.name}: {e}")
                continue
            if isinstance(data, dict) and data:
                by_lang.setdefault(lang, {}).update({k: str(v) for k, v in data.items()})

    english_base = by_lang.get("english", {})

    counts: dict[str, int] = {}
    for lang, tokens in by_lang.items():
        merged = dict(english_base)
        if lang != "english":
            merged.update(tokens)
        if not merged:
            continue
        out_path = folder / f"{lang}.json.zst"
        payload = json.dumps(merged, ensure_ascii=False, sort_keys=True).encode("utf-8")
        try:
            out_path.write_bytes(cctx.compress(payload))
        except Exception as e:
            errors.append(f"write {out_path.name}: {e}")
            continue
        counts[lang] = len(merged)

    # Only remove .txt.zst sources after a successful write pass.
    if counts or not errors:
        for src in txt_sources:
            try:
                src.unlink()
            except OSError as e:
                errors.append(f"unlink {src.name}: {e}")

    return folder, counts, errors


def find_targets(base: Path) -> list[Path]:
    if base.name == "localization":
        return [base]
    if (base / "localization").is_dir() and base.name != "versions":
        return [base / "localization"]
    out: list[Path] = []
    for child in sorted(base.iterdir()):
        if not child.is_dir():
            continue
        loc = child / "localization"
        if loc.is_dir():
            out.append(loc)
    return out


def main(argv: list[str]) -> int:
    base = Path(argv[1]).resolve() if len(argv) > 1 else VERSIONS
    if not base.exists():
        print(f"not found: {base}", file=sys.stderr)
        return 1

    folders = find_targets(base)
    print(f"merging {len(folders)} folder(s) under {base}")

    done = 0
    with ProcessPoolExecutor() as ex:
        futs = [ex.submit(merge_folder, f) for f in folders]
        for fut in as_completed(futs):
            folder, counts, errors = fut.result()
            done += 1
            tag = f"[{done}/{len(folders)}]"
            if errors:
                print(f"{tag} {folder.relative_to(base.parent)}: {len(counts)} langs, {len(errors)} errors")
                for e in errors:
                    print(f"    ! {e}")
            else:
                print(f"{tag} {folder.relative_to(base.parent)}: {len(counts)} langs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
