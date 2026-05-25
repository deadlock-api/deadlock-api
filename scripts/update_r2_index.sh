#!/usr/bin/env bash
# Build an index.json.zst file tree for each asset folder and upload it to R2.
set -euo pipefail

REMOTE="R2:assets/assets-api-res"
PUBLIC="https://assets-bucket.deadlock-api.com/assets-api-res"

# Reads a file list on stdin, prints a nested file-tree JSON (args: folder, url-prefix).
# sounds: key without extension, prefer .mp3 over .wav. others: key with extension, skip .bak.
BUILD=$(cat <<'PY'
import json, os, sys
folder, prefix = sys.argv[1], sys.argv[2]
paths = [l.strip() for l in sys.stdin if l.strip()]
if folder == "sounds":
    mp3 = {os.path.splitext(p)[0] for p in paths if p.lower().endswith(".mp3")}
    paths = [p for p in paths if p.lower().endswith(".mp3")
             or (p.lower().endswith(".wav") and os.path.splitext(p)[0] not in mp3)]
    key = lambda fn: os.path.splitext(fn)[0]
else:
    paths = [p for p in paths if not p.lower().endswith(".bak")]
    key = lambda fn: fn
tree = {}
for p in paths:
    *dirs, fn = p.split("/")
    node = tree
    for d in dirs:
        node = node.setdefault(d, {})
    node[key(fn)] = prefix + p
json.dump(tree, sys.stdout, separators=(",", ":"), ensure_ascii=False)
PY
)

for folder in sounds images icons fonts; do
  echo ">> $folder"
  rclone lsf -R --files-only "$REMOTE/$folder/" \
    | python3 -c "$BUILD" "$folder" "$PUBLIC/$folder/" > index.json
  zstd -q -19 -f index.json -o index.json.zst
  rclone copyto index.json.zst "$REMOTE/$folder/index.json.zst"
done

rm -f index.json index.json.zst

STEAM_INFO=$(cat <<'PY'
import json, os, sys
from glob import glob
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
out = []
for path in glob(os.path.join(sys.argv[1], "*.inf")):
    raw = dict(map(str.strip, l.split("=", 1)) for l in open(path) if "=" in l)
    mon, day, year = raw["VersionDate"].split()
    out.append({
        "client_version": int(raw["ClientVersion"]),
        "server_version": int(raw["ServerVersion"]),
        "product_name": raw["ProductName"],
        "app_id": int(raw["appID"]),
        "server_app_id": int(raw["ServerAppID"]),
        "tools_app_id": int(raw["ToolsAppID"]),
        "source_revision": int(raw["SourceRevision"]),
        "version_date": raw["VersionDate"],
        "version_time": raw["VersionTime"],
        "version_datetime": f"{year}-{MONTHS.index(mon) + 1:02d}-{day}T{raw['VersionTime']}",
    })
out.sort(key=lambda i: i["client_version"], reverse=True)
json.dump(out, sys.stdout, separators=(",", ":"))
PY
)

echo ">> steam-info"
tmp=$(mktemp -d)
rclone lsf --dirs-only "$REMOTE/versions/" | while read -r d; do
  v="${d%/}"
  rclone cat "$REMOTE/versions/$v/steam.inf.zst" 2>/dev/null | zstd -dq > "$tmp/$v.inf" || rm -f "$tmp/$v.inf"
done
python3 -c "$STEAM_INFO" "$tmp" > steam_info_all.json
zstd -q -19 -f steam_info_all.json -o steam_info_all.json.zst
rclone copyto steam_info_all.json.zst "$REMOTE/steam-info/all.json.zst"

rm -rf "$tmp" steam_info_all.json steam_info_all.json.zst
