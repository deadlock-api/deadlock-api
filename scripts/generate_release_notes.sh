#!/usr/bin/env bash
set -euo pipefail

# Publish deterministic release notes for an assets build as a GitHub release.
# Diffs heroes/items via the public API and summarises vdata line changes (from
# R2) between the previous and the new build. Secondary to the upload, so it is
# written to fail soft.
#
# Usage: generate_release_notes.sh [NEW_BUILD] [PREV_BUILD]
#   Both default to the two highest version dirs on R2.
# Env: R2_BUCKET (default assets), API_BASE, REPO, GH_TOKEN, DRY_RUN.

BUCKET="${R2_BUCKET:-assets}"
REMOTE="R2:${BUCKET}/assets-api-res"
API_BASE="${API_BASE:-https://api.deadlock-api.com}"
REPO="${REPO:-deadlock-api/deadlock-api}"
VDATA=(generic_data loot_tables heroes abilities accolades npc_units misc)

versions() {
    rclone lsf --dirs-only "$REMOTE/versions/" | sed 's#/$##' | grep -E '^[0-9]+$' | sort -n
}

NEW="${1:-$(versions | tail -1)}"
PREV="${2:-$(versions | grep -v "^${NEW}$" | tail -1)}"

if [ -z "$NEW" ]; then
    echo "No versions found on R2."
    exit 0
fi
if [ -z "$PREV" ] || [ "$PREV" = "$NEW" ]; then
    echo "No previous build to diff against (new=$NEW prev=${PREV:-none}); skipping release notes."
    exit 0
fi
echo "Generating release notes: $PREV -> $NEW"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/prev" "$tmp/new"
for f in "${VDATA[@]}"; do
    rclone cat "$REMOTE/versions/$PREV/scripts/$f.vdata.zst" 2>/dev/null | zstd -dq > "$tmp/prev/$f.vdata" 2>/dev/null || true
    rclone cat "$REMOTE/versions/$NEW/scripts/$f.vdata.zst"  2>/dev/null | zstd -dq > "$tmp/new/$f.vdata"  2>/dev/null || true
    [ -s "$tmp/prev/$f.vdata" ] || rm -f "$tmp/prev/$f.vdata"
    [ -s "$tmp/new/$f.vdata" ]  || rm -f "$tmp/new/$f.vdata"
done

body="$tmp/body.md"
API_BASE="$API_BASE" PREV="$PREV" NEW="$NEW" VDIR="$tmp" python3 - "$body" <<'PY'
import json, os, re, sys, urllib.request
from collections import Counter

api, prev, new, vdir = (os.environ[k] for k in ("API_BASE", "PREV", "NEW", "VDIR"))
out = open(sys.argv[1], "w")

def fetch(kind, ver):
    url = f"{api}/v1/assets/{kind}?client_version={ver}"
    # A real UA is required; the API rejects the default urllib agent.
    req = urllib.request.Request(url, headers={"User-Agent": "deadlock-api-release-notes"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def nm(e):
    return e.get("name") or e.get("class_name") or str(e.get("id"))

def section(title, kind):
    out.write(f"### {title}\n\n")
    try:
        a = {e["id"]: e for e in fetch(kind, prev)}
        b = {e["id"]: e for e in fetch(kind, new)}
    except Exception as ex:
        out.write(f"_diff unavailable: {ex}_\n\n")
        return
    added = sorted(nm(b[i]) for i in b if i not in a)
    removed = sorted(nm(a[i]) for i in a if i not in b)
    changed = sum(1 for i in b if i in a and b[i] != a[i])
    if not (added or removed or changed):
        out.write("_No changes._\n\n")
        return
    if added:
        out.write(f"- **Added ({len(added)}):** " + ", ".join(added) + "\n")
    if removed:
        out.write(f"- **Removed ({len(removed)}):** " + ", ".join(removed) + "\n")
    if changed:
        out.write(f"- **Changed:** {changed}\n")
    out.write("\n")

# vdata is KV3 text whose formatting (float precision, array layout, trailing
# whitespace) varies with the extractor version and would swamp a raw line diff.
# Tokenize to a formatting-free stream (canonical numbers, no commas/whitespace),
# regroup into key=value statement lines, and diff those as multisets so only
# real content changes are counted.
_NUM = re.compile(r'^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$')

def _tokens(text):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c.isspace() or c == ',':
            i += 1; continue
        if c == '"':
            j = i + 1
            while j < n:
                if text[j] == '\\': j += 2; continue
                if text[j] == '"': j += 1; break
                j += 1
            yield text[i:j]; i = j; continue
        if c in '{}[]=':
            yield c; i += 1; continue
        j = i
        while j < n and not text[j].isspace() and text[j] not in '{}[]=,"':
            j += 1
        w = text[i:j]; i = j
        if _NUM.match(w):
            f = float(w)
            w = str(int(f)) if (f.is_integer() and '.' not in w and 'e' not in w.lower()) else repr(f)
        yield w

def canon_lines(path):
    if not os.path.exists(path):
        return []
    toks = list(_tokens(open(path, encoding="utf-8", errors="replace").read()))
    out_lines, cur = [], []
    for i, tok in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        if tok in '{}[]':                       # structural braces aren't content
            if cur: out_lines.append(" ".join(cur)); cur = []
            continue
        if tok != '=' and nxt == '=' and cur:   # next key begins
            out_lines.append(" ".join(cur)); cur = []
        cur.append(tok)
    if cur:
        out_lines.append(" ".join(cur))
    return out_lines

out.write(f"## Assets build {prev} → {new}\n\n")
section("Heroes", "heroes")
section("Items", "items")

out.write("### Source data changes (formatting-normalized)\n\n")
rows = []
for f in sorted(set(os.listdir(f"{vdir}/prev")) | set(os.listdir(f"{vdir}/new"))):
    a = Counter(canon_lines(f"{vdir}/prev/{f}"))
    b = Counter(canon_lines(f"{vdir}/new/{f}"))
    added, removed = sum((b - a).values()), sum((a - b).values())
    if added or removed:
        rows.append((f, added, removed))
if rows:
    out.write("| file | added | removed |\n|---|---:|---:|\n")
    for f, a, r in rows:
        out.write(f"| {f} | +{a} | -{r} |\n")
else:
    out.write("_No changes._\n")
out.write("\n")
out.close()
PY

echo "----- release notes -----"
cat "$body"
echo "--------------------------"

if [ -n "${DRY_RUN:-}" ]; then
    echo "(DRY_RUN set; not publishing)"
    exit 0
fi

tag="assets-$NEW"
title="Assets build $NEW"
if gh release view "$tag" -R "$REPO" >/dev/null 2>&1; then
    gh release edit "$tag" -R "$REPO" --title "$title" --notes-file "$body"
else
    gh release create "$tag" -R "$REPO" --title "$title" --notes-file "$body"
fi
echo "Published release $tag"
