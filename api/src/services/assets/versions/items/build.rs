//! End-to-end build pipeline: KV3 → raw → public item shape.

use indexmap::IndexMap;
use serde_json::Value;

use crate::services::assets::versions::common::entity_id;
use crate::services::assets::versions::items::css_lookup::CssIndex;
use crate::services::assets::versions::items::detect::{
    ItemKind, detect_item_type, is_item_candidate,
};
use crate::services::assets::versions::items::paths::{extract_video_url, parse_img_path};
use crate::services::assets::versions::items::raw::{
    RawAbility, RawAbilityTooltipDetails, RawHeroLite, RawItemBaseFields, RawItemProperty,
    RawUpgrade, RawUpgradeTooltipSection, RawWeapon, RawWeaponInfo, StringOrFloatList,
};
use crate::services::assets::versions::items::template::{
    ItemView, TemplateCtx, replace_templates,
};
use crate::services::assets::versions::items::types::{
    Ability, AbilityActivation, AbilityDescription, AbilityImbue, AbilitySectionType,
    AbilityTooltipDetails, AbilityVideos, Item, ItemProperty, ItemSlotType, ItemType,
    StatsUsageFlag, TooltipDetailsBlock, TooltipDetailsBlockProperty, TooltipDetailsInfoSection,
    Upgrade, UpgradeDescription, UpgradeProperty, UpgradeTooltipImportantPropertyWithIcon,
    UpgradeTooltipSection, UpgradeTooltipSectionAttribute, Weapon, WeaponInfo,
};

pub(super) struct BuildInputs<'a> {
    pub abilities_vdata: &'a str,
    pub heroes_vdata: &'a str,
    pub generic_data_vdata: &'a str,
    pub localization: &'a std::collections::HashMap<String, String>,
    pub ability_icons_css: &'a str,
    pub ability_property_icons_css: &'a str,
    pub citadel_base_styles_css: &'a str,
}

pub(super) async fn build_items(
    inputs: BuildInputs<'_>,
) -> Result<Vec<Item>, crate::services::assets::versions::error::AssetsError> {
    use crate::services::assets::versions::items::generic_data::extract_item_price_per_tier;
    use crate::utils::kv3;

    // ---- parse vdata
    let abilities_root: IndexMap<String, Value> = kv3::from_str(inputs.abilities_vdata)?;
    let heroes_root: IndexMap<String, Value> = kv3::from_str(inputs.heroes_vdata)?;
    let generic_root: Value = kv3::parse_to_json(inputs.generic_data_vdata)?;

    let item_price_per_tier = extract_item_price_per_tier(&generic_root);

    // ---- hero linkage
    let heroes = parse_heroes_lite(&heroes_root);

    // ---- CSS
    let icons_css = CssIndex::parse(inputs.ability_icons_css);
    let prop_icons_css = CssIndex::parse(inputs.ability_property_icons_css);
    let base_styles_css =
        CssIndex::parse_from_anchor(inputs.citadel_base_styles_css, "InlineAttributeIcon");

    let ctx = TemplateCtx {
        heroes: &heroes,
        localization: inputs.localization,
        base_styles_css: &base_styles_css,
    };

    // ---- per-item transform
    let mut out = Vec::with_capacity(abilities_root.len());
    for (class_name, value) in abilities_root {
        if !is_item_candidate(&class_name, &value) {
            continue;
        }
        let Some(kind) = detect_item_type(&class_name, &value) else {
            continue;
        };
        match build_one(
            &ctx,
            &icons_css,
            &prop_icons_css,
            &item_price_per_tier,
            class_name.clone(),
            value,
            kind,
        )
        .await
        {
            Ok(Some(item)) => out.push(item),
            Ok(None) => {}
            Err(e) => tracing::warn!("skipping {class_name}: {e}"),
        }
    }

    Ok(out)
}

fn parse_heroes_lite(root: &IndexMap<String, Value>) -> Vec<RawHeroLite> {
    let mut out = Vec::new();
    for (k, v) in root {
        if !k.starts_with("hero_")
            || k.contains("base")
            || k.contains("generic")
            || k.contains("dummy")
        {
            continue;
        }
        let mut obj = match v.as_object() {
            Some(o) => o.clone(),
            None => continue,
        };
        // Inject class_name so the struct deserializer picks it up.
        obj.insert("class_name".to_owned(), Value::String(k.clone()));
        match serde_json::from_value::<RawHeroLite>(Value::Object(obj)) {
            Ok(h) => out.push(h),
            Err(e) => tracing::debug!("skip hero {k}: {e}"),
        }
    }
    out
}

async fn build_one(
    ctx: &TemplateCtx<'_>,
    icons_css: &CssIndex,
    prop_icons_css: &CssIndex,
    item_price_per_tier: &[u32],
    class_name: String,
    value: Value,
    kind: ItemKind,
) -> Result<Option<Item>, serde_json::Error> {
    let id = entity_id(&class_name);
    let name = ctx
        .localization
        .get(&class_name)
        .cloned()
        .unwrap_or_else(|| class_name.clone())
        .trim()
        .to_owned();
    let hero = ctx
        .heroes
        .iter()
        .find(|h| h.items.values().any(|n| *n == class_name))
        .map(|h| h.id);
    let heroes: Vec<u32> = ctx
        .heroes
        .iter()
        .filter(|h| h.items.values().any(|n| *n == class_name))
        .map(|h| h.id)
        .collect();

    match kind {
        ItemKind::Ability => {
            let raw: RawAbility = serde_json::from_value(value)?;
            Ok(Some(Item::Ability(
                transform_ability(
                    ctx,
                    prop_icons_css,
                    icons_css,
                    id,
                    class_name,
                    name,
                    hero,
                    heroes,
                    raw,
                )
                .await,
            )))
        }
        ItemKind::Weapon => {
            let raw: RawWeapon = serde_json::from_value(value)?;
            Ok(Some(Item::Weapon(transform_weapon(
                ctx,
                prop_icons_css,
                icons_css,
                id,
                class_name,
                name,
                hero,
                heroes,
                raw,
            ))))
        }
        ItemKind::Upgrade => {
            let raw: RawUpgrade = serde_json::from_value(value)?;
            Ok(Some(Item::Upgrade(
                transform_upgrade(
                    ctx,
                    prop_icons_css,
                    icons_css,
                    item_price_per_tier,
                    id,
                    class_name,
                    name,
                    hero,
                    heroes,
                    raw,
                )
                .await,
            )))
        }
    }
}

// ---------- shared property transform ----------

fn transform_property(
    raw: RawItemProperty,
    key: &str,
    loc: &std::collections::HashMap<String, String>,
    prop_icons_css: &CssIndex,
) -> ItemProperty {
    let key = raw.loc_token_override.as_deref().map_or_else(
        || renamed_property_key(key).to_owned(),
        |t| t.trim_start_matches('#').to_owned(),
    );

    let icon = parse_img_path(
        raw.css_class
            .as_deref()
            .and_then(|c| {
                if c.starts_with("panorama") {
                    Some(c.to_owned())
                } else {
                    prop_icons_css.find_ability_properties_icon(Some(c))
                }
            })
            .as_deref(),
    );

    let usage_flags = raw
        .usage_flags
        .as_ref()
        .map(|f| {
            f.as_list()
                .into_iter()
                .filter_map(|s| s.trim().parse::<StatsUsageFlag>().ok())
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty());

    let scale_function = raw.scale_function.and_then(|w| w.subclass);

    let label = loc
        .get(&format!("{key}_label"))
        .or_else(|| loc.get(&format!("{key}_Label")))
        .or_else(|| loc.get(&format!("{key}_postvalue_label")))
        .cloned();
    let prefix = loc.get(&format!("{key}_prefix")).cloned();
    let postvalue_label = loc
        .get(&format!("{key}_postvalue_label"))
        .or_else(|| loc.get(&format!("{key}_postvalue_postvalue_label")))
        .cloned();
    let postfix = loc
        .get(&format!("{key}_postfix"))
        .or_else(|| loc.get(&format!("{key}_Postfix")))
        .or_else(|| loc.get(&format!("{key}_postfx")))
        .cloned();
    let conditional = loc.get(&format!("{key}_conditional")).cloned();

    ItemProperty {
        value: raw.value.map(coerce_numeric_to_float),
        street_brawl_value: raw.street_brawl_value,
        can_set_token_override: raw.can_set_token_override,
        provided_property_type: raw.provided_property_type,
        css_class: raw.css_class,
        usage_flags,
        negative_attribute: raw.negative_attribute,
        disable_value: raw.disable_value,
        loc_token_override: raw.loc_token_override,
        display_units: raw.display_units,
        scale_function,
        prefix,
        label,
        postfix,
        postvalue_label,
        conditional,
        icon,
    }
}

fn renamed_property_key(k: &str) -> &str {
    match k {
        "BuildUpDuration" => "BuildupDuration",
        "MoveSlowPercent" => "SlowPercent",
        "SpellslingerHeadshots_AbilityLifestealPercentHero" => {
            "SpellSlingerHeadshots_AbilityLifestealPercentHero"
        }
        "BuildUpPerShot" => "BuildupPerShot",
        "DotDuration" => "DOTDuration",
        "AuraRadius" => "Radius",
        other => other,
    }
}

/// Coerce integer JSON numbers to floats so `90` serializes as `90.0`,
/// matching how the upstream API surfaces property values.
fn coerce_numeric_to_float(v: Value) -> Value {
    match v {
        Value::Number(n) if n.is_i64() || n.is_u64() => n
            .as_f64()
            .and_then(serde_json::Number::from_f64)
            .map_or(Value::Number(n), Value::Number),
        other => other,
    }
}

/// Coerce all numeric values inside a recoil `range` JSON value to floats so
/// integers like `0` serialize as `0.0`, matching the upstream API.
fn coerce_recoil_range(v: Value) -> Value {
    match v {
        Value::Array(arr) => Value::Array(arr.into_iter().map(coerce_recoil_range).collect()),
        other => coerce_numeric_to_float(other),
    }
}

/// Abilities prefer the raw `m_strAbilityImage` and fall back to CSS.
fn resolve_item_image(base: &RawItemBaseFields, icons_css: &CssIndex) -> Option<String> {
    base.image.clone().or_else(|| {
        base.css_class
            .as_deref()
            .and_then(|c| icons_css.find_ability_icon(c))
    })
}

/// Weapons/upgrades prefer CSS when both are present, otherwise the raw image.
fn resolve_item_image_with_css(base: &RawItemBaseFields, icons_css: &CssIndex) -> Option<String> {
    let css = base
        .css_class
        .as_deref()
        .and_then(|c| icons_css.find_ability_icon(c));
    match (&base.image, css) {
        (Some(_), Some(c)) => Some(c),
        (img, None) => img.clone(),
        (None, _) => None,
    }
}

fn webp_of(image: Option<&str>) -> Option<String> {
    image.map(|p| p.replace(".png", ".webp"))
}

// ---------- transform ability ----------

#[allow(clippy::too_many_arguments)]
async fn transform_ability(
    ctx: &TemplateCtx<'_>,
    prop_icons_css: &CssIndex,
    icons_css: &CssIndex,
    id: u32,
    class_name: String,
    name: String,
    hero: Option<u32>,
    heroes: Vec<u32>,
    raw: RawAbility,
) -> Ability {
    let image_raw = resolve_item_image(&raw.base, icons_css);
    let image = parse_img_path(image_raw.as_deref());
    let image_webp = webp_of(image.as_deref());

    let properties = raw.base.properties.clone().map(|m| {
        m.into_iter()
            .map(|(k, v)| {
                let p = transform_property(v, &k, ctx.localization, prop_icons_css);
                (k, p)
            })
            .collect()
    });

    let item_view = ItemView {
        class_name: &class_name,
        ability: Some(&raw),
        properties: raw.base.properties.as_ref(),
    };

    let description = build_ability_description(ctx, item_view, &raw).await;
    let tooltip_details = match &raw.tooltip_details {
        Some(td) => Some(build_ability_tooltip_details(ctx, prop_icons_css, item_view, td).await),
        None => None,
    };

    let behaviours = raw
        .behaviour_bits
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.split('|')
                .map(|p| p.trim().to_owned())
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty());

    let videos = raw.video.as_deref().and_then(|v| {
        extract_video_url(Some(v)).map(|webm| AbilityVideos {
            mp4: Some(webm.replace(".webm", "_h264.mp4")),
            webm: Some(webm),
        })
    });

    Ability {
        id,
        class_name,
        name,
        start_trained: raw.base.start_trained,
        image,
        image_webp,
        hero,
        heroes: Some(heroes),
        update_time: raw.base.update_time,
        properties,
        weapon_info: raw.base.weapon_info_inner.clone(),
        r#type: ItemType::Ability,
        grant_ammo_on_cast: raw.grant_ammo_on_cast,
        behaviours,
        description,
        tooltip_details,
        upgrades: raw.upgrades.clone(),
        ability_type: raw.ability_type.as_deref().and_then(|s| s.parse().ok()),
        boss_damage_scale: raw.boss_damage_scale,
        dependant_abilities: raw.dependant_abilities.clone(),
        videos,
        dependent_abilities: raw.dependent_abilities.clone(),
    }
}

async fn build_ability_description(
    ctx: &TemplateCtx<'_>,
    item: ItemView<'_>,
    _raw: &RawAbility,
) -> AbilityDescription {
    let cn = item.class_name;
    let g = |k: &str| ctx.localization.get(k).cloned();
    let pick = |keys: &[String]| -> Option<String> {
        keys.iter().find_map(|k| ctx.localization.get(k).cloned())
    };

    let desc_src = g(&format!("{cn}_desc"));
    let quip_src = g(&format!("{cn}_quip"));
    let t1_src = g(&format!("{cn}_t1_desc")).or_else(|| g(&format!("{cn}_desc_t1bonus")));
    let t2_src = g(&format!("{cn}_t2_desc")).or_else(|| g(&format!("{cn}_desc_t2bonus")));
    let t3_src = g(&format!("{cn}_t3_desc")).or_else(|| g(&format!("{cn}_desc_t3bonus")));
    let active_src = pick(&[
        format!("{cn}_active_desc"),
        format!("{cn}_active"),
        format!("{cn}_active1"),
        format!("{cn}_active2"),
        format!("{cn}active_desc"),
    ]);
    let passive_src = pick(&[
        format!("{cn}_passive_desc"),
        format!("{cn}_passive"),
        format!("{cn}_desc_passive"),
        format!("{cn}_passive1"),
        format!("{cn}_desc_passive1"),
        format!("{cn}_passive2"),
        format!("{cn}_desc_passive2"),
    ]);

    AbilityDescription {
        desc: replace_templates(ctx, item, desc_src.as_deref(), None).await,
        quip: replace_templates(ctx, item, quip_src.as_deref(), None).await,
        t1_desc: replace_templates(ctx, item, t1_src.as_deref(), Some(1)).await,
        t2_desc: replace_templates(ctx, item, t2_src.as_deref(), Some(2)).await,
        t3_desc: replace_templates(ctx, item, t3_src.as_deref(), Some(3)).await,
        active: replace_templates(ctx, item, active_src.as_deref(), None).await,
        passive: replace_templates(ctx, item, passive_src.as_deref(), None).await,
    }
}

async fn build_ability_tooltip_details(
    ctx: &TemplateCtx<'_>,
    prop_icons_css: &CssIndex,
    item: ItemView<'_>,
    td: &RawAbilityTooltipDetails,
) -> AbilityTooltipDetails {
    let mut info_sections: Vec<TooltipDetailsInfoSection> = Vec::new();
    if let Some(sections) = &td.info_sections {
        for s in sections {
            // Treat empty loc_string as absent (matches Python's truthiness check).
            let section_loc = s.loc_string.as_deref().filter(|ls| !ls.is_empty());
            // Drop empty sections (all fields None/empty).
            // Matches Python's `any(s.model_dump().values())` truthiness check —
            // empty strings/lists count as falsy.
            let has_content = section_loc.is_some()
                || s.property_upgrade_required
                    .as_deref()
                    .is_some_and(|x| !x.is_empty())
                || s.properties_block.as_ref().is_some_and(|v| !v.is_empty())
                || s.basic_properties.as_ref().is_some_and(|v| !v.is_empty());
            if !has_content {
                continue;
            }
            let loc_string = match section_loc {
                Some(ls) => {
                    let trimmed = ls.trim_start_matches('#');
                    let src = ctx
                        .localization
                        .get(trimmed)
                        .cloned()
                        .unwrap_or_else(|| ls.to_owned());
                    replace_templates(ctx, item, Some(&src), None).await
                }
                None => None,
            };

            let properties_block = match &s.properties_block {
                Some(blocks) => {
                    let any_non_empty = blocks
                        .iter()
                        .any(|b| b.properties.as_ref().is_some_and(|p| !p.is_empty()));
                    if !any_non_empty {
                        None
                    } else {
                        let mut out = Vec::with_capacity(blocks.len());
                        for b in blocks {
                            let block_loc = b.loc_string.as_deref().filter(|ls| !ls.is_empty());
                            let loc_string = match block_loc {
                                Some(ls) => {
                                    let trimmed = ls.trim_start_matches('#');
                                    let src = ctx
                                        .localization
                                        .get(trimmed)
                                        .cloned()
                                        .unwrap_or_else(|| ls.to_owned());
                                    replace_templates(ctx, item, Some(&src), None).await
                                }
                                None => None,
                            };
                            let properties = b.properties.as_ref().and_then(|ps| {
                                if ps.is_empty() {
                                    return None;
                                }
                                Some(
                                    ps.iter()
                                        .map(|p| TooltipDetailsBlockProperty {
                                            requires_ability_upgrade: p.requires_ability_upgrade,
                                            show_property_value: p.show_property_value,
                                            important_property: p.important_property.clone(),
                                            status_effect_value: p.status_effect_value.clone(),
                                            status_effect_name: p
                                                .status_effect_value
                                                .as_deref()
                                                .filter(|s| !s.is_empty())
                                                .and_then(|_| {
                                                    p.important_property.as_ref().and_then(|ip| {
                                                        ctx.localization
                                                            .get(&format!("Citadel_{ip}"))
                                                            .or_else(|| ctx.localization.get(ip))
                                                            .cloned()
                                                    })
                                                }),
                                            important_property_icon: parse_img_path(
                                                p.important_property
                                                    .as_deref()
                                                    .and_then(|ip| {
                                                        prop_icons_css
                                                            .find_ability_properties_icon(Some(ip))
                                                    })
                                                    .as_deref(),
                                            ),
                                        })
                                        .collect(),
                                )
                            });
                            out.push(TooltipDetailsBlock {
                                loc_string,
                                properties,
                            });
                        }
                        Some(out)
                    }
                }
                None => None,
            };

            info_sections.push(TooltipDetailsInfoSection {
                loc_string,
                property_upgrade_required: s.property_upgrade_required.clone(),
                properties_block,
                basic_properties: s.basic_properties.clone().filter(|v| !v.is_empty()),
            });
        }
    }

    AbilityTooltipDetails {
        info_sections: if info_sections.is_empty() {
            None
        } else {
            Some(info_sections)
        },
        additional_header_properties: td
            .additional_header_properties
            .clone()
            .filter(|v| !v.is_empty()),
    }
}

// ---------- transform weapon ----------

#[allow(clippy::too_many_arguments)]
fn transform_weapon(
    ctx: &TemplateCtx<'_>,
    prop_icons_css: &CssIndex,
    icons_css: &CssIndex,
    id: u32,
    class_name: String,
    fallback_name: String,
    hero: Option<u32>,
    heroes: Vec<u32>,
    raw: RawWeapon,
) -> Weapon {
    let image_raw = resolve_item_image_with_css(&raw.base, icons_css);
    let image = parse_img_path(image_raw.as_deref());
    let image_webp = webp_of(image.as_deref());

    // Fall through several variants of the class name to find a localized name.
    let cn = &class_name;
    let candidates = [
        cn.clone(),
        cn.replace("citadel_weapon", "citadel_weapon_hero"),
        cn.replace("citadel_weapon", "citadel_weapon_hero")
            .replace("_alt", "_set"),
        cn.replace("citadel_weapon", "citadel_weapon_hero")
            .replace("_alt", "_set")
            .replace("set2", "set"),
    ];
    let name = candidates
        .iter()
        .find_map(|k| ctx.localization.get(k))
        .cloned()
        .unwrap_or(fallback_name)
        .trim()
        .to_owned();

    let weapon_info = raw.weapon_info.as_ref().map(build_weapon_info);

    let properties = raw.base.properties.clone().map(|m| {
        m.into_iter()
            .map(|(k, v)| {
                let p = transform_property(v, &k, ctx.localization, prop_icons_css);
                (k, p)
            })
            .collect()
    });

    Weapon {
        id,
        class_name,
        name,
        start_trained: raw.base.start_trained,
        image,
        image_webp,
        hero,
        heroes: Some(heroes),
        update_time: raw.base.update_time,
        properties,
        weapon_info,
        r#type: ItemType::Weapon,
        crosshair_css_class: raw
            .crosshair_css_class
            .filter(|s| !s.is_empty())
            .filter(|_| raw.custom_crosshair_settings.is_some()),
        use_custom_crosshair_settings: raw.use_custom_crosshair_settings,
        custom_crosshair_settings: raw.custom_crosshair_settings,
    }
}

fn build_weapon_info(w: &RawWeaponInfo) -> WeaponInfo {
    let aiming_shot_spread_penalty = normalize_spread(w.aiming_shot_spread_penalty.as_ref());
    let standing_shot_spread_penalty = normalize_spread(w.standing_shot_spread_penalty.as_ref());

    let cycle_time = w.cycle_time;
    let intra = w.intra_burst_cycle_time.unwrap_or(0.0);
    #[allow(clippy::cast_precision_loss)]
    let burst = w.burst_shot_count.unwrap_or(1).max(1) as f64;

    let shots_per_second = cycle_time.map(|ct| {
        let adj = burst * intra + ct;
        if adj == 0.0 { 0.0 } else { burst / adj }
    });

    let shots_per_second_with_reload = match (cycle_time, w.reload_duration, w.clip_size) {
        (Some(ct), Some(rd), Some(clip)) => {
            #[allow(clippy::cast_precision_loss)]
            let clip_f = clip as f64;
            let recoil_recovery = w.recoil_shot_index_recovery_time_factor.unwrap_or(0.0);
            #[allow(
                clippy::cast_precision_loss,
                clippy::cast_sign_loss,
                clippy::cast_possible_truncation
            )]
            let full_bursts = (clip as f64 / burst).floor();
            let total_burst = full_bursts * (burst * intra + ct) - intra;
            let remaining = clip_f % burst;
            let remaining_time = remaining * intra;
            let total = total_burst + remaining_time + rd + recoil_recovery;
            if total == 0.0 {
                Some(0.0)
            } else {
                Some(clip_f / total)
            }
        }
        _ => None,
    };

    let bullets_f = w.bullets.map(f64::from);
    let bullets_per_second = match (shots_per_second, bullets_f) {
        (Some(s), Some(b)) if s != 0.0 && b != 0.0 => Some(s * b),
        _ => None,
    };
    let bullets_per_second_with_reload = match (shots_per_second_with_reload, bullets_f) {
        (Some(s), Some(b)) if s != 0.0 && b != 0.0 => Some(s * b),
        _ => None,
    };
    let damage_per_second = match (bullets_per_second, w.bullet_damage) {
        (Some(b), Some(d)) if b != 0.0 && d != 0.0 => Some(b * d),
        _ => None,
    };
    let damage_per_second_with_reload = match (bullets_per_second_with_reload, w.bullet_damage) {
        (Some(b), Some(d)) if b != 0.0 && d != 0.0 => Some(b * d),
        _ => None,
    };
    let damage_per_shot = match (bullets_f, w.bullet_damage) {
        (Some(b), Some(d)) if b != 0.0 && d != 0.0 => Some(b * d),
        _ => None,
    };
    let damage_per_magazine = match (w.clip_size, damage_per_shot) {
        (Some(c), Some(d)) if c > 0 && d != 0.0 => Some(f64::from(c) * d),
        _ => None,
    };

    // Normalize each computed float through a JSON shortest-repr round-trip so
    // that values match what consumers (Python's `json.dumps` -> serde_json
    // round-trip) see. Without this, sub-ULP discrepancies appear at the JSON
    // layer even though the in-process f64 math is identical to the Python
    // reference implementation.
    let normalize = |v: Option<f64>| -> Option<f64> {
        let f = v?;
        let s = serde_json::to_string(&f).ok()?;
        serde_json::from_str::<f64>(&s).ok()
    };
    let shots_per_second = normalize(shots_per_second);
    let shots_per_second_with_reload = normalize(shots_per_second_with_reload);
    let bullets_per_second = normalize(bullets_per_second);
    let bullets_per_second_with_reload = normalize(bullets_per_second_with_reload);
    let damage_per_second = normalize(damage_per_second);
    let damage_per_second_with_reload = normalize(damage_per_second_with_reload);
    let damage_per_shot = normalize(damage_per_shot);
    let damage_per_magazine = normalize(damage_per_magazine);

    WeaponInfo {
        can_zoom: w.can_zoom,
        bullet_damage: w.bullet_damage,
        bullet_gravity_scale: w.bullet_gravity_scale,
        bullet_inherit_shooter_velocity_scale: w.bullet_inherit_shooter_velocity_scale,
        bullet_lifetime: w.bullet_lifetime,
        bullet_radius: w.bullet_radius,
        bullet_radius_vs_world: w.bullet_radius_vs_world,
        bullet_reflect_amount: w.bullet_reflect_amount,
        bullet_reflect_scale: w.bullet_reflect_scale,
        bullet_whiz_distance: w.bullet_whiz_distance,
        burst_shot_cooldown: w.burst_shot_cooldown,
        crit_bonus_against_npcs: w.crit_bonus_against_npcs,
        crit_bonus_end: w.crit_bonus_end,
        crit_bonus_end_range: w.crit_bonus_end_range,
        crit_bonus_start: w.crit_bonus_start,
        crit_bonus_start_range: w.crit_bonus_start_range,
        cycle_time: w.cycle_time,
        spins_up: w.spins_up,
        is_semi_auto: w.is_semi_auto,
        semi_auto_cycle_rate: w.semi_auto_cycle_rate,
        max_spin_cycle_time: w.max_spin_cycle_time,
        spin_increase_rate: w.spin_increase_rate,
        spin_decay_rate: w.spin_decay_rate,
        build_up_rate: w.build_up_rate,
        intra_burst_cycle_time: w.intra_burst_cycle_time,
        damage_falloff_bias: w.damage_falloff_bias,
        damage_falloff_end_range: w.damage_falloff_end_range,
        damage_falloff_end_scale: w.damage_falloff_end_scale,
        damage_falloff_start_range: w.damage_falloff_start_range,
        damage_falloff_start_scale: w.damage_falloff_start_scale,
        horizontal_punch: w.horizontal_punch,
        range: w.range,
        recoil_recovery_delay_factor: w.recoil_recovery_delay_factor,
        bullet_speed: w.bullet_speed,
        recoil_recovery_speed: w.recoil_recovery_speed,
        recoil_shot_index_recovery_time_factor: w.recoil_shot_index_recovery_time_factor,
        recoil_speed: w.recoil_speed,
        reload_move_speed: w.reload_move_speed,
        scatter_yaw_scale: w.scatter_yaw_scale,
        aiming_shot_spread_penalty,
        standing_shot_spread_penalty,
        shoot_move_speed_percent: w.shoot_move_speed_percent,
        shoot_spread_penalty_decay: w.shoot_spread_penalty_decay,
        shoot_spread_penalty_decay_delay: w.shoot_spread_penalty_decay_delay,
        shoot_spread_penalty_per_shot: w.shoot_spread_penalty_per_shot,
        shooting_up_spread_penalty: w.shooting_up_spread_penalty,
        vertical_punch: w.vertical_punch,
        zoom_fov: w.zoom_fov,
        zoom_move_speed_percent: w.zoom_move_speed_percent,
        bullets: w.bullets,
        reload_single_bullets_initial_delay: w.reload_single_bullets_initial_delay,
        reload_single_bullets: w.reload_single_bullets,
        reload_single_bullets_allow_cancel: w.reload_single_bullets_allow_cancel,
        burst_shot_count: w.burst_shot_count,
        clip_size: w.clip_size,
        spread: w.spread,
        standing_spread: w.standing_spread,
        low_ammo_indicator_threshold: w.low_ammo_indicator_threshold,
        recoil_seed: w.recoil_seed,
        reload_duration: w.reload_duration,
        bullet_speed_curve: w.bullet_speed_curve.clone(),
        horizontal_recoil: w.horizontal_recoil.clone().map(|mut r| {
            r.range = r.range.map(coerce_recoil_range);
            r
        }),
        vertical_recoil: w.vertical_recoil.clone().map(|mut r| {
            r.range = r.range.map(coerce_recoil_range);
            r
        }),
        shots_per_second,
        shots_per_second_with_reload,
        bullets_per_second,
        bullets_per_second_with_reload,
        damage_per_second,
        damage_per_second_with_reload,
        damage_per_shot,
        damage_per_magazine,
    }
}

fn normalize_spread(s: Option<&StringOrFloatList>) -> Option<serde_json::Value> {
    match s? {
        StringOrFloatList::List(v) => Some(serde_json::to_value(v).ok()?),
        StringOrFloatList::Str(s) => {
            if s.is_empty() {
                None
            } else if s.contains(',') {
                let nums: Vec<f64> = s
                    .split(',')
                    .filter_map(|p| p.trim().parse::<f64>().ok())
                    .collect();
                Some(serde_json::to_value(nums).ok()?)
            } else {
                Some(serde_json::Value::String(s.clone()))
            }
        }
    }
}

// ---------- transform upgrade ----------

#[allow(clippy::too_many_arguments)]
async fn transform_upgrade(
    ctx: &TemplateCtx<'_>,
    prop_icons_css: &CssIndex,
    icons_css: &CssIndex,
    item_price_per_tier: &[u32],
    id: u32,
    class_name: String,
    name: String,
    hero: Option<u32>,
    heroes: Vec<u32>,
    raw: RawUpgrade,
) -> Upgrade {
    let image_raw = resolve_item_image_with_css(&raw.base, icons_css);
    let image = parse_img_path(image_raw.as_deref());
    let image_webp = webp_of(image.as_deref());

    let shop_image = parse_img_path(raw.shop_image.as_deref());
    let shop_image_webp = webp_of(shop_image.as_deref());
    let shop_image_small = parse_img_path(raw.shop_image_small.as_deref());
    let shop_image_small_webp = webp_of(shop_image_small.as_deref());

    let item_slot_type: ItemSlotType = raw.item_slot_type.parse().unwrap_or(ItemSlotType::Weapon);
    let activation: AbilityActivation = raw
        .activation
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(AbilityActivation::Passive);
    let imbue: Option<AbilityImbue> = raw.imbue.as_deref().and_then(|s| s.parse().ok());

    let tooltip_sections_raw = raw.tooltip_sections.clone();

    let properties = raw.base.properties.clone().map(|m| {
        m.into_iter()
            .map(|(k, v)| {
                let base_prop = transform_property(v, &k, ctx.localization, prop_icons_css);
                let (section, elevated, important) =
                    classify_tooltip_section(&k, tooltip_sections_raw.as_deref());
                let prop = UpgradeProperty {
                    property: base_prop,
                    tooltip_section: section,
                    tooltip_is_elevated: elevated,
                    tooltip_is_important: important,
                };
                (k, prop)
            })
            .collect()
    });

    let item_view = ItemView {
        class_name: &class_name,
        ability: None,
        properties: raw.base.properties.as_ref(),
    };

    let description = build_upgrade_description(ctx, item_view, &class_name).await;

    let mut tooltip_sections: Vec<UpgradeTooltipSection> = Vec::new();
    if let Some(sections) = tooltip_sections_raw {
        for s in sections {
            let section_attrs = build_section_attrs(ctx, item_view, prop_icons_css, &s).await;
            tooltip_sections.push(UpgradeTooltipSection {
                section_type: s.section_type.as_deref().and_then(|x| x.parse().ok()),
                section_attributes: Some(section_attrs),
            });
        }
    }

    let is_active_item = !matches!(activation, AbilityActivation::Passive);
    let shopable = raw.disabled != Some(true) && shop_image.is_some();
    let cost = item_price_per_tier.get(usize::from(raw.item_tier)).copied();

    Upgrade {
        id,
        class_name,
        name,
        start_trained: raw.base.start_trained,
        image,
        image_webp,
        hero,
        heroes: Some(heroes),
        update_time: raw.base.update_time,
        weapon_info: raw.base.weapon_info_inner.clone(),
        r#type: ItemType::Upgrade,
        shop_image,
        shop_image_webp,
        shop_image_small,
        shop_image_small_webp,
        item_slot_type,
        item_tier: raw.item_tier,
        properties,
        disabled: raw.disabled,
        description: Some(description),
        activation,
        imbue,
        component_items: raw.component_items,
        tooltip_sections: Some(tooltip_sections),
        upgrades: raw.upgrades.filter(|v| !v.is_empty()),
        is_active_item,
        shopable,
        cost,
    }
}

fn classify_tooltip_section(
    name: &str,
    sections: Option<&[RawUpgradeTooltipSection]>,
) -> (Option<AbilitySectionType>, Option<bool>, Option<bool>) {
    let Some(sections) = sections else {
        return (None, None, None);
    };
    for s in sections {
        let elevated_match = s.section_attributes.iter().any(|sa| {
            sa.elevated_properties
                .as_ref()
                .is_some_and(|p| p.iter().any(|x| x == name))
        });
        let important_match = s.section_attributes.iter().any(|sa| {
            sa.important_properties.as_ref().is_some_and(|p| {
                p.iter()
                    .any(|ip| ip.important_property.as_deref() == Some(name))
            })
        });
        let prop_match = s.section_attributes.iter().any(|sa| {
            sa.properties
                .as_ref()
                .is_some_and(|p| p.iter().any(|x| x == name))
        });
        if elevated_match || important_match || prop_match {
            return (
                s.section_type.as_deref().and_then(|x| x.parse().ok()),
                Some(elevated_match),
                Some(important_match),
            );
        }
    }
    (None, None, None)
}

async fn build_upgrade_description(
    ctx: &TemplateCtx<'_>,
    item: ItemView<'_>,
    cn: &str,
) -> UpgradeDescription {
    let pick = |keys: &[String]| -> Option<String> {
        keys.iter().find_map(|k| ctx.localization.get(k).cloned())
    };

    let desc_src = pick(&[
        format!("{cn}_desc"),
        format!("{cn}_headshots_desc"),
        format!("{cn}_desc1"),
        format!("{cn}_headshots_desc1"),
    ]);
    let desc2_src = pick(&[format!("{cn}_desc2"), format!("{cn}_headshots_desc2")]);
    let active_src = pick(&[
        format!("{cn}_active_desc"),
        format!("{cn}_active"),
        format!("{cn}_active1"),
        format!("{cn}_active2"),
        format!("{cn}_ambush_desc"),
    ]);
    let passive_src = pick(&[
        format!("{cn}_passive_desc"),
        format!("{cn}_passive"),
        format!("{cn}_desc_passive"),
        format!("{cn}_passive1"),
        format!("{cn}_desc_passive1"),
        format!("{cn}_passive2"),
        format!("{cn}_desc_passive2"),
        format!("{cn}_high_health_passive_desc"),
        format!("{cn}_component_passive_desc"),
    ]);

    UpgradeDescription {
        desc: replace_templates(ctx, item, desc_src.as_deref(), None).await,
        desc2: replace_templates(ctx, item, desc2_src.as_deref(), None).await,
        active: replace_templates(ctx, item, active_src.as_deref(), None).await,
        passive: replace_templates(ctx, item, passive_src.as_deref(), None).await,
    }
}

async fn build_section_attrs(
    ctx: &TemplateCtx<'_>,
    item: ItemView<'_>,
    prop_icons_css: &CssIndex,
    s: &RawUpgradeTooltipSection,
) -> Vec<UpgradeTooltipSectionAttribute> {
    let mut out = Vec::with_capacity(s.section_attributes.len());
    for sa in &s.section_attributes {
        let loc_string = match &sa.loc_string {
            Some(ls) => {
                let trimmed = ls.trim_start_matches('#');
                let src = ctx.localization.get(trimmed).cloned();
                replace_templates(ctx, item, src.as_deref(), None).await
            }
            None => None,
        };
        let important_properties = sa
            .important_properties
            .as_ref()
            .map(|ips| {
                ips.iter()
                    .filter_map(|p| p.important_property.clone())
                    .collect::<Vec<_>>()
            })
            .filter(|v| !v.is_empty());

        let important_properties_with_icon = sa.important_properties.as_ref().map(|ips| {
            ips.iter()
                .filter_map(|p| p.important_property.as_deref())
                .filter_map(|name| {
                    let icon = parse_img_path(
                        prop_icons_css
                            .find_ability_properties_icon(Some(name))
                            .as_deref(),
                    )?;
                    let localized = ctx
                        .localization
                        .get(&format!("Citadel_{name}"))
                        .or_else(|| ctx.localization.get(name))
                        .cloned()
                        .map(|s| s.trim().to_owned());
                    Some(UpgradeTooltipImportantPropertyWithIcon {
                        name: Some(name.to_owned()),
                        icon: Some(icon),
                        localized_name: localized,
                    })
                })
                .collect::<Vec<_>>()
        });

        out.push(UpgradeTooltipSectionAttribute {
            loc_string,
            properties: sa.properties.clone(),
            elevated_properties: sa.elevated_properties.clone(),
            important_properties,
            important_properties_with_icon: important_properties_with_icon
                .filter(|v: &Vec<_>| !v.is_empty()),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SNAPSHOT_VERSION: u32 = 6064;
    const PUBLIC_BASE: &str = "https://assets-bucket.deadlock-api.com/assets-api-res/versions";

    async fn fetch_zst(client: &reqwest::Client, version: u32, rel: &str) -> String {
        use async_compression::tokio::bufread::ZstdDecoder;
        use tokio::io::AsyncReadExt;

        let url = format!("{PUBLIC_BASE}/{version}/{rel}.zst");
        let bytes = client
            .get(&url)
            .send()
            .await
            .expect("fetch")
            .bytes()
            .await
            .expect("bytes");
        let mut decoder = ZstdDecoder::new(std::io::Cursor::new(bytes));
        let mut out = Vec::new();
        decoder.read_to_end(&mut out).await.expect("decompress");
        String::from_utf8(out).expect("utf-8")
    }

    #[tokio::test]
    #[ignore = "network; smoke test that previously-skipped items now build"]
    async fn smoke_v6518_numeric_street_brawl_value() {
        const V: u32 = 6518;
        let client = reqwest::Client::new();
        let (abilities, heroes, generic, loc_json, icons, prop_icons, base_styles) = tokio::join!(
            fetch_zst(&client, V, "scripts/abilities.vdata"),
            fetch_zst(&client, V, "scripts/heroes.vdata"),
            fetch_zst(&client, V, "scripts/generic_data.vdata"),
            fetch_zst(&client, V, "localization/english.json"),
            fetch_zst(&client, V, "styles/ability_icons.css"),
            fetch_zst(&client, V, "styles/ability_property_icons.css"),
            fetch_zst(&client, V, "styles/citadel_base_styles.css"),
        );
        let localization: std::collections::HashMap<String, String> =
            serde_json::from_str(&loc_json).expect("loc json");
        let items = build_items(BuildInputs {
            abilities_vdata: &abilities,
            heroes_vdata: &heroes,
            generic_data_vdata: &generic,
            localization: &localization,
            ability_icons_css: &icons,
            ability_property_icons_css: &prop_icons,
            citadel_base_styles_css: &base_styles,
        })
        .await
        .expect("build");
        let val: serde_json::Value = serde_json::to_value(&*items).expect("serialize");
        let arr = val.as_array().expect("array");
        let names: std::collections::HashSet<&str> = arr
            .iter()
            .filter_map(|v| v.get("class_name").and_then(|s| s.as_str()))
            .collect();
        for needed in [
            "citadel_ability_self_vacuum",
            "citadel_ability_shieldedsentry",
            "citadel_ability_storm_cloud",
            "citadel_ability_lash_down_strike",
            "mirage_teleport",
        ] {
            assert!(names.contains(needed), "missing built item: {needed}");
        }
    }

    #[derive(serde::Serialize)]
    struct Summary<'a> {
        class_name: &'a str,
        kind: String,
        id: u32,
        name: &'a str,
        hero: Option<u32>,
        heroes: Option<&'a [u32]>,
        image: Option<&'a str>,
    }

    #[tokio::test]
    #[ignore = "network; refreshes the summary snapshot"]
    async fn snapshot_items_english() {
        let client = reqwest::Client::new();
        let (abilities, heroes, generic, loc_json, icons, prop_icons, base_styles) = tokio::join!(
            fetch_zst(&client, SNAPSHOT_VERSION, "scripts/abilities.vdata"),
            fetch_zst(&client, SNAPSHOT_VERSION, "scripts/heroes.vdata"),
            fetch_zst(&client, SNAPSHOT_VERSION, "scripts/generic_data.vdata"),
            fetch_zst(&client, SNAPSHOT_VERSION, "localization/english.json"),
            fetch_zst(&client, SNAPSHOT_VERSION, "styles/ability_icons.css"),
            fetch_zst(
                &client,
                SNAPSHOT_VERSION,
                "styles/ability_property_icons.css"
            ),
            fetch_zst(&client, SNAPSHOT_VERSION, "styles/citadel_base_styles.css"),
        );
        let localization: std::collections::HashMap<String, String> =
            serde_json::from_str(&loc_json).expect("loc json");

        let items = build_items(BuildInputs {
            abilities_vdata: &abilities,
            heroes_vdata: &heroes,
            generic_data_vdata: &generic,
            localization: &localization,
            ability_icons_css: &icons,
            ability_property_icons_css: &prop_icons,
            citadel_base_styles_css: &base_styles,
        })
        .await
        .expect("build");

        let summary: Vec<Summary<'_>> = items
            .iter()
            .map(|i| Summary {
                class_name: i.class_name(),
                kind: i.item_type().to_string(),
                id: i.id(),
                name: match i {
                    Item::Ability(a) => &a.name,
                    Item::Weapon(w) => &w.name,
                    Item::Upgrade(u) => &u.name,
                },
                hero: match i {
                    Item::Ability(a) => a.hero,
                    Item::Weapon(w) => w.hero,
                    Item::Upgrade(u) => u.hero,
                },
                heroes: i.heroes(),
                image: match i {
                    Item::Ability(a) => a.image.as_deref(),
                    Item::Weapon(w) => w.image.as_deref(),
                    Item::Upgrade(u) => u.image.as_deref(),
                },
            })
            .collect();

        insta::with_settings!(
            { snapshot_path => "items_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!("items_english_summary", summary); }
        );
    }
}
