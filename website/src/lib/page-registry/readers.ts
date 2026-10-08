import { heroSlug } from "~/lib/hero-slug";
import { itemSlug } from "~/lib/item-slug";

import type { Entity, ParamReader, Selection, SortKey } from "./types";

// The building blocks a registered page describes its parameters with: each reads one part of a selection and
// formats it the way the page's URL expects.

/**
 * Ids as a comma separated list. One id stays a number: the router would quote the string "15" (it reads as JSON),
 * and the page's list parser would not read it back.
 */
const ids = (entities: Entity[]) => {
  if (entities.length <= 1) return entities[0]?.id;
  return entities.map((entity) => entity.id).join(",");
};

/** The first hero's id. */
export const heroId = (): ParamReader => ({ uses: "hero", read: (s) => s.heroes[0]?.id });

/** Every hero's id, comma separated. */
export const heroIds = (): ParamReader => ({ uses: "heroes", read: (s) => ids(s.heroes) });

/**
 * How many heroes a combination holds: at least every hero named ("bebop mina and seven" is a trio), within the
 * sizes the page offers. Up to `smallest` heroes leave the page's default.
 */
export const comboSize = (smallest: number, largest: number): ParamReader => ({
  uses: "heroes",
  read: (s) => (s.heroes.length > smallest ? Math.min(s.heroes.length, largest) : undefined),
});

/** The first hero's codename (`atlas`), the sounds page's name for a hero's voice lines. */
export const heroCodename = (): ParamReader => ({ uses: "hero", read: (s) => s.heroes[0]?.codename });

/** The first hero's page slug, for a `$heroName` path segment. */
export const heroSlugParam = (): ParamReader => ({
  uses: "hero",
  read: (s) => (s.heroes[0] ? heroSlug(s.heroes[0].name) : undefined),
});

/** The other team's heroes, comma separated: the ones a "vs" or "against" question asks about. */
export const enemyHeroIds = (): ParamReader => ({ uses: "enemyHeroes", read: (s) => ids(s.enemyHeroes) });

/** The first item's id. */
export const itemId = (): ParamReader => ({ uses: "item", read: (s) => s.items[0]?.id });

/** Every item's id, comma separated. */
export const itemIds = (): ParamReader => ({ uses: "items", read: (s) => ids(s.items) });

/** The first item's page slug, for an `$itemName` path segment. */
export const itemSlugParam = (): ParamReader => ({
  uses: "item",
  read: (s) => (s.items[0] ? itemSlug(s.items[0].name) : undefined),
});

/** Heroes per team in each game mode: Street Brawl is 4v4. */
const teamSize = (selection: Selection) => (selection.mode === "street_brawl" ? 4 : 6);

/** A team as one id per slot, `0` for an empty slot: the team builder's format. */
export const teamSlots = (side: "heroes" | "enemyHeroes"): ParamReader => ({
  uses: side,
  read: (s) => {
    const team = s[side];
    if (team.length === 0) return undefined;
    return Array.from({ length: teamSize(s) }, (_, i) => team[i]?.id ?? 0).join(",");
  },
});

export const region = (): ParamReader => ({ uses: "region", read: (s) => s.region });

/** The page's own value for a shared sort key; a key the page does not support leaves its default. */
export const sortParam = (values: Partial<Record<SortKey, string>>): ParamReader => ({
  uses: "sort",
  read: (s) => (s.sort ? values[s.sort] : undefined),
});

/** The patch a selection names (only "the previous patch" names one), for a `$patchId` path segment. */
export const previousPatchId = (): ParamReader => ({
  uses: "patch",
  read: (s, context) => (s.time === "previous_patch" ? context.patches[1]?.id : undefined),
});
