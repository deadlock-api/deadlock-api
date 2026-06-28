//! Resolves `{s:X}` / `{i:X}` / `{g:X}` markers in localization strings.
//! Async because keybind and inline-attribute icons are fetched lazily from
//! the public asset bucket.

#![allow(clippy::too_many_lines)]

use std::collections::HashMap;
use std::sync::OnceLock;

use regex::Regex;

use crate::services::assets::versions::items::css_lookup::CssIndex;
use crate::services::assets::versions::items::paths::{
    SVGS_BASE_URL, parse_img_path, pascal_case_to_snake_case, prettify_pascal_case,
};
use indexmap::IndexMap;

use crate::services::assets::versions::items::raw::{
    BonusValue, RawAbility, RawHeroLite, RawItemProperty,
};
use crate::services::assets::versions::items::svg::{add_fill_to_svg, fetch_svg, shorten_hex};

#[derive(Clone, Copy)]
pub(super) struct ItemView<'a> {
    pub class_name: &'a str,
    pub ability: Option<&'a RawAbility>,
    pub properties: Option<&'a IndexMap<String, RawItemProperty>>,
}

pub(super) struct TemplateCtx<'a> {
    pub heroes: &'a [RawHeroLite],
    pub localization: &'a HashMap<String, String>,
    pub base_styles_css: &'a CssIndex,
}

fn keybind_svg_name(key: &str) -> Option<&'static str> {
    Some(match key {
        "Attack" => "mouse1.svg",
        "ADS" => "mouse2.svg",
        "AltCast" => "mouse3.svg",
        "SpectateFlyUp" => "mouse4.svg",
        "SpectateFlyDown" => "mouse5.svg",
        _ => return None,
    })
}

fn template_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<?\{[sig]:([^}]+)\}").expect("valid regex"))
}

pub(super) async fn replace_templates(
    ctx: &TemplateCtx<'_>,
    item: ItemView<'_>,
    input: Option<&str>,
    tier: Option<usize>,
) -> Option<String> {
    let input = input?;
    let re = template_re();
    let mut out = String::with_capacity(input.len());
    let mut last = 0usize;
    for caps in re.captures_iter(input) {
        let m = caps.get(0).expect("group 0");
        out.push_str(&input[last..m.start()]);
        last = m.end();
        let raw_var = caps.get(1).expect("group 1").as_str();
        match resolve_one(ctx, item, raw_var, tier).await {
            Some(s) if !s.is_empty() => out.push_str(&s),
            _ => out.push_str(m.as_str()),
        }
    }
    out.push_str(&input[last..]);
    Some(out.replace("  ", " "))
}

async fn resolve_one(
    ctx: &TemplateCtx<'_>,
    item: ItemView<'_>,
    raw_variable: &str,
    tier: Option<usize>,
) -> Option<String> {
    let variable = raw_variable.replace("citadel_binding", "citadel_keybind");

    if let Some(rest) = variable.strip_prefix("citadel_keybind") {
        let key = rest.trim_start_matches(':').trim_matches('\'');
        return Some(resolve_keybind(ctx, key).await);
    }
    if let Some(rest) = variable.strip_prefix("citadel_inline_attribute") {
        let css_class = rest.trim_start_matches(':').trim_matches('\'');
        return Some(resolve_inline_attribute(ctx, css_class).await);
    }

    let var_n = variable.replace("_scale", "");
    // Properties available either from the ability (its base) or directly from
    // upgrade/weapon `ItemView::properties`. Upgrades/weapons reach the
    // property-value fallback below even though they carry no ability.
    let props_opt = item
        .ability
        .and_then(|a| a.base.properties.as_ref())
        .or(item.properties);

    let prop_key = props_opt
        .and_then(|props| {
            props.iter().find_map(|(k, v)| {
                let hit = v.loc_token_override.as_deref() == Some(&var_n) || *k == var_n;
                hit.then(|| k.clone())
            })
        })
        .unwrap_or_default();

    let mut replaced: Option<String> = None;

    if let Some(ability) = item.ability {
        replaced = ability
            .upgrades
            .iter()
            .flatten()
            .flat_map(|u| &u.property_upgrades)
            .find(|p| p.name.eq_ignore_ascii_case(&var_n) || p.name.eq_ignore_ascii_case(&prop_key))
            .map(|b| bonus_to_string(&b.bonus));
    }

    if replaced.is_none()
        && let Some(props) = props_opt
    {
        let direct = props.get(&var_n).or_else(|| {
            props
                .values()
                .find(|v| v.loc_token_override.as_deref() == Some(&var_n))
        });
        if let Some(p) = direct
            && let Some(v) = &p.value
        {
            replaced = Some(json_value_to_string(v));
        }
    }

    if let Some(ability) = item.ability
        && let Some(upgrades) = ability.upgrades.as_deref()
        && let Some(t) = tier
        && upgrades.len() >= t
        && let Some(b) = upgrades[t - 1].property_upgrades.iter().find(|pp| {
            pp.name.eq_ignore_ascii_case(&var_n) || pp.name.eq_ignore_ascii_case(&prop_key)
        })
        && matches!(b.bonus, BonusValue::Str(_))
    {
        replaced = Some(bonus_to_string(&b.bonus).trim_end_matches('m').to_owned());
    }

    if replaced.is_some() {
        return replaced;
    }

    match variable.as_str() {
        "iv_attack" => return Some("LMC".to_owned()),
        "iv_attack2" => return Some("RMC".to_owned()),
        "key_alt_cast" | "AltCast" => return Some("M3".to_owned()),
        "key_reload" => return Some("R".to_owned()),
        _ => {}
    }

    if variable == "ability_key"
        && let Some(hero_items) = ctx
            .heroes
            .iter()
            .find(|h| h.items.values().any(|n| n == item.class_name))
            .map(|h| &h.items)
        && let Some(idx) = hero_items
            .iter()
            .find(|(_, v)| v.as_str() == item.class_name)
            .and_then(|(k, _)| ability_index(k))
    {
        return Some(idx.to_string());
    }

    if let Some(idx_char) = variable
        .strip_prefix("in_ability")
        .and_then(|s| s.chars().next())
        && idx_char.is_ascii_digit()
    {
        return ctx
            .localization
            .get(&format!("citadel_keybind_ability{idx_char}"))
            .cloned();
    }

    if variable == "hero_name" {
        if let Some(h) = ctx
            .heroes
            .iter()
            .find(|h| h.items.values().any(|n| n == item.class_name))
        {
            let candidates = [
                format!("{}:n", h.class_name),
                h.class_name.clone(),
                format!("Steam_RP_{}", h.class_name),
            ];
            let raw = candidates
                .iter()
                .find_map(|k| ctx.localization.get(k))
                .cloned()
                .unwrap_or_else(|| h.class_name.clone());
            return Some(raw.trim().replace("#|f|#", "").replace("#|m|#", ""));
        }
        if let Some((_, hero, _)) = split_three(item.class_name)
            && let Some(v) = ctx
                .localization
                .get(hero)
                .or_else(|| ctx.localization.get(&format!("hero_{hero}")))
        {
            return Some(v.clone());
        }
    }

    let key = match variable.as_str() {
        "key_duck" => "citadel_keybind_crouch",
        "in_mantle" => "citadel_keybind_mantle",
        "key_innate_1" => "citadel_keybind_roll",
        "in_move_down" => "citadel_keybind_down",
        other => other,
    };
    ctx.localization.get(key).cloned()
}

fn split_three(s: &str) -> Option<(&str, &str, &str)> {
    let mut it = s.splitn(3, '_');
    Some((it.next()?, it.next()?, it.next().unwrap_or("")))
}

async fn resolve_keybind(ctx: &TemplateCtx<'_>, key: &str) -> String {
    if let Some(name) = keybind_svg_name(key)
        && let Some(svg) = fetch_svg(name).await.as_ref().clone()
    {
        return svg;
    }
    let snake = pascal_case_to_snake_case(key);
    let res = ctx
        .localization
        .get(&format!("citadel_keybind_{snake}"))
        .cloned()
        .unwrap_or_else(|| prettify_pascal_case(key))
        .trim()
        .to_owned();
    match (
        key,
        res.eq_ignore_ascii_case("move forward"),
        res.eq_ignore_ascii_case("move down"),
    ) {
        ("MoveForward", true, _) => " [W] ".to_owned(),
        ("MoveDown", _, true) => " [S] ".to_owned(),
        _ => format!(" {res} "),
    }
}

async fn resolve_inline_attribute(ctx: &TemplateCtx<'_>, css_class: &str) -> String {
    let label = ctx
        .localization
        .get(&format!("InlineAttribute_{css_class}"))
        .cloned()
        .unwrap_or_else(|| prettify_pascal_case(css_class));
    let (bg_raw, wash) = ctx
        .base_styles_css
        .find_base_styles(&format!(".InlineAttributeIcon.{css_class}"));

    // The game CSS maps DamageAmp to a bare `images/damage_psd.vtex`. That path
    // hits the `parse_img_path` quirk that skips the `.psd`->`.png` rewrite, so
    // it resolves to `images/damage.psd` (never uploaded) instead of the real
    // `images/damage.png`. Use the themeable crit-damage property SVG instead,
    // matching how the other inline-attribute icons render with a wash color.
    let (bg, svg_name_override): (Option<String>, Option<&str>) = match css_class {
        "DamageAmp" => {
            let name = "icons/properties/damage_crit_color.svg";
            (Some(format!("{SVGS_BASE_URL}/{name}")), Some(name))
        }
        _ => (parse_img_path(bg_raw.as_deref()), None),
    };

    let img_tag = match bg.as_deref() {
        Some(bg_url) if bg_url.ends_with(".svg") => {
            let svg_name =
                svg_name_override.unwrap_or_else(|| bg_url.rsplit('/').next().unwrap_or(bg_url));
            if let Some(svg) = fetch_svg(svg_name).await.as_ref().clone() {
                add_fill_to_svg(&svg, wash.as_deref())
            } else if wash.is_some() {
                format!(
                    "<img src=\"{bg_url}\" class=\"inline-attribute {css_class}\" alt=\"{label}\"/>"
                )
            } else {
                format!(
                    "<object data=\"{bg_url}\" class=\"inline-attribute {css_class}\" alt=\"{label}\"/>"
                )
            }
        }
        Some(bg_url) => {
            format!(
                "<img src=\"{bg_url}\" class=\"inline-attribute {css_class}\" alt=\"{label}\"/>"
            )
        }
        None => format!("<img src=\"\" class=\"inline-attribute {css_class}\" alt=\"{label}\"/>"),
    };

    let label_tag = match &wash {
        Some(wc) => format!(
            "<span class=\"inline-attribute-label {css_class}\" style=\"color: {wc};\">{label}</span>",
            wc = shorten_hex(wc)
        ),
        None => format!("<span class=\"inline-attribute-label {css_class}\">{label}</span>"),
    };

    if css_class.to_ascii_lowercase().ends_with("icon") {
        img_tag
    } else {
        format!("{img_tag}{label_tag}")
    }
}

fn json_value_to_string(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => {
            let s = n.to_string();
            if n.is_f64() && !s.contains('.') && !s.contains('e') && !s.contains('E') {
                format!("{s}.0")
            } else {
                s
            }
        }
        other => other.to_string(),
    }
}

/// Format a bonus value with trailing `.0` retained on integer floats (e.g.
/// `26.0`, not `26`).
fn bonus_to_string(b: &BonusValue) -> String {
    match b {
        BonusValue::Str(s) => s.clone(),
        BonusValue::Float(f) => {
            let s = format!("{f}");
            if !s.contains('.') && !s.contains('e') && !s.contains('E') {
                format!("{s}.0")
            } else {
                s
            }
        }
    }
}

fn ability_index(slot: &str) -> Option<u8> {
    Some(match slot {
        "ESlot_Signature_1" => 1,
        "ESlot_Signature_2" => 2,
        "ESlot_Signature_3" => 3,
        "ESlot_Signature_4" => 4,
        _ => return None,
    })
}
