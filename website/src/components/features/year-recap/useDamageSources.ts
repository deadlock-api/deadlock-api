import { useQuery } from "@tanstack/react-query";

import { type DamageSource, weaponCodename } from "~/lib/year-recap/recap";
import {
  abilitiesQueryOptions,
  heroesQueryOptions,
  itemUpgradesQueryOptions,
  weaponsQueryOptions,
} from "~/queries/asset-queries";

export type DamageSourceArt = { abilityId: number } | { itemId: number } | { heroId: number } | null;

export interface NamedDamageSource extends DamageSource {
  name: string;
  /** Whose it is, for a weapon: "Seven's weapon". */
  detail?: string;
  art: DamageSourceArt;
}

/** "ability_fencer_lunge" with no asset: the words after the first, capitalised. */
function fallbackName(source: string): string {
  const words = source.replace(/^(citadel_)?(ability|upgrade|weapon)_/, "").split("_");
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/**
 * Names and art for damage sources by class name: abilities and shop items from their asset lists, a weapon by its own
 * name ("Cold Calculus") with its hero's art, or as "Seven's weapon" while the weapon list is missing.
 */
export function useNamedDamageSources(sources: readonly DamageSource[]): NamedDamageSource[] {
  const { data: abilities } = useQuery(abilitiesQueryOptions);
  const { data: items } = useQuery(itemUpgradesQueryOptions);
  const { data: heroes } = useQuery(heroesQueryOptions);
  const { data: weapons } = useQuery(weaponsQueryOptions);
  return sources.map((source) => {
    if (source.kind === "weapon") {
      const weapon = weapons?.find((candidate) => candidate.class_name === source.source);
      const hero =
        heroes?.find((candidate) => weapon?.hero != null && candidate.id === weapon.hero) ??
        heroes?.find((candidate) => candidate.class_name === `hero_${weaponCodename(source.source)}`);
      const owner = hero ? `${hero.name}'s weapon` : "Weapon";
      return {
        ...source,
        name: weapon?.name ?? owner,
        detail: weapon?.name ? owner : undefined,
        art: hero ? { heroId: hero.id } : null,
      };
    }
    if (source.kind === "item") {
      const item = items?.find((candidate) => candidate.class_name === source.source);
      return { ...source, name: item?.name ?? fallbackName(source.source), art: item ? { itemId: item.id } : null };
    }
    const ability = abilities?.find((candidate) => candidate.class_name === source.source);
    return {
      ...source,
      name: ability?.name ?? fallbackName(source.source),
      art: ability ? { abilityId: ability.id } : null,
    };
  });
}
