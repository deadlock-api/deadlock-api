"""Generate current Ranked badges with subrank numerals and compact rank cards.

The source badge, numeral textures and VALVEOracle font are extracted from the
current Deadlock depot by ``build_version_and_upload.sh``.  Generated files are
build artifacts uploaded to R2; no Valve assets are committed to this repo.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import zstandard as zstd
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROMAN = ("", "I", "II", "III", "IV", "V", "VI")
NUMERAL_ALPHA_CROP_THRESHOLD = 32
FALLBACK_NAMES = (
    "Obscurus",
    "Initiate",
    "Seeker",
    "Acolyte",
    "Sentinel",
    "Mystic",
    "Ritualist",
    "Emissary",
    "Oracle",
    "Phantom",
    "Ascendant",
    "Eternus",
)

# Reconstructed from the current citadel_ranked_badge.vcss_c. These are the
# full-size control offsets; the compact control uses a shared lower position.
SUBRANK_STYLE = {
    1: {"y": 46, "x": -1, "size": 30, "color": "#000000", "shadow": "#785631", "blur": 0},
    2: {"y": 52, "x": -2, "size": 30, "color": "#000000", "shadow": "#7c6e63", "blur": 0},
    3: {"y": 36, "x": -1, "size": 30, "color": "#000000", "shadow": "#8b9092", "blur": 0},
    4: {"y": 40, "x": -2, "size": 30, "color": "#000000", "shadow": "#a57941", "blur": 0},
    5: {"y": 48, "x": -2, "size": 30, "color": "#000000", "shadow": "#b9d0e0", "blur": 0},
    6: {"y": 40, "x": -1, "size": 30, "color": "#000000", "shadow": "#ddb854", "blur": 0},
    7: {"y": 50, "x": -1, "size": 30, "color": "#050a27", "shadow": "#e3eade", "blur": 4},
    8: {"y": 48, "x": -1, "size": 30, "color": "#596170", "shadow": "#d7e1eb", "blur": 0},
    9: {"y": 77, "x": 0, "size": 24, "color": "#000000", "shadow": "#d2dcef", "blur": 0},
    10: {"y": 76, "x": 0, "size": 24, "color": "#000000", "shadow": "#f2fed6", "blur": 0},
    11: {"y": 76, "x": 0, "size": 24, "color": "#000000", "shadow": "#fafdfc", "blur": 0},
}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ranks-dir", type=Path, required=True)
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--localization", type=Path, required=True)
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="defaults to <ranks-dir>/generated",
    )
    return parser.parse_args()


def _load_localization(path: Path) -> dict[str, str]:
    raw = path.read_bytes()
    if path.suffix == ".zst":
        raw = zstd.ZstdDecompressor().decompress(raw)
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError(f"localization is not an object: {path}")
    return {str(key): str(text) for key, text in value.items()}


def _rank_name(localization: dict[str, str], tier: int) -> str:
    return (
        localization.get(f"Citadel_ranks_{tier}")
        or localization.get(f"Citadel_ranks_rank{tier}")
        or FALLBACK_NAMES[tier]
    ).strip()


def _find_badge(ranks_dir: Path, tier: int) -> Path:
    candidates = (
        ranks_dir / f"rank{tier:02}_lg_psd.png",
        ranks_dir / f"rank{tier:02}_lg.png",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"current badge for tier {tier} not found in {ranks_dir}")


def _find_numeral(ranks_dir: Path, subrank: int) -> Path:
    patterns = (
        f"**/*numeral_{subrank:02}*.png",
        f"**/*numeral{subrank:02}*.png",
    )
    for pattern in patterns:
        matches = sorted(
            path for path in ranks_dir.glob(pattern) if "generated" not in path.parts
        )
        if matches:
            return matches[0]
    raise FileNotFoundError(f"numeral {subrank} not found in {ranks_dir}")


def _contain(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = source.convert("RGBA")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def _tinted_numeral(source: Image.Image, color: str, height: int, opacity: float = 1.0) -> Image.Image:
    alpha = source.convert("RGBA").getchannel("A")
    # The exported textures contain very faint alpha data extending to the
    # right edge of the original 512 px canvas (especially numeral_01). Using
    # getbbox() directly would treat that residue as part of the glyph and
    # visibly push the roman numeral left. Measure the visible silhouette, then
    # crop the original antialiased alpha so every numeral is centered by its
    # actual shape.
    visible = alpha.point(
        lambda value: 255 if value >= NUMERAL_ALPHA_CROP_THRESHOLD else 0
    )
    bounds = visible.getbbox()
    if bounds is None:
        raise ValueError("numeral has no visible alpha pixels")
    alpha = alpha.crop(bounds)
    width = max(1, round(alpha.width * height / alpha.height))
    alpha = alpha.resize((width, height), Image.Resampling.LANCZOS)
    if opacity != 1.0:
        alpha = alpha.point(lambda value: round(value * opacity))
    layer = Image.new("RGBA", alpha.size, color)
    layer.putalpha(alpha)
    return layer


def _center_layer(canvas: Image.Image, layer: Image.Image, center_x: int, center_y: int) -> None:
    canvas.alpha_composite(layer, (round(center_x - layer.width / 2), round(center_y - layer.height / 2)))


def _compose_badge(
    badge_source: Image.Image,
    numeral_source: Image.Image | None,
    tier: int,
    *,
    compact: bool,
) -> Image.Image:
    size = 256
    badge = _contain(badge_source, (size, size))
    if tier == 0:
        return badge
    if numeral_source is None:
        raise ValueError("ranked badge needs a numeral")

    style = SUBRANK_STYLE[tier]
    numeral_height = 48 if compact else round(style["size"] * 0.7)
    center_x = size // 2 + (-2 if compact else style["x"])
    center_y = size // 2 + (48 if compact else style["y"])
    foreground = _tinted_numeral(numeral_source, style["color"], numeral_height)
    shadow = _tinted_numeral(numeral_source, style["shadow"], numeral_height, 0.55)
    if style["blur"]:
        shadow = shadow.filter(ImageFilter.GaussianBlur(style["blur"]))

    result = Image.new("RGBA", (size, size))
    result.alpha_composite(badge)
    _center_layer(result, shadow, center_x, center_y + 1)
    _center_layer(result, foreground, center_x, center_y)
    return result


def _fit_font(font_path: Path, text: str, max_width: int, max_height: int) -> ImageFont.FreeTypeFont:
    size = 40
    while size > 8:
        font = ImageFont.truetype(str(font_path), size)
        bounds = font.getbbox(text, stroke_width=0)
        if bounds[2] - bounds[0] <= max_width and bounds[3] - bounds[1] <= max_height:
            return font
        size -= 1
    return ImageFont.truetype(str(font_path), size)


def _draw_centered_text(
    canvas: Image.Image,
    text: str,
    font_path: Path,
    center: tuple[int, int],
    limits: tuple[int, int],
) -> None:
    font = _fit_font(font_path, text, *limits)
    draw = ImageDraw.Draw(canvas)
    bounds = draw.textbbox((0, 0), text, font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    position = (round(center[0] - width / 2 - bounds[0]), round(center[1] - height / 2 - bounds[1]))
    draw.text(position, text, font=font, fill="#e9e3d6")


def _compose_card(
    badge_source: Image.Image,
    numeral_source: Image.Image | None,
    tier: int,
    label: str,
    font_path: Path,
    variant: str,
) -> Image.Image:
    profile = variant == "profile"
    width, height = ((360, 320) if profile else (300, 96))
    badge_size = 260 if profile else 96
    badge = _compose_badge(badge_source, numeral_source, tier, compact=not profile)
    badge = badge.resize((badge_size, badge_size), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (width, height))
    result.alpha_composite(badge, ((width - badge_size) // 2 if profile else 0, 0))
    if tier:
        _draw_centered_text(
            result,
            label,
            font_path,
            (width // 2 if profile else 198, 288 if profile else height // 2),
            (330 if profile else 190, 44 if profile else 42),
        )
    return result


def generate(
    ranks_dir: Path,
    font_path: Path,
    localization_path: Path,
    output: Path | None = None,
) -> int:
    localization = _load_localization(localization_path)
    badges = {tier: Image.open(_find_badge(ranks_dir, tier)).convert("RGBA") for tier in range(12)}
    numerals = {
        subrank: Image.open(_find_numeral(ranks_dir, subrank)).convert("RGBA")
        for subrank in range(1, 7)
    }
    output = output or ranks_dir / "generated"
    badge_output = output / "badges"
    card_output = output / "cards" / "english"
    badge_output.mkdir(parents=True, exist_ok=True)
    for variant in ("popup", "profile"):
        (card_output / variant).mkdir(parents=True, exist_ok=True)

    count = 0
    for tier in range(12):
        subranks = (0,) if tier == 0 else range(1, 7)
        for subrank in subranks:
            numeral = numerals.get(subrank)
            stem = f"rank{tier:02}_subrank{subrank}"
            if tier:
                _compose_badge(badges[tier], numeral, tier, compact=False).save(
                    badge_output / f"{stem}.png"
                )
                count += 1
            label = _rank_name(localization, tier)
            if tier:
                label = f"{label} {ROMAN[subrank]}"
            for variant in ("popup", "profile"):
                _compose_card(
                    badges[tier], numeral, tier, label, font_path, variant
                ).save(card_output / variant / f"{stem}.png")
                count += 1
    return count


def main() -> int:
    args = _parse_args()
    count = generate(args.ranks_dir, args.font, args.localization, args.output_dir)
    print(f"Generated {count} ranked badge/card PNGs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
