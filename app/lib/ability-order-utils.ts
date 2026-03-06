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
