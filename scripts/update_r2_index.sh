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
