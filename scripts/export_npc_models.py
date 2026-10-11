"""Export every model referenced by npc_units.vdata as web-ready GLBs.

Same output layout and compaction as export_hero_models.py:
``<out>/<model path below models/, without .vmdl>/<pose>.glb``, published
through the same models index. NPC units have no UI poses, so each model gets
one of two poses:

- ``idle``: the model's idle clip baked in (troopers, guardians, walkers,
  patrons, the mid boss, neutrals, ...).
- ``default``: no animation, for models without an idle clip (static props,
  the zipline container, ...). Skinned parts render at their bind pose.

Clip names aren't uniform across NPC models (``idle``, ``idle_01``,
``boss_tier1_stand_idle``, ``models/.../clips/primary_idle``, ...), so the
models are first probed with every animation (no materials, cheap) and the
first IDLE_CLIPS entry matching a clip name (or its last path segment) wins.

Usage: export_npc_models.py <Source2Viewer-CLI> <gltf-transform> <pak01_dir.vpk>
                            <npc_units.vdata> <out dir>
"""

import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from export_hero_models import (
    export,
    glb_animations,
    hidden_meshes,
    optimize,
    read_glb,
    strip_meshes,
    write_glb,
)

# Idle clip names, most preferred first. Unit-specific names lead so a model
# with several idles (the Walker's shielded / unshielded, the lanterns'
# lantern / grounded) picks the one it spawns in.
IDLE_CLIPS = [
    "boss_tier1_stand_idle",
    "shielded_idle",
    "patron_sapphire_phase1_idle",
    "lantern_idle",
    "underhand_hover_idle",
    "bookmoth_idle",
    "turret_idle",
    "familiar_helper_idle",
    "strangling_gloom_spiderling_anim_idle",
    "cowboy_launchpad_idle",
    "idle",
    "idle_01",
    "idle_no_target",
    "primary_idle_no_target",
    "primary_idle",
    "stand_idle",
    "primary_stand_idle",
    "sit_idle",
]

# Every model a unit references: `m_sModelName`, the per-team
# `m_sAmberModelName` / `m_sSapphireModelName` (troopers, shrines), the
# Patron's `m_AmberEffigyModel` / `m_SapphCoreModel` / ..., `m_hModel`, ...
# Not `m_strWIPModelName`: work-in-progress models aren't shipped.
MODEL_RE = re.compile(r'\b(?!m_strWIPModelName\b)\w+\s*=\s*resource_name:"([^"]+\.vmdl)"')


def idle_clip(clips: list[str]) -> str | None:
    """The preferred idle clip among `clips` (exact names, as exported)."""
    for candidate in IDLE_CLIPS:
        matches = [c for c in clips if c.rsplit("/", 1)[-1] == candidate]
        if matches:
            # Prefer the sequence (`idle`) over its source clip path.
            return min(matches, key=lambda c: "/" in c)
    return None


def keep_animation(glb: Path, clip: str) -> None:
    """Drop every animation but `clip`; `optimize` prunes their data.

    `--gltf_animation_list` also matches a sequence's source clip path, so
    `idle` exports both `idle` and `models/.../clips/idle`.
    """
    gltf, rest = read_glb(glb)
    gltf["animations"] = [a for a in gltf.get("animations", []) if a.get("name") == clip]
    write_glb(glb, gltf, rest)


def prepare(s2v: str, vpk: str, model: str, clip: str | None, glb: Path) -> None:
    """Trim the raw export of `model` to `clip` and its default mesh groups."""
    if clip:
        keep_animation(glb, clip)
    if hidden := hidden_meshes(s2v, vpk, model):
        strip_meshes(glb, hidden)


def main() -> int:
    s2v, gltf_transform, vpk, vdata, out_dir = sys.argv[1:6]
    out = Path(out_dir)
    models = sorted(set(MODEL_RE.findall(Path(vdata).read_text(encoding="utf-8"))))
    print(f"{len(models)} NPC unit models referenced by npc_units.vdata")

    with tempfile.TemporaryDirectory() as tmp:
        probe = Path(tmp, "probe")
        export(s2v, vpk, models, None, probe, materials=False)
        by_clip: dict[str | None, list[str]] = defaultdict(list)
        for model in models:
            glb = probe / model.replace(".vmdl", ".glb")
            if not glb.is_file():
                print(f"  ! {model}: not in the game files, skipping")
                continue
            by_clip[idle_clip(glb_animations(glb))].append(model)

        jobs: list[tuple[str, str | None, Path, Path]] = []
        for i, (clip, group) in enumerate(by_clip.items()):
            raw = Path(tmp, str(i))
            export(s2v, vpk, group, [clip] if clip else [], raw)
            pose = "idle" if clip else "default"
            for model in group:
                dst = out / model.removeprefix("models/").removesuffix(".vmdl") / f"{pose}.glb"
                jobs.append((model, clip, raw / model.replace(".vmdl", ".glb"), dst))

        def compact(job: tuple[str, str | None, Path, Path]) -> None:
            model, clip, glb, dst = job
            try:
                prepare(s2v, vpk, model, clip, glb)
                optimize(gltf_transform, glb, dst)
            except (OSError, subprocess.CalledProcessError):
                # Source2Viewer's parallel texture packing occasionally throws
                # (NullReferenceException in TextureExtract.CopyChannel) and
                # leaves a broken GLB: export the model again on its own.
                print(f"  ! {model}: broken export, retrying")
                retry = Path(tmp, "retry", model.removesuffix(".vmdl"))
                export(s2v, vpk, [model], [clip] if clip else [], retry)
                glb = retry / model.replace(".vmdl", ".glb")
                prepare(s2v, vpk, model, clip, glb)
                optimize(gltf_transform, glb, dst)

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(compact, jobs))

    # `out` is shared with the hero models, count only ours.
    written = [dst for *_, dst in jobs]
    total = sum(p.stat().st_size for p in written)
    print(f"Wrote {len(written)} model GLBs ({total / 1e6:.1f} MB) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
