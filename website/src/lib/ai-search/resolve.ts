import {
  type Entity,
  type PageTarget,
  registeredPage,
  type ResolveContext,
  resolvePage,
  type Selection,
} from "~/lib/page-registry";
import { MAX_BADGE } from "~/lib/rank-utils";

import type { SearchIntent } from "./intent";

export interface RankTier {
  tier: number;
  name: string;
}

/** What the intent's names are looked up in. */
export interface Catalog {
  heroes: readonly Entity[];
  items: readonly Entity[];
  ranks: readonly RankTier[];
}

function lookUp(names: readonly string[], entities: readonly Entity[]): Entity[] {
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
  return {
    min: min === undefined || min === 0 ? 0 : min * 10 + 1,
    max: max === undefined ? MAX_BADGE : max === 0 ? 0 : max * 10 + 6,
  };
}

/** The intent's names and words as a registry selection. */
export function selectionOf(intent: SearchIntent, catalog: Catalog): Selection {
  return {
    heroes: lookUp(intent.heroes, catalog.heroes),
    enemyHeroes: lookUp(intent.enemy_heroes, catalog.heroes),
    items: lookUp(intent.items, catalog.items),
    rank: rankRange(intent, catalog.ranks),
    mode: intent.mode ?? undefined,
    time: intent.time ?? undefined,
    region: intent.region ?? undefined,
    sort: intent.sort ?? undefined,
  };
}

/** The pages the intent names, best first, each with its URL; two picks that land on the same URL count once. */
export function resolveIntent(intent: SearchIntent, catalog: Catalog, context: ResolveContext): PageTarget[] {
  const selection = selectionOf(intent, catalog);
  const seen = new Set<string>();
  return intent.pages.flatMap((id) => {
    const page = registeredPage(id);
    if (!page) return [];
    const target = resolvePage(page, selection, context);
    const key = target.path + JSON.stringify(target.search);
    if (seen.has(key)) return [];
    seen.add(key);
    return [target];
  });
}
