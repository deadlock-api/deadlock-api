import type { AnalyticsAbilityOrderStats } from "deadlock_api_client";

export interface AbilityTrieNode {
  abilityId: number | null;
  depth: number;
  wins: number;
  losses: number;
  matches: number;
  players: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
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
    children: new Map(),
  };
}

export function buildAbilityTrie(data: AnalyticsAbilityOrderStats[]): AbilityTrieNode {
  const root = createNode(null, 0);

  for (const row of data) {
    let current = root;
    // Aggregate stats at root level too
    root.wins += row.wins;
    root.losses += row.losses;
    root.matches += row.matches;
    root.players += row.players;
    root.totalKills += row.total_kills;
    root.totalDeaths += row.total_deaths;
    root.totalAssists += row.total_assists;

    for (let i = 0; i < row.abilities.length; i++) {
      const abilityId = row.abilities[i];
      let child = current.children.get(abilityId);
      if (!child) {
        child = createNode(abilityId, i + 1);
        current.children.set(abilityId, child);
      }
      child.wins += row.wins;
      child.losses += row.losses;
      child.matches += row.matches;
      child.players += row.players;
      child.totalKills += row.total_kills;
      child.totalDeaths += row.total_deaths;
      child.totalAssists += row.total_assists;
      current = child;
    }
  }

  return root;
}

const BLOCK_BUDGETS = [6, 6]; // first two blocks; then 5 repeating
const ABILITY_COST_TABLE = [1, 2, 5]; // cost indexed by prior purchases of that ability

export function splitIntoPointBlocks(abilities: number[]): number[][] {
  const blocks: number[][] = [];
  let currentBlock: number[] = [];
  let blockIndex = 0;
  let blockCost = 0;
  const buyCounts = new Map<number, number>();

  const getBudget = (idx: number) => (idx < BLOCK_BUDGETS.length ? BLOCK_BUDGETS[idx] : 5);

  for (const ability of abilities) {
    const timesBought = buyCounts.get(ability) ?? 0;
    const cost = ABILITY_COST_TABLE[Math.min(timesBought, ABILITY_COST_TABLE.length - 1)];
    buyCounts.set(ability, timesBought + 1);

    currentBlock.push(ability);
    blockCost += cost;

    if (blockCost >= getBudget(blockIndex)) {
      blocks.push(currentBlock);
      currentBlock = [];
      blockIndex++;
      blockCost = 0;
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export function normalizeStreetBrawlAbilities(abilities: number[]): number[] {
  const blocks = splitIntoPointBlocks(abilities);
  return blocks.flatMap((block) => [...block].sort((a, b) => a - b));
}

export function mergeStreetBrawlRows(data: AnalyticsAbilityOrderStats[]): AnalyticsAbilityOrderStats[] {
  const groups = new Map<string, AnalyticsAbilityOrderStats>();

  for (const row of data) {
    const normalized = normalizeStreetBrawlAbilities(row.abilities);
    const key = JSON.stringify(normalized);
    const existing = groups.get(key);

    if (existing) {
      existing.wins += row.wins;
      existing.losses += row.losses;
      existing.matches += row.matches;
      existing.players += row.players;
      existing.total_kills += row.total_kills;
      existing.total_deaths += row.total_deaths;
      existing.total_assists += row.total_assists;
    } else {
      groups.set(key, {
        ...row,
        abilities: normalized,
        wins: row.wins,
        losses: row.losses,
        matches: row.matches,
        players: row.players,
        total_kills: row.total_kills,
        total_deaths: row.total_deaths,
        total_assists: row.total_assists,
      });
    }
  }

  return Array.from(groups.values());
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

/** Ability order rows packed by column: each order is a string of base-36 indexes into `ids`. A hero's orders use
 * four ability ids 15 times over, so this is about a seventh of the row JSON, and it is what the server dehydrates
 * into the page (1.5k rows on /analytics/abilities). */
export interface PackedAbilityOrders {
  ids: number[];
  orders: string[];
  wins: number[];
  losses: number[];
  matches: number[];
  players: number[];
  kills: number[];
  deaths: number[];
  assists: number[];
}

export function packAbilityOrders(
  rows: AnalyticsAbilityOrderStats[],
): PackedAbilityOrders | AnalyticsAbilityOrderStats[] {
  const ids = [...new Set(rows.flatMap((row) => row.abilities))];
  // One base-36 digit per ability; a set this large is not a hero's kit, so leave it as it is.
  if (ids.length > 36) return rows;
  const index = new Map(ids.map((id, i) => [id, i.toString(36)]));
  return {
    ids,
    orders: rows.map((row) => row.abilities.map((id) => index.get(id)).join("")),
    wins: rows.map((row) => row.wins),
    losses: rows.map((row) => row.losses),
    matches: rows.map((row) => row.matches),
    players: rows.map((row) => row.players),
    kills: rows.map((row) => row.total_kills),
    deaths: rows.map((row) => row.total_deaths),
    assists: rows.map((row) => row.total_assists),
  };
}

export function unpackAbilityOrders(
  packed: PackedAbilityOrders | AnalyticsAbilityOrderStats[],
): AnalyticsAbilityOrderStats[] {
  if (Array.isArray(packed)) return packed;
  return packed.orders.map((order, i) => ({
    abilities: Array.from(order, (digit) => packed.ids[Number.parseInt(digit, 36)]),
    wins: packed.wins[i],
    losses: packed.losses[i],
    matches: packed.matches[i],
    players: packed.players[i],
    total_kills: packed.kills[i],
    total_deaths: packed.deaths[i],
    total_assists: packed.assists[i],
  }));
}
