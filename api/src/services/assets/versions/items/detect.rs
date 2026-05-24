//! Classifies a raw KV3 entity as `Weapon`, `Ability`, `Upgrade`, or `None`.

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ItemKind {
    Weapon,
    Ability,
    Upgrade,
}

pub(super) fn detect_item_type(class_name: &str, data: &Value) -> Option<ItemKind> {
    let obj = data.as_object()?;
    // `weapon_upgrade_*` are class-name-tagged weapon variants even though
    // they carry item-shaped metadata.
    if class_name.starts_with("weapon_upgrade_") {
        return Some(ItemKind::Weapon);
    }
    let ability_type = obj.get("m_eAbilityType").and_then(Value::as_str);
    let item_tier = obj.get("m_iItemTier");
    let slot_type = obj.get("m_eItemSlotType").and_then(Value::as_str);
    let ability_upgrades = obj.get("m_vecAbilityUpgrades");

    if let Some(at) = ability_type {
        // `EAbilityType_Melee` items surface as abilities — they carry
        // descriptions and behaviours like other ability slots.
        if at == "EAbilityType_Melee" {
            return Some(ItemKind::Ability);
        }
        if at == "EAbilityType_Weapon" {
            return Some(ItemKind::Weapon);
        }
        if at == "EAbilityType_Item" && item_tier.is_some() && slot_type.is_some() {
            return Some(ItemKind::Upgrade);
        }
        if matches!(
            at,
            "EAbilityType_Innate" | "EAbilityType_Signature" | "EAbilityType_Ultimate"
        ) && ability_upgrades.is_some()
        {
            return Some(ItemKind::Ability);
        }
    }

    if let Some(source) = obj.get("m_strAG2SourceName").and_then(Value::as_str) {
        if source == "item" && item_tier.is_some() && slot_type.is_some() {
            return Some(ItemKind::Upgrade);
        }
        if source == "weapon" {
            return Some(ItemKind::Weapon);
        }
        if source.contains("ability") && ability_upgrades.is_some() {
            return Some(ItemKind::Ability);
        }
    }

    if item_tier.is_some() {
        return Some(ItemKind::Upgrade);
    }

    if let Some(st) = slot_type
        && matches!(
            st,
            "EItemSlotType_WeaponMod" | "EItemSlotType_Tech" | "EItemSlotType_Armor"
        )
    {
        return Some(ItemKind::Upgrade);
    }

    // Catch-all: anything carrying ability-shaped data (upgrades, properties,
    // or a tooltip block) is treated as an ability — unless its class_name
    // names an upgrade or weapon variant.
    let has_ability_shape = ability_upgrades.is_some()
        || obj.contains_key("m_mapAbilityProperties")
        || obj.contains_key("m_AbilityTooltipDetails");
    if !has_ability_shape {
        return None;
    }
    if class_name.starts_with("upgrade_") || class_name.starts_with("weapon_upgrade_") {
        return Some(ItemKind::Upgrade);
    }
    if class_name.starts_with("weapon_") {
        return Some(ItemKind::Weapon);
    }
    Some(ItemKind::Ability)
}

/// Top-level filter: keep dicts that look like item candidates, dropping
/// shell entries (`base`, `dummy`, `generic` except `citadel_generic_*`).
pub(super) fn is_item_candidate(class_name: &str, value: &Value) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    if class_name.contains("base") || class_name.contains("dummy") {
        return false;
    }
    if class_name.contains("generic") && !class_name.contains("citadel") {
        return false;
    }
    // Template/shared-property shells marked `_not_pickable = 2` ship in
    // `abilities.vdata` but the live API drops them. The matching set is the
    // tier-numbered `armor_upgrade_t*` / `tech_upgrade_t*` shells and the
    // `common_properties` block. `weapon_upgrade_t*` carries the same flag
    // yet IS surfaced by the live API, so the filter is scoped to the
    // class-name prefixes the live API drops rather than the flag alone.
    let is_not_pickable_template = obj.contains_key("_not_pickable")
        && (class_name == "common_properties"
            || class_name.starts_with("armor_upgrade_t")
            || class_name.starts_with("tech_upgrade_t"));
    if is_not_pickable_template {
        return false;
    }
    // Internal projectile-test stand-ins (e.g. `item_projectile_test_01..06`)
    // ship in `abilities.vdata` but are never surfaced to players.
    if class_name.contains("_test_") || class_name.starts_with("item_projectile_test") {
        return false;
    }
    // NPC/internal helpers with no real player-facing item — these classes
    // are referenced by trooper/boss/neutral logic, shop cosmetics, and
    // unused / WIP heroes (fathom prefix) that the live API does not
    // include in `/v2/items`. `citadel_hold_melee` is the shared base for
    // hold-to-strike inputs and is likewise dropped upstream.
    if class_name.starts_with("trooper_")
        || class_name.starts_with("super_neutral_")
        || class_name.starts_with("cosmetic_item_")
        || class_name.starts_with("fathom_")
        || class_name == "citadel_hold_melee"
    {
        return false;
    }
    true
}
