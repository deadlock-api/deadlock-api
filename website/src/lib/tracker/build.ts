import type { Ability } from "deadlock_api_client";

import type { SlimHero, SlimUpgrade } from "~/queries/asset-queries";
import type { TrackerMatchItem } from "~/queries/tracker-queries";

export interface BuildItem {
  upgrade: SlimUpgrade;
  /** Seconds into the match. */
  boughtAt: number;
  /** Seconds into the match, or null when held to the end. */
  soldAt: number | null;
  imbuedInto: Ability | undefined;
}

export interface BuildAbility {
  ability: Ability;
  /** Seconds into the match, or null when the history holds no unlock for it. */
  unlockedAt: number | null;
  /** When each upgrade was bought, 0–3 of them, in order. */
  upgradedAt: number[];
}

export interface PlayerBuild {
  /** In the hero's ability slot order. */
  abilities: BuildAbility[];
  /** Shop items in purchase order, sold ones included. */
  items: BuildItem[];
}

const SIGNATURE_SLOTS = ["signature1", "signature2", "signature3", "signature4"];

/**
 * Splits a player's item history into their abilities and shop items. Abilities and shop items share the list:
 * an ability's unlock has no `upgrade_id`, each of its upgrades has one.
 */
export function playerBuild(
  items: TrackerMatchItem[],
  itemsById: Map<number, SlimUpgrade>,
  abilitiesById: Map<number, Ability>,
  hero: SlimHero | undefined,
): PlayerBuild {
  const ordered = items.toSorted((a, b) => a.game_time_s - b.game_time_s);

  const abilities = new Map<number, BuildAbility>();
  const shopItems: BuildItem[] = [];
  const heldIds = new Set<number>();
  for (const item of ordered) {
    const ability = abilitiesById.get(item.item_id);
    if (ability) {
      const entry = abilities.get(ability.id) ?? { ability, unlockedAt: null, upgradedAt: [] };
      if (item.upgrade_id === 0) entry.unlockedAt = item.game_time_s;
      else entry.upgradedAt.push(item.game_time_s);
      abilities.set(ability.id, entry);
      continue;
    }
    const upgrade = itemsById.get(item.item_id);
    if (!upgrade) continue;
    const buildItem: BuildItem = {
      upgrade,
      boughtAt: item.game_time_s,
      soldAt: item.sold_time_s > 0 ? item.sold_time_s : null,
      imbuedInto: abilitiesById.get(item.imbued_ability_id),
    };
    if (buildItem.soldAt == null) {
      if (heldIds.has(upgrade.id)) continue;
      heldIds.add(upgrade.id);
    }
    shopItems.push(buildItem);
  }

  const slotClassNames = SIGNATURE_SLOTS.map((slot) => hero?.items[slot]);
  const firstAt = (entry: BuildAbility) => entry.unlockedAt ?? entry.upgradedAt[0];
  const slotOf = (entry: BuildAbility) => {
    const slot = slotClassNames.indexOf(entry.ability.class_name);
    return slot === -1 ? SIGNATURE_SLOTS.length : slot;
  };
  return {
    abilities: [...abilities.values()].toSorted((a, b) => slotOf(a) - slotOf(b) || firstAt(a) - firstAt(b)),
    items: shopItems,
  };
}
