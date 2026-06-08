import type { Ability, Hero } from "deadlock_api_client";

import type { FullBuildItem } from "~/components/MatchHistoryCard";
import { day } from "~/dayjs";

/** Shape of a match returned by the bulk metadata endpoint with player items + kda + info. */
export interface BulkMatchMetadata {
  match_id: number;
  start_time: string;
  duration_s: number;
  winning_team: string;
  match_mode: string;
  game_mode: string;
  average_badge_team0: number | null;
  average_badge_team1: number | null;
  players: {
    account_id: number;
    hero_id: number;
    team: string;
    kills: number;
    deaths: number;
    assists: number;
    items: {
      item_id: number;
      upgrade_id: number;
      game_time_s: number;
      sold_time_s: number;
      imbued_ability_id: number;
    }[];
  }[];
}

const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

export interface HeroAbilityMetadata {
  abilityIdToSlot: Map<number, number>;
  abilityIdToMaxLevel: Map<number, number>;
}

export function getHeroAbilityMetadata(heroData?: Hero, abilityItems?: Ability[]): HeroAbilityMetadata | null {
  if (!heroData || !abilityItems) return null;

  const abilityEntries = HERO_ABILITY_SLOTS.map((slot, index) => {
    const className = heroData.items?.[slot];
    if (!className) return null;

    const ability = abilityItems.find((item) => item.class_name === className);
    if (!ability) return null;

    return {
      abilityId: ability.id,
      slot: index + 1,
      maxLevel: (ability.upgrades?.length ?? 0) + 1,
    };
  }).filter((entry): entry is { abilityId: number; slot: number; maxLevel: number } => entry != null);

  if (abilityEntries.length === 0) return null;

  return {
    abilityIdToSlot: new Map(abilityEntries.map(({ abilityId, slot }) => [abilityId, slot])),
    abilityIdToMaxLevel: new Map(abilityEntries.map(({ abilityId, maxLevel }) => [abilityId, maxLevel])),
  };
}

export function getAbilityBuildData(
  items: BulkMatchMetadata["players"][number]["items"],
  abilityIdToSlot?: Map<number, number>,
  abilityIdToMaxLevel?: Map<number, number>,
) {
  if (!abilityIdToSlot || !abilityIdToMaxLevel) return undefined;

  const abilities = Array.from(abilityIdToSlot.entries()).map(([abilityId, slot]) => ({
    abilityId,
    slot,
    level: 0,
    maxLevel: abilityIdToMaxLevel.get(abilityId) ?? 1,
    maxedAt: undefined as number | undefined,
    lastUpgradeAt: undefined as number | undefined,
  }));

  const abilitiesById = new Map(abilities.map((ability) => [ability.abilityId, ability]));
  const abilityUpgradeSequence: number[] = [];

  for (const item of [...items].sort((a, b) => a.game_time_s - b.game_time_s)) {
    const ability = abilitiesById.get(item.item_id);
    if (!ability || ability.level >= ability.maxLevel) continue;

    ability.level += 1;
    ability.lastUpgradeAt = item.game_time_s;
    abilityUpgradeSequence.push(ability.slot);

    if (ability.level === ability.maxLevel && ability.maxedAt == null) {
      ability.maxedAt = item.game_time_s;
    }
  }

  const abilityBuildOrder = [...abilities]
    .sort((a, b) => {
      if (a.maxedAt != null && b.maxedAt != null) {
        return a.maxedAt - b.maxedAt || a.slot - b.slot;
      }
      if (a.maxedAt != null) return -1;
      if (b.maxedAt != null) return 1;
      return b.level - a.level || (b.lastUpgradeAt ?? -1) - (a.lastUpgradeAt ?? -1) || a.slot - b.slot;
    })
    .map((ability) => ability.slot);

  return {
    abilityBuildOrder,
    abilityUpgradeSequence,
  };
}

export interface UpgradeChainLookup {
  classNameById: Map<number, string>;
  componentsByItemId: Map<number, string[]>;
  /** item_id → soul cost (from assets). Used to compute cumulative souls-spent per purchase. */
  costById: Map<number, number>;
}

/** Build lookup: item_id → class_name / component class_names / soul cost, for upgrade-vs-sold + souls. */
export function buildUpgradeChainLookup(
  assetsItems?: { id: number; class_name: string; component_items?: string[] | null; cost?: number | null }[],
): UpgradeChainLookup | null {
  if (!assetsItems) return null;
  const classNameById = new Map<number, string>();
  const componentsByItemId = new Map<number, string[]>();
  const costById = new Map<number, number>();
  for (const item of assetsItems) {
    classNameById.set(item.id, item.class_name);
    if (item.component_items?.length) {
      componentsByItemId.set(item.id, item.component_items);
    }
    if (item.cost != null) costById.set(item.id, item.cost);
  }
  return { classNameById, componentsByItemId, costById };
}

/**
 * Map each item id → the transitive set of its component item ids. Owning a higher-tier item
 * implies owning its components even when the player bought the upgrade directly (the component
 * never appears as a separate purchase). Used to count implied presence for frequency/clustering.
 */
export function buildComponentImplications(
  assetsItems?: { id: number; class_name: string; component_items?: string[] | null }[],
): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (!assetsItems) return result;

  const idByClassName = new Map<string, number>();
  for (const item of assetsItems) idByClassName.set(item.class_name, item.id);

  const directComponentIds = new Map<number, number[]>();
  for (const item of assetsItems) {
    if (!item.component_items?.length) continue;
    const ids = item.component_items.map((cn) => idByClassName.get(cn)).filter((id): id is number => id != null);
    if (ids.length) directComponentIds.set(item.id, ids);
  }

  const memo = new Map<number, number[]>();
  const resolve = (id: number, stack: Set<number>): number[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    const out = new Set<number>();
    for (const c of directComponentIds.get(id) ?? []) {
      if (stack.has(c)) continue; // guard against malformed cycles
      out.add(c);
      stack.add(c);
      for (const t of resolve(c, stack)) out.add(t);
      stack.delete(c);
    }
    const arr = [...out];
    memo.set(id, arr);
    return arr;
  };

  for (const item of assetsItems) {
    const comps = resolve(item.id, new Set([item.id]));
    if (comps.length) result.set(item.id, comps);
  }
  return result;
}

export function timeAgo(dateStr: string): string {
  return day(`${dateStr}Z`).fromNow();
}

export interface PlayerBuildCard {
  matchId: number;
  gameMode: string;
  timeAgo: string;
  startTime: string;
  result: "win" | "loss";
  durationSeconds: number;
  heroId: number;
  accountId: number;
  kills: number;
  deaths: number;
  assists: number;
  itemIds: number[];
  buildData: {
    items: FullBuildItem[];
    abilityBuildOrder?: number[];
    abilityUpgradeSequence?: number[];
  };
  averageBadge?: number;
}

/**
 * Transform bulk match metadata into MatchHistoryCard-ready build cards for a single hero.
 * For each match, picks the player on `heroId`, extracts their shop purchases (upgrade_id === 1,
 * excluding ability items), resolves sold-vs-upgraded, and computes ability build order.
 */
export function buildPlayerBuildCards(
  metadata: BulkMatchMetadata[],
  heroId: number,
  heroAbilityMetadata: HeroAbilityMetadata | null,
  upgradeChainLookup: UpgradeChainLookup | null,
  options?: { accountId?: number },
): PlayerBuildCard[] {
  return metadata.flatMap((match) => {
    const player = options?.accountId
      ? match.players.find((p) => p.hero_id === heroId && p.account_id === options.accountId)
      : match.players.find((p) => p.hero_id === heroId);
    if (!player) return [];

    const abilityIds = heroAbilityMetadata?.abilityIdToSlot;
    const shopItems = player.items.filter((i) => i.upgrade_id === 1 && !abilityIds?.has(i.item_id));
    const boughtItemIds = new Set(shopItems.map((i) => i.item_id));
    const abilityBuildData = getAbilityBuildData(
      player.items,
      heroAbilityMetadata?.abilityIdToSlot,
      heroAbilityMetadata?.abilityIdToMaxLevel,
    );

    const sortedShop = [...shopItems].sort((a, b) => a.game_time_s - b.game_time_s);

    // Resolve sold-vs-upgraded and soul cost per shop item.
    const enriched = sortedShop.map((i) => {
      let sold = i.sold_time_s > 0;
      let upgraded = false;
      // An item with sold_time_s > 0 was UPGRADED (not truly sold) if its class_name is a component
      // of another item the player bought.
      if (sold && upgradeChainLookup) {
        const className = upgradeChainLookup.classNameById.get(i.item_id);
        if (className) {
          for (const [otherId, components] of upgradeChainLookup.componentsByItemId) {
            if (components.includes(className) && boughtItemIds.has(otherId)) {
              sold = false;
              upgraded = true;
              break;
            }
          }
        }
      }
      return { raw: i, sold, upgraded, cost: upgradeChainLookup?.costById.get(i.item_id) ?? 0 };
    });

    // Cumulative souls spent on items, processed in game-time order (sells before buys at equal
    // time, so a component's refund lands before its upgrade's buy). A normal sell refunds HALF the
    // cost; a component consumed by an upgrade refunds its FULL cost (its value carries into the
    // upgrade, which is logged at full price — verified in the event log).
    const events = enriched.flatMap((e, idx) =>
      e.raw.sold_time_s > 0
        ? [
            { t: e.raw.game_time_s, sell: false, idx },
            { t: e.raw.sold_time_s, sell: true, idx },
          ]
        : [{ t: e.raw.game_time_s, sell: false, idx }],
    );
    events.sort((a, b) => a.t - b.t || Number(a.sell) - Number(b.sell));
    const soulsByIdx = new Array<number>(enriched.length).fill(0);
    let cumulativeSouls = 0;
    for (const ev of events) {
      const e = enriched[ev.idx];
      if (ev.sell) {
        cumulativeSouls -= e.upgraded ? e.cost : e.cost / 2;
      } else {
        cumulativeSouls += e.cost;
        soulsByIdx[ev.idx] = cumulativeSouls;
      }
    }

    const fullBuildItems: FullBuildItem[] = enriched.map((e, idx) => ({
      itemId: e.raw.item_id,
      gameTimeS: e.raw.game_time_s,
      sold: e.sold,
      // Only set for truly-sold items; upgraded items have sold === false above.
      soldTimeS: e.sold ? e.raw.sold_time_s : undefined,
      soulsSpent: soulsByIdx[idx],
      imbuedAbilityNumber: heroAbilityMetadata?.abilityIdToSlot.get(e.raw.imbued_ability_id),
    }));

    const isWin = player.team === match.winning_team;
    const badge0 = match.average_badge_team0;
    const badge1 = match.average_badge_team1;
    const averageBadge =
      badge0 != null && badge1 != null ? Math.round((badge0 + badge1) / 2) : (badge0 ?? badge1 ?? undefined);

    return [
      {
        matchId: match.match_id,
        gameMode: match.match_mode,
        timeAgo: timeAgo(match.start_time),
        startTime: match.start_time,
        result: (isWin ? "win" : "loss") as "win" | "loss",
        durationSeconds: match.duration_s,
        heroId,
        accountId: player.account_id,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        itemIds: [] as number[],
        buildData: {
          items: fullBuildItems,
          abilityBuildOrder: abilityBuildData?.abilityBuildOrder,
          abilityUpgradeSequence: abilityBuildData?.abilityUpgradeSequence,
        },
        averageBadge,
      },
    ];
  });
}
