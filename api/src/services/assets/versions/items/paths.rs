//! URL and string helpers for the item transform pipeline.

pub(super) const IMAGE_BASE_URL: &str =
    "https://assets-bucket.deadlock-api.com/assets-api-res/images";
pub(super) const SVGS_BASE_URL: &str =
    "https://assets-bucket.deadlock-api.com/assets-api-res/icons";
pub(super) const VIDEO_BASE_URL: &str =
    "https://assets-bucket.deadlock-api.com/assets-api-res/videos";

/// Quirk: when there's no `abilities/`/`upgrades/`/`hud/` anchor AND no
/// `{images}/` prefix AND the input doesn't end in `.svg`, the suffix
/// replacements are intentionally skipped.
pub(super) fn parse_img_path(v: Option<&str>) -> Option<String> {
    let v = v?;
    let split_index = v
        .find("abilities/")
        .or_else(|| v.find("upgrades/"))
        .or_else(|| v.find("hud/"));

    let slice: String = if let Some(idx) = split_index {
        v[idx..].to_owned()
    } else {
        let parts: Vec<&str> = v.split("{images}/").collect();
        if parts.len() != 2 && !v.ends_with(".svg") {
            return Some(format!("{IMAGE_BASE_URL}/{v}").replace("images/images", "images"));
        }
        parts.last().copied().unwrap_or(v).to_owned()
    };

    let cleaned = slice
        .replace('"', "")
        .replace("_psd.", ".")
        .replace("_png.", ".")
        .replace(".psd", ".png")
        .replace(".vsvg", ".svg");

    if cleaned.ends_with(".svg") {
        let name = cleaned.rsplit('/').next().unwrap_or(&cleaned);
        Some(format!("{SVGS_BASE_URL}/{name}"))
    } else {
        Some(format!("{IMAGE_BASE_URL}/{cleaned}"))
    }
}

pub(super) fn extract_video_url(v: Option<&str>) -> Option<String> {
    let v = v?;
    if v.is_empty() {
        return None;
    }
    let tail = match v.rsplit_once("videos/") {
        Some((_, t)) => t,
        None => v,
    };
    Some(format!("{VIDEO_BASE_URL}/{tail}"))
}

fn pascal_to(s: &str, sep: char) -> String {
    let mut out = String::with_capacity(s.len() + 4);
    for (i, c) in s.chars().enumerate() {
        if i > 0 && c.is_ascii_uppercase() {
            out.push(sep);
        }
        out.push(c.to_ascii_lowercase());
    }
    out.trim().to_owned()
}

pub(super) fn prettify_pascal_case(s: &str) -> String {
    pascal_to(s, ' ').replace("d p s", "DPS")
}

pub(super) fn pascal_case_to_snake_case(s: &str) -> String {
    pascal_to(s, '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn img_path_with_anchor() {
        assert_eq!(
            parse_img_path(Some("file://{images}/hud/foo.psd")),
            Some(format!("{IMAGE_BASE_URL}/hud/foo.png"))
        );
    }

    #[test]
    fn img_path_with_svg() {
        assert_eq!(
            parse_img_path(Some("file://{images}/icons/mouse1.vsvg")),
            Some(format!("{SVGS_BASE_URL}/mouse1.svg"))
        );
    }

    #[test]
    fn img_path_no_anchor_no_braces_no_svg_skips_suffix_rewrites() {
        // No-anchor / no-braces / non-svg branch skips suffix rewrites.
        assert_eq!(
            parse_img_path(Some("foo.psd")),
            Some(format!("{IMAGE_BASE_URL}/foo.psd"))
        );
    }

    #[test]
    fn pretty_pascal() {
        assert_eq!(prettify_pascal_case("MoveForward"), "move forward");
        assert_eq!(prettify_pascal_case("DPSBonus"), "DPS bonus");
    }

    #[test]
    fn snake_pascal() {
        assert_eq!(pascal_case_to_snake_case("MoveForward"), "move_forward");
    }

    #[test]
    fn video_extraction() {
        assert_eq!(
            extract_video_url(Some("panorama/videos/preview.webm")),
            Some(format!("{VIDEO_BASE_URL}/preview.webm"))
        );
        assert_eq!(extract_video_url(None), None);
        assert_eq!(extract_video_url(Some("")), None);
    }
}
