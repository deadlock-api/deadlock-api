import {
  type Entity,
  type HeroEntity,
  type PageTarget,
  registeredPage,
  type ResolveContext,
  resolvePage,
  type Selection,
} from "~/lib/page-registry";
import { bandBadges, MAX_BADGE } from "~/lib/rank-utils";

import type { SearchIntent } from "./intent";

export interface RankTier {
  tier: number;
  name: string;
}

/** What the intent's names are looked up in. */
export interface Catalog {
  heroes: readonly HeroEntity[];
  items: readonly Entity[];
  ranks: readonly RankTier[];
}

function lookUp<T extends Entity>(names: readonly string[], entities: readonly T[]): T[] {
  return names.flatMap((name) => entities.find((entity) => entity.name === name) ?? []);
}

function tierOf(name: string | null, ranks: readonly RankTier[]): number | undefined {
  return name === null ? undefined : ranks.find((rank) => rank.name === name)?.tier;
}

/**
 * The badge range of the named tiers, from the first subrank of the lower to the last of the upper. A one-sided
 * question ("Phantom and up") opens the other end, so a page whose default floor is Phantom does not keep it.
 */
function rankRange(intent: SearchIntent, ranks: readonly RankTier[]): Selection["rank"] {
  let min = tierOf(intent.rank_min, ranks);
  let max = tierOf(intent.rank_max, ranks);
  if (min === undefined && max === undefined) return undefined;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  const band = bandBadges({ from: min ?? 0, to: max ?? 0 });
  // Obscurus (tier 0) is one badge, 0, with no subranks.
  return { min: min ? band.min : 0, max: max === undefined ? MAX_BADGE : max === 0 ? 0 : band.max };
}

/** The intent's names and words as a registry selection. */
function selectionOf(intent: SearchIntent, catalog: Catalog): Selection {
  return {
    heroes: lookUp(intent.heroes, catalog.heroes),
    enemyHeroes: lookUp(intent.enemy_heroes, catalog.heroes),
    items: lookUp(intent.items, catalog.items),
    itemTiers: intent.item_tiers,
    rank: rankRange(intent, catalog.ranks),
    mode: intent.mode ?? undefined,
    time: intent.time ?? undefined,
    region: intent.region ?? undefined,
    sort: intent.sort ?? undefined,
  };
}

/** Where the intent leads: its page, opened with its heroes and filters; undefined when it names no page. */
export function resolveIntent(intent: SearchIntent, catalog: Catalog, context: ResolveContext): PageTarget | undefined {
  const page = intent.page === null ? undefined : registeredPage(intent.page);
  return page && resolvePage(page, selectionOf(intent, catalog), context);
}
