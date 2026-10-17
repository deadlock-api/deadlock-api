import { enemyHeroIds, findItem, findStat, heroId, itemIds, itemSlugParam, itemTiers } from "../readers";
import type { RegisteredPage } from "../types";

const ALL = ["mode", "rank", "time"] as const;

export const ITEM_PAGES: RegisteredPage[] = [
  {
    id: "item_stats",
    title: "Item Stats",
    description:
      "win rate of every item, optionally on one hero and against enemy heroes: best items, what to build on a hero, " +
      "what to buy against heroes",
    context: 'Which item to buy as one hero against another ("what to buy as haze vs bebop") is this page.',
    path: "/analytics/items",
    search: { hero: heroId(), enemy: enemyHeroIds(), include_items: itemIds(), item_tiers: itemTiers() },
    filters: ALL,
    find: findItem(),
  },
  {
    id: "item_page",
    title: "Item Page",
    description: "one item's own page: its win rate, which heroes buy it and when",
    path: "/analytics/items/$itemName",
    pathParams: { itemName: itemSlugParam() },
    fallbackPath: "/analytics/items",
    find: findStat({ winrate: "win_rate", matches: "matches" }),
  },
  {
    id: "item_timing",
    title: "Item Purchase Timing",
    description: "when to buy an item: its win rate by purchase time or by souls at purchase",
    path: "/analytics/items/item-purchase-analysis",
    search: { item_ids: itemIds(), hero: heroId(), enemy: enemyHeroIds() },
    filters: ALL,
  },
  {
    id: "build_flow",
    title: "Build Designer",
    description:
      "design a build for a hero: which items to buy in each stage of the game, what they cost, when to sell them and how the build wins",
    context: '"haze build" or "what to build on haze" is item_stats or build_flow.',
    path: "/analytics/items/build-flow",
    search: { hero: heroId() },
    filters: ALL,
  },
  {
    id: "build_stats",
    title: "Build Stats",
    description:
      "win rates of the published hero builds players start their matches with: the most played and best builds of a " +
      "hero, each build's items and skill order",
    context: '"best haze build" or "most popular haze builds" is build_stats.',
    path: "/analytics/builds",
    search: { hero: heroId() },
    filters: ALL,
  },
  {
    id: "item_combos",
    title: "Item Combos",
    description: "items bought together in one build and how those combinations win",
    path: "/analytics/items/combos",
    filters: ALL,
  },
  {
    id: "abilities",
    title: "Ability Stats",
    description: "a hero's ability and skill order: which abilities to level and upgrade first",
    path: "/analytics/abilities",
    search: { hero_id: heroId() },
    filters: ALL,
  },
];
