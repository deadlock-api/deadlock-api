import type { AnalyticsAbilityOrderTreeNode } from "deadlock_api_client";

export interface AbilityTrieNode {
  abilityId: number | null;
  depth: number;
  wins: number;
  losses: number;
  matches: number;
  /** Distinct players on the node. On the root, the sum of the first upgrades': a player with two openers counts twice. */
  players: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  /** When the players on this node took its upgrade, on average (seconds); null on the root. */
  avgTimeS: number | null;
  children: Map<number, AbilityTrieNode>;
}

function createNode(abilityId: number | null, depth: number): AbilityTrieNode {
  return {
    abilityId,
    depth,
    wins: 0,
    losses: 0,
    matches: 0,
    players: 0,
    totalKills: 0,
    totalDeaths: 0,
    totalAssists: 0,
    avgTimeS: null,
    children: new Map(),
  };
}

/**
 * The tree of the API's order prefixes: each row is one node, with the stats of every player whose order starts with
 * it. The API keeps a node's parent whenever it keeps the node; the root sums the first upgrades.
 */
export function buildAbilityTrie(rows: readonly AnalyticsAbilityOrderTreeNode[]): AbilityTrieNode {
  const root = createNode(null, 0);

  for (const row of rows) {
    let node = root;
    for (const [i, abilityId] of row.abilities.entries()) {
      let child = node.children.get(abilityId);
      if (!child) {
        child = createNode(abilityId, i + 1);
        node.children.set(abilityId, child);
      }
      node = child;
    }
    if (node === root) continue;
    node.wins = row.wins;
    node.losses = row.losses;
    node.matches = row.matches;
    node.players = row.players;
    node.totalKills = row.total_kills;
    node.totalDeaths = row.total_deaths;
    node.totalAssists = row.total_assists;
    node.avgTimeS = Number.isFinite(row.avg_upgrade_time_s) ? row.avg_upgrade_time_s : null;
    if (row.abilities.length === 1) {
      root.wins += row.wins;
      root.losses += row.losses;
      root.matches += row.matches;
      root.players += row.players;
      root.totalKills += row.total_kills;
      root.totalDeaths += row.total_deaths;
      root.totalAssists += row.total_assists;
    }
  }

  return root;
}

export function getWinRate(node: AbilityTrieNode): number {
  if (node.matches === 0) return 0;
  return node.wins / node.matches;
}

export function getPickRate(node: AbilityTrieNode, parentMatches: number): number {
  if (parentMatches === 0) return 0;
  return node.matches / parentMatches;
}

export function getSortedChildren(node: AbilityTrieNode): AbilityTrieNode[] {
  return Array.from(node.children.values()).sort((a, b) => b.matches - a.matches);
}

/** Ability order tree nodes packed by column: each node's order prefix is a string of base-36 indexes into `ids`. A
 * hero's orders use four ability ids 15 times over, so this is a fraction of the row JSON, and it is what the server
 * dehydrates into the page (thousands of nodes on /analytics/abilities). `matches` is left out: the API computes it as
 * wins + losses. */
export interface PackedAbilityOrderTree {
  ids: number[];
  orders: string[];
  wins: number[];
  losses: number[];
  players: number[];
  kills: number[];
  deaths: number[];
  assists: number[];
  /** Each node's average upgrade time in whole seconds. */
  times: number[];
}

export function packAbilityOrderTree(
  rows: AnalyticsAbilityOrderTreeNode[],
): PackedAbilityOrderTree | AnalyticsAbilityOrderTreeNode[] {
  const ids = [...new Set(rows.flatMap((row) => row.abilities))];
  // One base-36 digit per ability; a set this large is not a hero's kit, so leave it as it is.
  if (ids.length > 36) return rows;
  const index = new Map(ids.map((id, i) => [id, i.toString(36)]));
  return {
    ids,
    orders: rows.map((row) => row.abilities.map((id) => index.get(id)).join("")),
    wins: rows.map((row) => row.wins),
    losses: rows.map((row) => row.losses),
    players: rows.map((row) => row.players),
    kills: rows.map((row) => row.total_kills),
    deaths: rows.map((row) => row.total_deaths),
    assists: rows.map((row) => row.total_assists),
    times: rows.map((row) => Math.round(row.avg_upgrade_time_s)),
  };
}

export function unpackAbilityOrderTree(
  packed: PackedAbilityOrderTree | AnalyticsAbilityOrderTreeNode[],
): AnalyticsAbilityOrderTreeNode[] {
  if (Array.isArray(packed)) return packed;
  return packed.orders.map((order, i) => ({
    abilities: Array.from(order, (digit) => packed.ids[Number.parseInt(digit, 36)]),
    wins: packed.wins[i],
    losses: packed.losses[i],
    matches: packed.wins[i] + packed.losses[i],
    players: packed.players[i],
    total_kills: packed.kills[i],
    total_deaths: packed.deaths[i],
    total_assists: packed.assists[i],
    avg_upgrade_time_s: packed.times[i],
  }));
}
