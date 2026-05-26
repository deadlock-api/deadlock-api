#!/usr/bin/env bash
set -euo pipefail

# All-in-one assets pipeline. Refreshes EVERYTHING the API reads from R2:
#
#   1. Download DepotDownloader + Source2Viewer-CLI tooling.
#   2. Download the Deadlock game files from Steam.
#   3. Extract the required VPK contents.
#   4. Build the versions/<build>/ folder (vdata/css/steam.inf/localization,
#      zstd-compressed) from the extracted files.
#   5. Extract + process the media assets (images/icons/fonts/sounds/videos).
#   6. Upload the media assets to R2.
#   7. Upload the versions/<build>/ folder to R2.
#   8. Rebuild the R2 indexes (per-folder index.json.zst + steam-info/all.json.zst)
#      so freshly uploaded assets are discoverable. This ALWAYS runs after an
#      asset update — the index must never drift from what's in the bucket.
#
# Requires: wget/curl, unzip, zstd, uv, rclone, convert (ImageMagick),
#           ffmpeg, python3, and Steam credentials in the environment.
#
# Environment:
#   STEAM_USERNAME / STEAM_PASSWORD  Steam login for the depot download.
#   R2_BUCKET                        R2 bucket name (default: assets).
#   An rclone remote named "R2" must exist (config file or RCLONE_CONFIG_R2_*
#   env vars). CI wires it up from the R2_* secrets.
#
# Run:  bash scripts/build_version_and_upload.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# All build artifacts (tooling, depots, extracted files, processed media) live
# here so they never pollute the repo. Override with WORK_DIR=... for caching.
WORK_DIR="${WORK_DIR:-$REPO_ROOT/.assets-build}"
mkdir -p "$WORK_DIR"

# R2 destination. The bucket is configurable; everything lives under the
# assets-api-res/ prefix that the API reads.
BUCKET="${R2_BUCKET:-assets}"
REMOTE="R2:${BUCKET}/assets-api-res"
PUBLIC="https://assets-bucket.deadlock-api.com/assets-api-res"

# Only these CSS basenames are referenced by the API code or res/ assets.
KEEP_CSS=(
    ability_icons.css
    ability_property_icons.css
    citadel_base_styles.css
    citadel_popup_roster_select.css
    hero_background_default.css
    objectives_map.css
)

# The API only loads these vdata files.
KEEP_VDATA=(
    generic_data.vdata
    loot_tables.vdata
    heroes.vdata
    abilities.vdata
    accolades.vdata
    npc_units.vdata
    misc.vdata
)

# Localization categories to pull into the versions folder.
LOCALIZATION_DIRS=(
    citadel_gc
    citadel_heroes
    citadel_mods
    citadel_main
    citadel_vdata/accolades
    citadel_attributes
    citadel_gc_hero_names
    citadel_gc_mod_names
)

# Helper to check commands
check_cmd() {
    if ! command -v "$1" &> /dev/null; then
        echo "Error: $1 is not installed. Please install it."
        exit 1
    fi
}

for cmd in unzip zstd uv rclone convert ffmpeg python3 rsync; do
    check_cmd "$cmd"
done

# Parallelism + portable hashing helpers (used by media processing).
if command -v nproc >/dev/null 2>&1; then JOBS=$(nproc); else JOBS=$(sysctl -n hw.ncpu 2>/dev/null || echo 4); fi
if command -v sha256sum >/dev/null 2>&1; then HASH_CMD="sha256sum"; else HASH_CMD="shasum -a 256"; fi
export HASH_CMD

# Copy that warns instead of aborting when a source path is missing.
safe_cp() {
    if ! cp "$@" 2>/dev/null; then
        echo "Warning: skipped missing asset source: cp $*"
    fi
}

# 0. Load Environment Variables (Steam credentials, rclone remote config etc.)
if [ -f "$REPO_ROOT/.env" ]; then
    echo "Loading environment variables from .env..."
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi

cd "$WORK_DIR"

# 1. Download tooling
if [ ! -f DepotDownloader ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        curl -L -o DepotDownloader.zip "https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_3.4.0/DepotDownloader-macos-arm64.zip"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_3.4.0/DepotDownloader-linux-x64.zip -O DepotDownloader.zip
    else
        echo "Unsupported OS: $OSTYPE"
        exit 1
    fi
    unzip -o DepotDownloader.zip DepotDownloader && rm DepotDownloader.zip
    chmod +x DepotDownloader
fi

if [ ! -f Source2Viewer-CLI ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        curl -L -o Decompiler.zip "https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/19.1/cli-macos-arm64.zip"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget https://github.com/ValveResourceFormat/ValveResourceFormat/releases/download/19.1/cli-linux-x64.zip -O Decompiler.zip
    else
        echo "Unsupported OS: $OSTYPE"
        exit 1
    fi
    unzip -o Decompiler.zip && rm Decompiler.zip
    chmod +x Source2Viewer-CLI
fi

# Remove com.apple.quarantine xattr if present
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Removing com.apple.quarantine xattr from files"
    find . -type f | while read -r file; do
        if xattr -p com.apple.quarantine "$file" &>/dev/null; then
            echo "Removing quarantine attribute from: $file"
            xattr -d com.apple.quarantine "$file"
        fi
    done
fi

# 2. Download Deadlock Game files (only the pak01 VPK set + steam.inf).
if [ -z "${STEAM_USERNAME:-}" ] || [ -z "${STEAM_PASSWORD:-}" ]; then
    echo "Error: STEAM_USERNAME and STEAM_PASSWORD must be set to download game files."
    exit 1
fi
# pak01 holds the vdata/css/media we extract; steam.inf is the build manifest;
# the localization .txt files are LOOSE in the depot (not inside pak01), so they
# must be listed explicitly or the versions/ folder ships without localization.
cat > filelist.txt <<'EOF'
regex:citadel/pak01_.*\.vpk$
regex:citadel/steam\.inf$
regex:citadel/resource/localization/.*\.txt$
EOF
echo "Downloading Deadlock game files (windows depot, pak01 only)..."
./DepotDownloader -app 1422450 -os windows -filelist filelist.txt -validate -remember-password \
    -username "$STEAM_USERNAME" -password "$STEAM_PASSWORD" || exit 1

mkdir -p depots/game
rsync -av depots/*/*/game/* depots/game/
find depots/ -type d -empty -delete

# 3. Extract VPKs (stdout is a per-file flood; silence it, keep stderr for errors)
citadel_folder="depots/game/citadel"

for filter in scripts resource panorama materials/minimap sounds; do
    echo "Extracting $filter from pak01_dir.vpk..."
    ./Source2Viewer-CLI -i "$citadel_folder"/pak01_dir.vpk -d --threads 8 -o "$citadel_folder" -f "$filter" > /dev/null
done

# 4. Build the versions/<build>/ folder structure
if [ ! -f "$citadel_folder/steam.inf" ]; then
    echo "Error: steam.inf not found after extraction."
    exit 1
fi
BUILD=$(grep "ClientVersion" "$citadel_folder/steam.inf" | cut -d= -f2 | tr -d '[:space:]')
if [ -z "$BUILD" ]; then
    echo "Error: could not determine ClientVersion from steam.inf."
    exit 1
fi
echo "Building versions/ folder for build $BUILD"

VERSION_DIR="versions/$BUILD"
rm -rf "$VERSION_DIR"
mkdir -p "$VERSION_DIR/scripts" "$VERSION_DIR/styles" "$VERSION_DIR/localization"

# steam.inf
cp "$citadel_folder/steam.inf" "$VERSION_DIR/"

# vData files
for f in "${KEEP_VDATA[@]}"; do
    if [ -f "$citadel_folder/scripts/$f" ]; then
        cp "$citadel_folder/scripts/$f" "$VERSION_DIR/scripts/"
    else
        echo "Warning: scripts/$f missing, skipping."
    fi
done

# CSS files
for f in "${KEEP_CSS[@]}"; do
    src=$(find "$citadel_folder/panorama/styles" -type f -name "$f" | head -n 1)
    if [ -n "$src" ]; then
        cp "$src" "$VERSION_DIR/styles/"
    else
        echo "Warning: $f not found under panorama/styles, skipping."
    fi
done

# Localization (raw per-language KeyValues .txt files)
for d in "${LOCALIZATION_DIRS[@]}"; do
    if [ -d "$citadel_folder/resource/localization/$d" ]; then
        cp -r "$citadel_folder/resource/localization/$d/"* "$VERSION_DIR/localization/" 2>/dev/null || true
    fi
done

# Merge per-language localization .txt into <lang>.json.zst (drops the .txt)
echo "Merging localization for build $BUILD..."
uv run --with zstandard python "$SCRIPT_DIR/merge_localization.py" "$VERSION_DIR/localization"

# zstd-compress the remaining scripts/styles/steam.inf files (level 19)
echo "Compressing vdata/css/steam.inf..."
find "$VERSION_DIR" -type f \
    \( -name '*.vdata' -o -name '*.css' -o -name 'steam.inf' \) \
    -print0 | xargs -0 -r -P 8 -n 1 zstd -19 -q --rm

leftover=$(find "$VERSION_DIR" -type f ! -name '*.zst' | wc -l)
echo "Leftover uncompressed files in $VERSION_DIR: $leftover"

# 5. Extract + process media assets

mkdir -p icons
copy_icon() {
    local src="$1" rel
    case "$src" in
        */panorama/images/*) rel="${src#*/panorama/images/}" ;;
        *)                   rel="$(basename "$src")" ;;
    esac
    mkdir -p "icons/$(dirname "$rel")"
    cp "$src" "icons/$rel"
}
icon_list=$(mktemp)
find depots/game/ -type f -name '*.svg' -print0 >> "$icon_list"
find depots/game/ -type f -name 'keystat_*.png' -print0 >> "$icon_list"
for d in \
    depots/game/citadel/panorama/images/hud/text_images \
    depots/game/citadel/panorama/images/minimap \
    depots/game/citadel/materials/minimap; do
    [ -d "$d" ] && find "$d" -type f -name '*.png' -print0 >> "$icon_list"
done
while IFS= read -r -d '' src; do
    copy_icon "$src"
done < "$icon_list"
rm -f "$icon_list"
find icons -type f -name "*_png.*" -exec bash -c 'mv "$1" "${1/_png./.}"' _ {} \;

# Add SVGs with currentColor fill (skip the generated _unfilled variants).
find icons -type f -name '*.svg' ! -name '*_unfilled.svg' -print0 | while IFS= read -r -d '' f; do
    sed 's/fill="[^"]*"/fill="currentColor"/g' "$f" > "${f%.svg}_unfilled.svg"
done

# Fonts
mkdir -p fonts
[ -d "$citadel_folder/panorama/fonts" ] && \
    find "$citadel_folder"/panorama/fonts -type f -name '*.otf' -print0 | xargs -0 -r -n 1 cp -t fonts/

# Sounds. Source2Viewer dumps a KV3 .vsnd resource for sounds it can't decode to
# audio; those aren't playable and aren't indexed, so drop them before copying.
mkdir -p sounds
find "$citadel_folder"/sounds -type f -name '*.vsnd' -delete
safe_cp -r "$citadel_folder"/sounds/* sounds/

# Images
mkdir -p images
mkdir -p images/hud
mkdir -p images/hud/core
safe_cp -r "$citadel_folder"/panorama/images/heroes images/
safe_cp -r "$citadel_folder"/panorama/images/hud/*.png images/hud/
safe_cp -r "$citadel_folder"/panorama/images/hud/*/*.png images/hud/core/
safe_cp "$citadel_folder"/panorama/images/hud/hero_portraits/* images/heroes/
safe_cp "$citadel_folder"/panorama/images/*.* images/
safe_cp -r "$citadel_folder"/panorama/images/hud/hero_portraits images/hud/
safe_cp -r "$citadel_folder"/panorama/images/items/ images/
safe_cp -r "$citadel_folder"/panorama/images/shop/ images/
safe_cp -r "$citadel_folder"/panorama/images/main_menu/ images/
mkdir -p images/materials
safe_cp "$citadel_folder"/materials/citadel_loading*.png images/materials/

mkdir -p images/abilities
safe_cp -r "$citadel_folder"/panorama/images/hud/abilities images/
safe_cp -r "$citadel_folder"/panorama/images/upgrades images/

mkdir -p images/maps
safe_cp -r "$citadel_folder"/panorama/images/minimap/base/* images/maps/

mkdir -p images/ranks
safe_cp -r "$citadel_folder"/panorama/images/ranked/badges/* images/ranks/

# Generate webp images
find images -type f -name "*.png" -print0 | xargs -0 -P 24 -I {} sh -c '
        base_name=$(basename "{}")
        dir_name=$(dirname "{}")
        file_name="${base_name%.png}"
        new_file_name="${file_name}.webp"
        new_file_path="$dir_name/$new_file_name"
        convert -quality 50 -define webp:lossless=true "{}" "$new_file_path"
        echo "Converted to webp: $new_file_path"
    '

# Rename Images, replace "_psd." and "_png." with "."
find images -type f -name "*_psd.*" -exec bash -c 'mv "$1" "${1/_psd./.}"' _ {} \;
find images -type f -name "*_psd_128.*" -exec bash -c 'mv "$1" "${1/_psd_128./.}"' _ {} \;
find images -type f -name "*_png.*" -exec bash -c 'mv "$1" "${1/_png./.}"' _ {} \;

# Videos: transcode webm -> h264 mp4, skipping when the source sha256 is unchanged.
mkdir -p videos
safe_cp -r "$citadel_folder"/panorama/videos/hero_abilities videos/
HASH_DIR="$WORK_DIR/.video-hashes"
mkdir -p "$HASH_DIR"
export HASH_DIR
find videos -type f -name "*.webm" -print0 | \
    xargs -P 2 -0 -I {} sh -c '
        video_file="$1"
        mp4_file="${video_file%.webm}_h264.mp4"
        hash_file="$HASH_DIR/$(echo "$video_file" | tr "/" "_").sha256"
        cur=$($HASH_CMD "$video_file" | cut -d" " -f1)
        if [ -f "$mp4_file" ] && [ "$(cat "$hash_file" 2>/dev/null)" = "$cur" ]; then
            echo "Skipping unchanged video: $video_file"
        else
            echo "Converting $video_file -> $mp4_file"
            ffmpeg -nostdin -loglevel error -i "$video_file" -c:v libx264 -crf 23 -y "$mp4_file" \
                && printf "%s\n" "$cur" > "$hash_file"
        fi
    ' _ {}

# 5b. Validate the build before uploading ANYTHING to R2. A partial or broken
# build (e.g. missing localization, empty media) must never reach the bucket and
# poison the version, so fail hard here instead.
echo "Validating build $BUILD before upload..."
errors=0
fail() { echo "  ✗ $1"; errors=$((errors + 1)); }

[ -s "$VERSION_DIR/steam.inf.zst" ] || fail "missing steam.inf.zst"

for f in "${KEEP_VDATA[@]}"; do
    [ -s "$VERSION_DIR/scripts/$f.zst" ] || fail "missing scripts/$f.zst"
done
for f in "${KEEP_CSS[@]}"; do
    [ -s "$VERSION_DIR/styles/$f.zst" ] || fail "missing styles/$f.zst"
done

# Localization is the part that silently broke before: require english plus a
# handful of other languages, and confirm english parses to a non-trivial map.
loc_count=$(find "$VERSION_DIR/localization" -name '*.json.zst' 2>/dev/null | wc -l)
[ "$loc_count" -ge 5 ] || fail "only $loc_count localization language file(s) (expected >= 5)"
if [ -s "$VERSION_DIR/localization/english.json.zst" ]; then
    keys=$(zstd -dqc "$VERSION_DIR/localization/english.json.zst" \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d) if isinstance(d, dict) else 0)' 2>/dev/null || echo 0)
    [ "$keys" -ge 100 ] || fail "english.json has only $keys key(s) (expected >= 100)"
else
    fail "missing localization/english.json.zst"
fi

# Media sanity: extraction must have produced the core asset types.
[ -n "$(find images -type f -name '*.webp' -print -quit 2>/dev/null)" ] || fail "no images/*.webp produced"
[ -n "$(find sounds -type f -name '*.mp3'  -print -quit 2>/dev/null)" ] || fail "no sounds/*.mp3 produced"
[ -n "$(find icons  -type f -name '*.svg'  -print -quit 2>/dev/null)" ] || fail "no icons/*.svg produced"
[ -n "$(find fonts  -type f -name '*.otf'  -print -quit 2>/dev/null)" ] || fail "no fonts/*.otf produced"

if [ "$errors" -gt 0 ]; then
    echo "Build validation failed with $errors error(s); aborting before any upload."
    exit 1
fi
echo "Build validation passed."

# 6. Upload media assets to R2
echo "Uploading media assets to R2..."
rclone copy -P -c --transfers 8 --checkers 8 images/ "$REMOTE/images/"
rclone copy -P -c --transfers 8 --checkers 8 icons/ "$REMOTE/icons/"
rclone copy -P -c --transfers 8 --checkers 8 sounds/ "$REMOTE/sounds/"
rclone copy -P -c --transfers 8 --checkers 8 videos/ "$REMOTE/videos/"
rclone copy -P -c --transfers 8 --checkers 8 fonts/ "$REMOTE/fonts/"

# 7. Upload the versioned source files (vdata/css/steam.inf/localization) to R2
echo "Uploading versions/$BUILD to R2..."
rclone copy -P -c --transfers 8 --checkers 8 "$VERSION_DIR/" "$REMOTE/versions/$BUILD/"

# 8. Update the R2 indexes. Indexes are additive (files are never deleted), so
# download the current index and merge in just this build's files instead of
# re-listing the whole bucket / re-reading every version each run.
echo "Updating R2 indexes..."

# Merge a file list (stdin, paths relative to the folder) into an existing
# index tree (argv: folder, url-prefix, existing-index-json-path).
# sounds: key without extension, prefer .mp3 over .wav. others: key with ext, skip .bak.
MERGE_INDEX=$(cat <<'PY'
import json, os, sys
folder, prefix, existing = sys.argv[1], sys.argv[2], sys.argv[3]
tree = {}
if os.path.exists(existing) and os.path.getsize(existing) > 0:
    try:
        tree = json.load(open(existing))
    except Exception:
        tree = {}
paths = [l.strip() for l in sys.stdin if l.strip()]
if folder == "sounds":
    mp3 = {os.path.splitext(p)[0] for p in paths if p.lower().endswith(".mp3")}
    paths = [p for p in paths if p.lower().endswith(".mp3")
             or (p.lower().endswith(".wav") and os.path.splitext(p)[0] not in mp3)]
    key = lambda fn: os.path.splitext(fn)[0]
else:
    paths = [p for p in paths if not p.lower().endswith(".bak")]
    key = lambda fn: fn
for p in paths:
    *dirs, fn = p.split("/")
    node = tree
    for d in dirs:
        nxt = node.get(d)
        if not isinstance(nxt, dict):
            nxt = {}
            node[d] = nxt
        node = nxt
    node[key(fn)] = prefix + p
json.dump(tree, sys.stdout, separators=(",", ":"), ensure_ascii=False)
PY
)

# folder:local-dir pairs. Every index is incremental: seed from the current
# bucket index and merge in this build's files. The icons index was first built
# fresh on the new nested layout (replacing the old flat entries); from then on
# it accumulates like the others.
for pair in sounds:sounds images:images icons:icons fonts:fonts; do
    folder="${pair%%:*}"; localdir="${pair##*:}"
    echo ">> index: $folder"
    rclone cat "$REMOTE/$folder/index.json.zst" 2>/dev/null | zstd -dq > current_index.json 2>/dev/null || true
    ( cd "$localdir" && find . -type f ) | sed 's#^\./##' \
        | python3 -c "$MERGE_INDEX" "$folder" "$PUBLIC/$folder/" current_index.json > index.json
    zstd -q -19 -f index.json -o index.json.zst
    rclone copyto index.json.zst "$REMOTE/$folder/index.json.zst"
    rm -f current_index.json index.json index.json.zst
done

# Parse the given steam.inf files, merge them into the existing array (argv1,
# may be empty/missing) keyed by client_version, and emit newest-first.
STEAM_INFO=$(cat <<'PY'
import json, os, sys
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
def parse(path):
    raw = dict(map(str.strip, l.split("=", 1)) for l in open(path) if "=" in l)
    mon, day, year = raw["VersionDate"].split()
    return {
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
    }
existing = sys.argv[1]
by_ver = {}
if existing and os.path.exists(existing) and os.path.getsize(existing) > 0:
    try:
        by_ver = {e["client_version"]: e for e in json.load(open(existing))}
    except Exception:
        by_ver = {}
for p in sys.argv[2:]:
    try:
        e = parse(p); by_ver[e["client_version"]] = e
    except Exception as ex:
        print(f"skip {os.path.basename(p)}: {ex}", file=sys.stderr)
out = sorted(by_ver.values(), key=lambda i: i["client_version"], reverse=True)
json.dump(out, sys.stdout, separators=(",", ":"))
PY
)

echo ">> index: steam-info"
if rclone cat "$REMOTE/steam-info/all.json.zst" 2>/dev/null | zstd -dq > all_current.json 2>/dev/null && [ -s all_current.json ]; then
    zstd -dqc "$VERSION_DIR/steam.inf.zst" > new_steam.inf
    python3 -c "$STEAM_INFO" all_current.json new_steam.inf > steam_info_all.json
    rm -f new_steam.inf
else
    echo "   no existing steam-info index; rebuilding from all versions on R2"
    sitmp=$(mktemp -d)
    rclone lsf --dirs-only "$REMOTE/versions/" | while read -r d; do
        v="${d%/}"
        rclone cat "$REMOTE/versions/$v/steam.inf.zst" 2>/dev/null | zstd -dq > "$sitmp/$v.inf" || rm -f "$sitmp/$v.inf"
    done
    python3 -c "$STEAM_INFO" "" "$sitmp"/*.inf > steam_info_all.json
    rm -rf "$sitmp"
fi
zstd -q -19 -f steam_info_all.json -o steam_info_all.json.zst
rclone copyto steam_info_all.json.zst "$REMOTE/steam-info/all.json.zst"
rm -f all_current.json steam_info_all.json steam_info_all.json.zst

echo "Done. Built versions/$BUILD, uploaded all assets, and updated R2 indexes."
