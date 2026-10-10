"""Export every hero model referenced by heroes.vdata as web-ready GLBs.

Each model is exported once per pose in POSES and written to
``<out>/<model path below models/, without .vmdl>/<pose>.glb`` (e.g.
``heroes_wip/abrams/abrams/hero_select.glb``). The API lists a hero's poses
from the bucket's models index, so adding a pose here is all it takes to
publish it.

A pose is a single animation clip baked into the GLB alongside the skeleton.
Weapons and props (Abrams' gun and book, ...) are skinned to bones whose bind
pose sits at the origin, so a model without an animation renders them at the
hero's feet. Clip names differ per hero, hence an ordered candidate list per
pose; models matching none of a pose's candidates are skipped for that pose.

Source2Viewer exports every mesh of the model, including the ones in mesh
groups (bodygroups) the game hides by default, like Baba's spare teapot and
flying pigeon. Those are dropped by the model's default mesh group mask.
(Source2Viewer's own --gltf_mesh_list is broken in 19.1: it matches the model's
file name, not the mesh name.)

The raw Source2Viewer export (~5-40 MB, external PNG textures) is compacted by
gltf-transform into one self-contained GLB (meshopt geometry, WebP textures
capped at 2048px, ~1-5 MB).

Usage: export_hero_models.py <Source2Viewer-CLI> <gltf-transform> <pak01_dir.vpk>
                             <heroes.vdata> <out dir>
"""

import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# pose name -> animation clip names, most preferred first.
POSES: dict[str, list[str]] = {
    # The hero select screen pose. Not every hero has `ui_hero_select` (or
    # Source2Viewer doesn't find it), so fall back to their other UI poses,
    # then to a plain standing idle.
    "hero_select": [
        "ui_hero_select",
        "ui_hero_pose",
        "ui_pose",
        "hero_roster_pose",
        # Not `ui_main_menu`: that's a whole scene, it flies props metres away.
        "ui_shop",
        "shop_menu_base",
        "ui_matchmaking",
        "primary_stand_idle",
        "vampirebat_primary_stand_idle",
        "weapon_stand_idle",
        "weapon_stand_idle1",
        "weapon_idle",
        "out_of_combat_stand_idle",
        "outofcombat_stand_idle",
        "primary_idle",
        "aim_idle",
    ],
}

MODEL_RE = re.compile(r'm_strModelName\s*=\s*resource_name:"([^"]+\.vmdl)"')
MESH_RE = re.compile(r'm_Name = "([^"]+)"\s+m_nMeshIndex = (\d+)')
DEFAULT_MASK_RE = re.compile(r"m_nDefaultMeshGroupMask = (\d+)")
GROUP_MASKS_RE = re.compile(r"m_refMeshGroupMasks = \s*\[([^\]]*)\]")


def read_glb(path: Path) -> tuple[dict, bytes]:
    """The JSON chunk and the rest (the BIN chunk, header included) of a GLB."""
    data = path.read_bytes()
    json_len = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20 : 20 + json_len]), data[20 + json_len :]


def write_glb(path: Path, gltf: dict, rest: bytes) -> None:
    chunk = json.dumps(gltf, separators=(",", ":")).encode()
    chunk += b" " * (-len(chunk) % 4)
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(chunk) + len(rest))
    path.write_bytes(header + struct.pack("<I4s", len(chunk), b"JSON") + chunk + rest)


def glb_animations(path: Path) -> list[str]:
    return [a.get("name", "") for a in read_glb(path)[0].get("animations", [])]


def resource_block(s2v: str, vpk: str, model: str, block: str) -> str:
    return subprocess.run(
        [s2v, "-i", vpk, "-f", f"{model}_c", "-b", block],
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def hidden_meshes(s2v: str, vpk: str, model: str) -> set[str]:
    """Names of the model's meshes outside its default mesh groups."""
    ctrl = resource_block(s2v, vpk, model, "CTRL")
    data = resource_block(s2v, vpk, model, "DATA")
    default = DEFAULT_MASK_RE.search(data)
    masks = GROUP_MASKS_RE.search(data)
    if default is None or masks is None:
        return set()
    group_masks = [int(m) for m in re.findall(r"\d+", masks.group(1))]
    default_mask = int(default.group(1))
    return {
        name
        for name, index in MESH_RE.findall(ctrl)
        if int(index) < len(group_masks) and group_masks[int(index)] & default_mask == 0
    }


def strip_meshes(glb: Path, hidden: set[str]) -> None:
    """Detach the `hidden` meshes from their nodes; `optimize` prunes them.

    Node names are `<model>.vmdl_c.<mesh name>`.
    """
    gltf, rest = read_glb(glb)
    for node in gltf.get("nodes", []):
        if "mesh" in node and node.get("name", "").rsplit(".", 1)[-1] in hidden:
            del node["mesh"]
            node.pop("skin", None)
    write_glb(glb, gltf, rest)


def export(s2v: str, vpk: str, models: list[str], clips: list[str], out: Path) -> None:
    """Export `models` (``.vmdl`` paths) with only the animations in `clips`."""
    subprocess.run(
        [
            s2v,
            "-i", vpk,
            "-d",
            "-f", ",".join(f"{m}_c" for m in models),
            "--gltf_export_format", "glb",
            "--gltf_export_materials",
            "--gltf_textures_adapt",
            "--gltf_export_animations",
            "--gltf_animation_list", ",".join(clips),
            "--threads", "8",
            "-o", str(out),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        # Unsupported-shader stack traces are expected and non-fatal.
        stderr=subprocess.DEVNULL,
    )


def optimize(gltf_transform: str, src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            gltf_transform, "optimize", str(src), str(dst),
            "--compress", "meshopt",
            "--texture-compress", "webp",
            "--texture-size", "2048",
            "--simplify", "false",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def main() -> int:
    s2v, gltf_transform, vpk, vdata, out_dir = sys.argv[1:6]
    out = Path(out_dir)
    models = sorted(set(MODEL_RE.findall(Path(vdata).read_text(encoding="utf-8"))))
    print(f"{len(models)} hero models referenced by heroes.vdata")

    jobs: list[tuple[Path, Path]] = []
    with tempfile.TemporaryDirectory() as tmp:
        for pose, clips in POSES.items():
            raw = Path(tmp, pose)
            export(s2v, vpk, models, clips, raw)
            for model in models:
                glb = raw / model.replace(".vmdl", ".glb")
                if not glb.is_file():
                    print(f"  ! {model}: not in the game files, skipping")
                    continue
                found = set(glb_animations(glb))
                clip = next((c for c in clips if c in found), None)
                if clip is None:
                    print(f"  ! {model}: no {pose} clip ({', '.join(clips)}), skipping")
                    continue
                if len(found) > 1:
                    # Several candidates matched: re-export with only the best.
                    single = Path(tmp, f"{pose}-single")
                    export(s2v, vpk, [model], [clip], single)
                    glb = single / model.replace(".vmdl", ".glb")
                if hidden := hidden_meshes(s2v, vpk, model):
                    strip_meshes(glb, hidden)
                jobs.append((glb, out / model.removeprefix("models/").removesuffix(".vmdl") / f"{pose}.glb"))

            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda j: optimize(gltf_transform, *j), jobs))
            jobs.clear()
            shutil.rmtree(raw, ignore_errors=True)

    written = sorted(out.rglob("*.glb"))
    total = sum(p.stat().st_size for p in written)
    print(f"Wrote {len(written)} model GLBs ({total / 1e6:.1f} MB) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
