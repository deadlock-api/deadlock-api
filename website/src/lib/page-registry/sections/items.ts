import { enemyHeroId, heroId, itemIds, itemSlugParam } from "../readers";
import type { RegisteredPage } from "../types";

const ALL = ["mode", "rank", "time"] as const;

export const ITEM_PAGES: RegisteredPage[] = [
  {
    id: "item_stats",
    label: "Item stats",
    description:
      "win rate of every item, optionally on one hero and against an enemy hero: best items, what to build on a hero, " +
      "what to buy against a hero",
    context: 'Which item to buy as one hero against another ("what to buy as haze vs bebop") is this page.',
    path: "/analytics/items",
    search: { hero: heroId(), enemy: enemyHeroId(), include_items: itemIds() },
    filters: ALL,
  },
  {
    id: "item_page",
    label: "Item overview",
    description: "one item's own page: its win rate, which heroes buy it and when",
    path: "/analytics/items/$itemName",
    pathParams: { itemName: itemSlugParam() },
    fallbackPath: "/analytics/items",
  },
  {
    id: "item_timing",
    label: "Item timing",
    description: "when to buy an item: its win rate by purchase time or by souls at purchase",
    path: "/analytics/items/item-purchase-analysis",
    search: { item_ids: itemIds(), hero: heroId(), enemy: enemyHeroId() },
    filters: ALL,
  },
  {
    id: "build_flow",
    label: "Build order",
    description: "a hero's build order: which items are bought first, second and later, and how each path wins",
    context: '"haze build" or "what to build on haze" is item_stats or build_flow.',
    path: "/analytics/items/build-flow",
    search: { hero: heroId() },
    filters: ALL,
  },
  {
    id: "item_combos",
    label: "Item combos",
    description: "items bought together in one build and how those combinations win",
    path: "/analytics/items/combos",
    filters: ALL,
  },
  {
    id: "abilities",
    label: "Ability order",
    description: "a hero's ability and skill order: which abilities to level and upgrade first",
    path: "/analytics/abilities",
    search: { hero_id: heroId() },
    filters: ALL,
  },
];
