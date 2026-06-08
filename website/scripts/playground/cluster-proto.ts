/**
 * Clustering PROTOTYPE sandbox.
 *
 * Re-implements the average-build clustering pipeline with configurable knobs so we can sweep
 * fingerprint / weighting strategies against live data and find one that splits a player's games
 * into coherent archetypes. Once a config looks good it gets ported into ~/lib/average-build.ts and
 * verified with `pnpm bench:avg` (which runs the REAL lib).
 *
 * Run:  pnpm tsx scripts/playground/cluster-proto.ts [--account N --hero N --limit N]
 */

import { create } from "axios";
import { type Ability, HeroesApi, ItemsApi, MatchesApi, type Upgrade } from "deadlock_api_client";

import { type Build, cardsToBuilds } from "~/lib/average-build";
import {
  type BulkMatchMetadata,
  buildComponentImplications,
  buildPlayerBuildCards,
  buildUpgradeChainLookup,
  getHeroAbilityMetadata,
} from "~/lib/build-transform";

const API_ORIGIN = process.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "https://api.deadlock-api.com";
function arg(name: string, fb: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fb;
}
const ACCOUNT_ID = Number(arg("account", "127331261"));
const HERO_ID = Number(arg("hero", "7"));
const LIMIT = Number(arg("limit", "50"));

const client = create({ timeout: 30_000, headers: { Accept: "application/json" } });
const matchesApi = new MatchesApi(undefined, API_ORIGIN, client);
const heroesApi = new HeroesApi(undefined, API_ORIGIN, client);
const itemsApi = new ItemsApi(undefined, API_ORIGIN, client);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── configurable clustering ──────────────────────────────────────────────────
interface Config {
  name: string;
  fpCutoffSouls: number; // include items bought within this many cumulative souls
  minTier: number; // only fingerprint items of >= this tier (1 = keep all)
  minCost: number; // only fingerprint items costing >= this many souls (0 = keep all)
  weight: "flat" | "cost" | "tier" | "earlySouls"; // discriminative-item weight scheme
  discLo: number;
  discHi: number;
  minPairSep: number; // merge gate, in the SAME weighted units as `weight`
  minVariantFrac: number;
  minVariantFloor: number; // a variant needs at least this many games (kills 1-game "variants")
  maxK: number;
  minGamesToSplit: number;
  minDiscItems: number;
}

interface Ctx {
  costOf: (id: number) => number;
  tierOf: (id: number) => number;
}

function keep(id: number, cfg: Config, ctx: Ctx): boolean {
  return ctx.tierOf(id) >= cfg.minTier && ctx.costOf(id) >= cfg.minCost;
}
function fingerprint(b: Build, cfg: Config, ctx: Ctx): Map<number, number> {
  const fp = new Map<number, number>();
  for (const p of b.purchases) {
    if (p.sold || p.souls >= cfg.fpCutoffSouls) continue;
    if (!keep(p.itemId, cfg, ctx)) continue;
    if (!fp.has(p.itemId)) fp.set(p.itemId, p.souls);
  }
  for (const [itemId, { souls }] of b.implied) {
    if (souls < cfg.fpCutoffSouls && keep(itemId, cfg, ctx) && !fp.has(itemId)) fp.set(itemId, souls);
  }
  return fp;
}

function discriminative(fps: Map<number, number>[], cfg: Config): Set<number> {
  const n = fps.length;
  const counts = new Map<number, number>();
  for (const fp of fps) for (const i of fp.keys()) counts.set(i, (counts.get(i) ?? 0) + 1);
  const d = new Set<number>();
  for (const [i, c] of counts) if (c / n >= cfg.discLo && c / n <= cfg.discHi) d.add(i);
  return d;
}

function weightOf(it: number, fps: Map<number, number>[], cfg: Config, ctx: Ctx): number {
  switch (cfg.weight) {
    case "flat":
      return 1;
    case "cost":
      return Math.max(0.1, ctx.costOf(it) / 1500); // ~1 per 1500 souls of item cost
    case "tier":
      return ctx.tierOf(it); // 1..4
    case "earlySouls": {
      const ss: number[] = [];
      for (const fp of fps) {
        const s = fp.get(it);
        if (s != null) ss.push(s);
      }
      return median(ss) < 10000 ? 2 : 1;
    }
  }
}

function jaccard(a: Map<number, number>, b: Map<number, number>, disc: Set<number>, w: Map<number, number>): number {
  let shared = 0;
  let union = 0;
  const counted = new Set<number>();
  for (const i of a.keys()) {
    if (!disc.has(i)) continue;
    counted.add(i);
    const wi = w.get(i) ?? 1;
    union += wi;
    if (b.has(i)) shared += wi;
  }
  for (const i of b.keys()) {
    if (!disc.has(i) || counted.has(i)) continue;
    union += w.get(i) ?? 1;
  }
  return union === 0 ? 0 : 1 - shared / union;
}

const minIdx = (c: number[]) => c.reduce((m, x) => Math.min(m, x), Infinity);
function avgLink(c1: number[], c2: number[], d: number[][]): number {
  let t = 0;
  for (const a of c1) for (const b of c2) t += d[a][b];
  return t / (c1.length * c2.length);
}

function agglomerate(n: number, dist: number[][]): Map<number, number[][]> {
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const snaps = new Map<number, number[][]>([[n, clusters.map((c) => c.slice())]]);
  while (clusters.length > 1) {
    let bi = -1;
    let bj = -1;
    let bd = Infinity;
    let bm = Infinity;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = avgLink(clusters[i], clusters[j], dist);
        const mn = Math.min(minIdx(clusters[i]), minIdx(clusters[j]));
        if (d < bd || (d === bd && mn < bm)) {
          bd = d;
          bm = mn;
          bi = i;
          bj = j;
        }
      }
    const merged = [...clusters[bi], ...clusters[bj]];
    clusters = clusters.filter((_, k) => k !== bi && k !== bj).concat([merged]);
    snaps.set(
      clusters.length,
      clusters.map((c) => c.slice()),
    );
  }
  return snaps;
}

function silhouette(clusters: number[][], dist: number[][]): number {
  if (clusters.length < 2) return -1;
  const sils: number[] = [];
  clusters.forEach((c, ci) => {
    for (const p of c) {
      const same = c.filter((q) => q !== p);
      const a = same.length ? same.reduce((s, q) => s + dist[p][q], 0) / same.length : 0;
      let b = Infinity;
      clusters.forEach((c2, cj) => {
        if (cj === ci) return;
        const m = c2.reduce((s, q) => s + dist[p][q], 0) / c2.length;
        if (m < b) b = m;
      });
      const denom = Math.max(a, b === Infinity ? 0 : b);
      sils.push(denom === 0 ? 0 : (b - a) / denom);
    }
  });
  return sils.reduce((s, x) => s + x, 0) / sils.length;
}

function absorb(clusters: number[][], dist: number[][], minSize: number): number[][] {
  let changed = true;
  while (changed && clusters.length > 1) {
    changed = false;
    clusters.sort((a, b) => a.length - b.length || minIdx(a) - minIdx(b));
    for (let idx = 0; idx < clusters.length; idx++) {
      if (clusters[idx].length >= minSize) continue;
      let bk = -1;
      let bd = Infinity;
      let bm = Infinity;
      for (let k = 0; k < clusters.length; k++) {
        if (k === idx) continue;
        const d = avgLink(clusters[idx], clusters[k], dist);
        const mn = minIdx(clusters[k]);
        if (d < bd || (d === bd && mn < bm)) {
          bd = d;
          bm = mn;
          bk = k;
        }
      }
      clusters[bk] = clusters[bk].concat(clusters[idx]);
      clusters.splice(idx, 1);
      changed = true;
      break;
    }
  }
  return clusters;
}

function pairSep(
  c1: number[],
  c2: number[],
  fps: Map<number, number>[],
  w: Map<number, number>,
  disc: Set<number>,
): number {
  let sep = 0;
  for (const it of disc) {
    const r1 = c1.filter((g) => fps[g].has(it)).length / c1.length;
    const r2 = c2.filter((g) => fps[g].has(it)).length / c2.length;
    if (Math.abs(r1 - r2) >= 0.5) sep += w.get(it) ?? 1;
  }
  return sep;
}

function mergeWeak(
  clusters: number[][],
  fps: Map<number, number>[],
  w: Map<number, number>,
  disc: Set<number>,
  dist: number[][],
  minSep: number,
): number[][] {
  let changed = true;
  while (changed && clusters.length > 1) {
    changed = false;
    let best: { d: number; i: number; j: number } | null = null;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        if (pairSep(clusters[i], clusters[j], fps, w, disc) >= minSep) continue;
        const d = avgLink(clusters[i], clusters[j], dist);
        if (!best || d < best.d) best = { d, i, j };
      }
    if (best) {
      clusters[best.i] = clusters[best.i].concat(clusters[best.j]);
      clusters.splice(best.j, 1);
      changed = true;
    }
  }
  return clusters;
}

function cluster(
  builds: Build[],
  cfg: Config,
  ctx: Ctx,
): { clusters: number[][]; disc: Set<number>; fps: Map<number, number>[] } {
  const n = builds.length;
  const fps = builds.map((b) => fingerprint(b, cfg, ctx));
  const disc = discriminative(fps, cfg);
  if (n < cfg.minGamesToSplit || disc.size < cfg.minDiscItems)
    return { clusters: [Array.from({ length: n }, (_, i) => i)], disc, fps };
  const w = new Map<number, number>();
  for (const it of disc) w.set(it, weightOf(it, fps, cfg, ctx));
  const dist = fps.map((a) => fps.map((b) => jaccard(a, b, disc, w)));
  const snaps = agglomerate(n, dist);
  const minSize = Math.max(cfg.minVariantFloor, Math.ceil(cfg.minVariantFrac * n));
  let best: { sil: number; cl: number[][] } | null = null;
  for (let k = 2; k <= Math.min(cfg.maxK, n); k++) {
    let cl = (snaps.get(k) ?? []).map((c) => c.slice());
    cl = absorb(cl, dist, minSize);
    cl = mergeWeak(cl, fps, w, disc, dist, cfg.minPairSep);
    cl = absorb(cl, dist, minSize);
    if (cl.length < 2) continue;
    const sil = silhouette(cl, dist);
    if (!best || sil > best.sil) best = { sil, cl };
  }
  if (!best) return { clusters: [Array.from({ length: n }, (_, i) => i)], disc, fps };
  best.cl.sort((a, b) => b.length - a.length || minIdx(a) - minIdx(b));
  return { clusters: best.cl, disc, fps };
}

// ── runner ───────────────────────────────────────────────────────────────────
async function main() {
  const [up, ab, he, ma] = await Promise.all([
    itemsApi.getItemsByType({ type: "upgrade" }),
    itemsApi.getItemsByType({ type: "ability" }),
    heroesApi.listHeroes({ onlyActive: true }),
    matchesApi.bulkMetadata({
      includeInfo: true,
      includePlayerItems: true,
      includePlayerKda: true,
      includePlayerInfo: true,
      accountIds: [ACCOUNT_ID],
      heroIds: String(HERO_ID),
      gameMode: "normal", // mirror the site: exclude Street Brawl
      orderBy: "match_id",
      orderDirection: "desc",
      limit: LIMIT,
    }),
  ]);
  const assets = up.data as Upgrade[];
  const nameById = new Map(assets.map((i) => [i.id, i.name]));
  const costById = new Map(assets.map((i) => [i.id, i.cost ?? 0]));
  const tierById = new Map(assets.map((i) => [i.id, i.item_tier ?? 0]));
  const ctx: Ctx = { costOf: (id) => costById.get(id) ?? 0, tierOf: (id) => tierById.get(id) ?? 0 };
  const nameOf = (id: number) => nameById.get(id) ?? `#${id}`;

  const hero = he.data.find((h) => h.id === HERO_ID);
  const meta = getHeroAbilityMetadata(hero, ab.data as Ability[]);
  const lookup = buildUpgradeChainLookup(assets);
  const impl = buildComponentImplications(assets);
  const cards = buildPlayerBuildCards(ma.data as unknown as BulkMatchMetadata[], HERO_ID, meta, lookup, {
    accountId: ACCOUNT_ID,
  });
  const builds = cardsToBuilds(cards, impl);
  console.log(`account ${ACCOUNT_ID} hero ${HERO_ID}: ${builds.length} builds\n`);

  const base: Config = {
    name: "",
    fpCutoffSouls: 25000,
    minTier: 1,
    minCost: 0,
    weight: "earlySouls",
    discLo: 0.15,
    discHi: 0.85,
    minPairSep: 4,
    minVariantFrac: 0.15,
    minVariantFloor: 1,
    maxK: 4,
    minGamesToSplit: 4,
    minDiscItems: 4,
  };

  // Candidate "final" config (cost-gated fingerprint + cost weighting + 2-game variant floor).
  const CHOSEN: Config = {
    ...base,
    name: "CHOSEN: cost>=1250 fp, cost-wt, sep 2.5, k5, frac .10, floor 2",
    minCost: 1250,
    weight: "cost",
    minPairSep: 2.5,
    maxK: 5,
    minVariantFrac: 0.1,
    minVariantFloor: 2,
  };

  const sepBase = { ...CHOSEN };
  const configs: Config[] = [
    { ...sepBase, name: "sep 2.5", minPairSep: 2.5 },
    { ...sepBase, name: "sep 3.0", minPairSep: 3.0 },
    { ...sepBase, name: "sep 3.5", minPairSep: 3.5 },
  ];

  const DUMP = process.argv.includes("--dump"); // also print each game's items per cluster
  for (const cfg of configs) {
    const { clusters, disc, fps } = cluster(builds, cfg, ctx);
    console.log("=".repeat(90));
    console.log(
      `CONFIG: ${cfg.name}   -> ${clusters.length} clusters, sizes ${clusters.map((c) => c.length).join("/")}  (disc=${disc.size})`,
    );
    clusters.forEach((cl, i) => {
      // signature = items present in >= 60% of the cluster, sorted by presence
      const counts = new Map<number, number>();
      for (const g of cl) for (const it of fps[g].keys()) counts.set(it, (counts.get(it) ?? 0) + 1);
      const sig = [...counts.entries()]
        .map(([it, c]) => ({ it, rate: c / cl.length }))
        .filter((x) => x.rate >= 0.6)
        .sort((a, b) => b.rate - a.rate)
        .map((x) => `${nameOf(x.it)}:${Math.round(x.rate * 100)}%`);
      console.log(`  ${String.fromCharCode(65 + i)} (${cl.length}): ${sig.join("  ")}`);
      if (DUMP) {
        for (const g of cl) {
          const items = [...fps[g].entries()]
            .sort((x, y) => x[1] - y[1])
            .map(([id, s]) => `${disc.has(id) ? "*" : ""}${nameOf(id)}@${Math.round(s / 100) / 10}k`);
          console.log(`       [${builds[g].matchId}] ${items.join("  ")}`);
        }
      }
    });
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
