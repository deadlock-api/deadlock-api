import type { PlayerBuildCard } from "~/lib/build-transform";

/**
 * Compute a representative "average build" for a player across their recent matches on one hero —
 * a canonical, ordered, phase-grouped item-purchase template that captures what the player
 * typically does while honoring variation across games.
 *
 * The defining correctness property is the *sequencing*: entries are ordered by Copeland
 * pairwise-precedence aggregation over the player's real per-game purchase orders, NOT by
 * independent median times. (scripts/playground/bench-average-build.ts exercises this on live data.)
 *
 * Sold items are KEPT (they're real, often-deliberate purchases — e.g. Extra Regen bought early
 * and sold later for slot space). Items the player typically sells when crunched for slots get a
 * "sell order" badge (1 = sold first) on the top few by typical sell time. Note: items sold only
 * because they were *upgraded* into a bigger item are not counted as sold (resolved upstream).
 */

export type BuildPhase = "early" | "mid" | "late";

// Phase boundaries (match the existing MatchHistoryCard UI).
const PHASE_EARLY_MAX_S = 600;
const PHASE_MID_MAX_S = 1200;

// Frequency tiers.
const CORE_FREQ = 0.8; // >= 80% of builds → rigid core backbone
const COMMON_FREQ = 0.55; // 55–80% → commonly bought (rendered inline, softer)
const FLEX_MIN_FREQ = 0.25; // must appear in >= 25% of games to be a flex candidate
const OPTIONAL_DISPLAY_MIN_FREQ = 0.15; // hide one-off noise below ~3/20 games

// Flex-slot detection (genuine substitution evidence).
const FLEX_SOULS_WINDOW = 3000; // members' median souls-spent within ~3k souls of each other
const FLEX_MAX_COOCCUR = 0.12; // members rarely co-occur (substitute, not coexist)
const FLEX_MIN_SLOT_FREQ = 0.9; // the slot fires in >= 90% of games
const FLEX_MIN_LIFT = 1.6; // combined freq >= 1.6× best single member (anti-spurious)
const FLEX_MIN_BUILDS = 10; // below this, co-occurrence is unreliable → skip flex

// Sell-order badges: which displayed items the player typically sells first when slot-crunched.
const SELL_BADGE_MIN_RATE = 0.3; // item must be sold in >= 30% of the games it's bought
const SELL_BADGE_MIN_SOLD = 2; // and sold in >= 2 games (avoid single-game noise)
const SELL_BADGE_MAX = 3; // players rarely sell more than ~3 items in a game

function phaseOf(t: number): BuildPhase {
  if (t < PHASE_EARLY_MAX_S) return "early";
  if (t < PHASE_MID_MAX_S) return "mid";
  return "late";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface AverageBuildItem {
  itemId: number;
  /** Number of games (builds) the item appears in. */
  count: number;
  /** count / nBuilds */
  frequency: number;
  /** Median game_time_s across games it appears in. */
  medianTimeS: number;
  /** Median 0-based purchase index across those games. */
  medianIndex: number;
  phase: BuildPhase;
  /** Fraction of the games it appears in where it was truly sold (not upgraded). */
  soldRate: number;
  /** 1-based "sell order" badge (1 = typically sold first) for the top few usually-sold items. */
  sellOrder?: number;
}

export type TimelineEntry =
  | { kind: "core"; medianTimeS: number; phase: BuildPhase; item: AverageBuildItem }
  | { kind: "common"; medianTimeS: number; phase: BuildPhase; item: AverageBuildItem }
  | {
      kind: "flex";
      medianTimeS: number;
      phase: BuildPhase;
      /** Fraction of games the slot is filled by at least one candidate. */
      slotFrequency: number;
      /** Candidate items, sorted by descending frequency (primary choice first). */
      candidates: AverageBuildItem[];
    };

export interface BuildVariant {
  /** Stable display id, ordered by descending game count: "A", "B", "C", … (no semantic label). */
  id: string;
  nGames: number;
  /** Games won within this variant. */
  wins: number;
  /** nGames / nBuilds */
  frequency: number;
  phases: { early: TimelineEntry[]; mid: TimelineEntry[]; late: TimelineEntry[] };
  /** Flat, precedence-ordered list of core + common + flex entries. */
  timeline: TimelineEntry[];
  /** Situational items, sorted by descending frequency then median time. */
  optionals: AverageBuildItem[];
}

export interface AverageBuild {
  nBuilds: number;
  /** Total games won across all variants. */
  wins: number;
  /** Distinct build variants (clusters of similar games), ordered by descending game count. */
  variants: BuildVariant[];
}

export interface Purchase {
  itemId: number;
  gameTimeS: number;
  /** Cumulative souls spent on items at this purchase (refund-adjusted) — the COMPUTATION coordinate. */
  souls: number;
  sold: boolean;
  soldTimeS?: number;
}

export interface Build {
  matchId: number;
  win: boolean;
  purchases: Purchase[]; // explicit shop purchases, time-ordered (sold items kept)
  /** itemId → effective owned coordinate, for components implied by a directly-bought upgrade. */
  implied: Map<number, { time: number; souls: number }>;
}

interface ItemStat {
  itemId: number;
  count: number; // games where present (explicit OR implied)
  frequency: number;
  medianTimeS: number; // DISPLAY coordinate (median game time)
  medianSouls: number; // COMPUTATION coordinate (median cumulative souls spent) — souls is farm-independent
  medianIndex: number;
  times: number[]; // explicit buy times only (implied buys don't bias timing)
  souls: number[]; // explicit souls-spent coordinates only
  indices: number[]; // explicit purchase indices only
  impliedTimes: number[]; // owned-times from implied (chunk) buys; fallback for all-implied items
  impliedSouls: number[]; // owned-souls from implied (chunk) buys; fallback for all-implied items
  hasExplicit: boolean; // true if explicitly bought in >= 1 game
  games: Set<number>; // games where present (explicit OR implied) — drives co-occurrence/clustering
  explicitCount: number; // games explicitly bought (sell-rate denominator)
  soldCount: number;
  soldTimes: number[];
  soldRate: number;
  medianSoldTimeS: number;
}

function toItem(st: ItemStat): AverageBuildItem {
  return {
    itemId: st.itemId,
    count: st.count,
    frequency: st.frequency,
    medianTimeS: st.medianTimeS,
    medianIndex: st.medianIndex,
    phase: phaseOf(st.medianTimeS),
    soldRate: st.soldRate,
  };
}

function computeItemStats(builds: Build[]): Map<number, ItemStat> {
  const n = builds.length;
  const byItem = new Map<number, ItemStat>();
  const ensure = (itemId: number): ItemStat => {
    let st = byItem.get(itemId);
    if (!st) {
      st = {
        itemId,
        count: 0,
        frequency: 0,
        medianTimeS: 0,
        medianSouls: 0,
        medianIndex: 0,
        times: [],
        souls: [],
        indices: [],
        impliedTimes: [],
        impliedSouls: [],
        hasExplicit: false,
        games: new Set(),
        explicitCount: 0,
        soldCount: 0,
        soldTimes: [],
        soldRate: 0,
        medianSoldTimeS: 0,
      };
      byItem.set(itemId, st);
    }
    return st;
  };

  for (const b of builds) {
    // First purchase of each itemId within this game (dedupe re-buys).
    const seen = new Map<number, { time: number; souls: number; index: number; sold: boolean; soldTimeS?: number }>();
    b.purchases.forEach((p, idx) => {
      if (!seen.has(p.itemId))
        seen.set(p.itemId, { time: p.gameTimeS, souls: p.souls, index: idx, sold: p.sold, soldTimeS: p.soldTimeS });
    });
    for (const [itemId, { time, souls, index, sold, soldTimeS }] of seen) {
      const st = ensure(itemId);
      st.times.push(time);
      st.souls.push(souls);
      st.indices.push(index);
      st.explicitCount += 1;
      st.games.add(b.matchId);
      if (sold) {
        st.soldCount += 1;
        if (soldTimeS != null) st.soldTimes.push(soldTimeS);
      }
    }
    // Implied components (bought as part of a directly-purchased upgrade): count for presence,
    // but record their coordinate only as a fallback — they must not bias explicit-buy sequencing.
    for (const [itemId, { time, souls }] of b.implied) {
      const st = ensure(itemId);
      st.impliedTimes.push(time);
      st.impliedSouls.push(souls);
      st.games.add(b.matchId);
    }
  }
  for (const st of byItem.values()) {
    st.count = st.games.size;
    st.frequency = n ? st.count / n : 0;
    st.hasExplicit = st.times.length > 0;
    st.medianTimeS = median(st.hasExplicit ? st.times : st.impliedTimes);
    st.medianSouls = median(st.hasExplicit ? st.souls : st.impliedSouls);
    st.medianIndex = median(st.indices);
    st.soldRate = st.explicitCount ? st.soldCount / st.explicitCount : 0;
    st.medianSoldTimeS = median(st.soldTimes);
  }
  return byItem;
}

/** Greedily cluster flex-candidate items into substitution slots. Returns [keptGroups, leftover]. */
function detectFlexGroups(candidates: ItemStat[], n: number): [ItemStat[][], ItemStat[]] {
  if (n < FLEX_MIN_BUILDS) return [[], [...candidates]];

  const cooccur = (a: ItemStat, b: ItemStat): number => {
    let inter = 0;
    for (const g of a.games) if (b.games.has(g)) inter += 1;
    const union = a.games.size + b.games.size - inter;
    return union ? inter / union : 0;
  };

  // Seed from most-frequent candidates first so slots form around anchors.
  const pool = [...candidates].sort((x, y) => y.frequency - x.frequency || x.medianSouls - y.medianSouls);
  const used = new Set<number>();
  const keptGroups: ItemStat[][] = [];

  for (const seed of pool) {
    if (used.has(seed.itemId)) continue;
    const group: ItemStat[] = [seed];
    for (const cand of pool) {
      if (used.has(cand.itemId) || cand === seed || group.includes(cand)) continue;
      const slotSouls = median(group.map((m) => m.medianSouls));
      if (Math.abs(cand.medianSouls - slotSouls) > FLEX_SOULS_WINDOW) continue;
      if (group.every((m) => cooccur(cand, m) <= FLEX_MAX_COOCCUR)) group.push(cand);
    }
    if (group.length >= 2) {
      const unionGames = new Set<number>();
      for (const m of group) for (const g of m.games) unionGames.add(g);
      const combinedFreq = n ? unionGames.size / n : 0;
      const bestSingle = Math.max(...group.map((m) => m.frequency));
      if (combinedFreq >= FLEX_MIN_SLOT_FREQ && combinedFreq >= FLEX_MIN_LIFT * bestSingle) {
        for (const m of group) used.add(m.itemId);
        keptGroups.push([...group].sort((a, b) => b.frequency - a.frequency));
      }
    }
  }
  const leftover = candidates.filter((st) => !used.has(st.itemId));
  return [keptGroups, leftover];
}

interface SeqUnit {
  key: string;
  itemIds: number[];
  medianSouls: number;
}

/**
 * Order units by the player's ACTUAL within-game purchase order via Copeland rank aggregation.
 * A unit's per-game coordinate is the souls-spent at the first time any of its itemIds was bought
 * that game (souls is farm-independent). Copeland = (#pairwise wins) − (#losses); median souls breaks ties.
 */
function orderByPrecedence<T extends SeqUnit>(units: T[], builds: Build[], alwaysImplied: Set<number>): T[] {
  const gameTimes: Map<number, number>[] = builds.map((b) => {
    const seen = new Map<number, number>();
    for (const p of b.purchases) if (!seen.has(p.itemId)) seen.set(p.itemId, p.souls);
    // Items that are NEVER bought explicitly (always chunked into an upgrade) have no explicit
    // souls, so fall back to their implied owned-souls for sequencing. Partially-explicit items
    // deliberately ignore implied coordinates here so chunk-buy games don't drag them later.
    for (const [itemId, { souls }] of b.implied)
      if (alwaysImplied.has(itemId) && !seen.has(itemId)) seen.set(itemId, souls);
    return seen;
  });

  const unitTime = (u: SeqUnit, g: Map<number, number>): number | null => {
    let min: number | null = null;
    for (const id of u.itemIds) {
      const t = g.get(id);
      if (t != null && (min == null || t < min)) min = t;
    }
    return min;
  };

  const keys = units.map((u) => u.key);
  const before = new Map<string, Map<string, number>>(keys.map((k) => [k, new Map(keys.map((j) => [j, 0]))]));
  for (const g of gameTimes) {
    const times = new Map<string, number | null>(units.map((u) => [u.key, unitTime(u, g)]));
    for (const a of keys) {
      const ta = times.get(a);
      if (ta == null) continue;
      for (const b of keys) {
        if (a === b) continue;
        const tb = times.get(b);
        if (tb != null && ta < tb) {
          const row = before.get(a)!;
          row.set(b, row.get(b)! + 1);
        }
      }
    }
  }

  const score = new Map<string, number>();
  for (const a of keys) {
    let wins = 0;
    let losses = 0;
    for (const b of keys) {
      if (a === b) continue;
      const ab = before.get(a)!.get(b)!;
      const ba = before.get(b)!.get(a)!;
      if (ab > ba) wins += 1;
      else if (ab < ba) losses += 1;
    }
    score.set(a, wins - losses);
  }

  return [...units].sort((a, b) => {
    const ds = score.get(b.key)! - score.get(a.key)!;
    if (ds !== 0) return ds;
    if (a.medianSouls !== b.medianSouls) return a.medianSouls - b.medianSouls;
    return Math.min(...a.itemIds) - Math.min(...b.itemIds);
  });
}

/**
 * Assign sell-order badges (1 = sold first) to the displayed items the player typically sells
 * when crunched for slots. Ranked by median sell time; capped at SELL_BADGE_MAX.
 * Mutates the passed AverageBuildItem objects (they're the same instances rendered).
 */
function assignSellOrder(displayed: AverageBuildItem[], stats: Map<number, ItemStat>): void {
  const eligible = displayed
    .map((item) => ({ item, st: stats.get(item.itemId)! }))
    .filter(({ st }) => st.soldCount >= SELL_BADGE_MIN_SOLD && st.soldRate >= SELL_BADGE_MIN_RATE)
    .sort((a, b) => a.st.medianSoldTimeS - b.st.medianSoldTimeS || b.st.soldRate - a.st.soldRate);
  eligible.slice(0, SELL_BADGE_MAX).forEach(({ item }, i) => {
    item.sellOrder = i + 1;
  });
}

type ClusterBuild = Pick<BuildVariant, "phases" | "timeline" | "optionals">;

// ── Build-variant clustering ─────────────────────────────────────────────────
// Cluster a player's games into distinct build variants by their item fingerprint, then run the
// per-build pipeline on each cluster. The split is keyed on COMMITMENT items, not opener noise:
// cheap, interchangeable early items (which T1 weapon a player happens to open with) vary game to
// game and would otherwise dominate the split. So the fingerprint keeps only items costing
// >= FP_MIN_COST bought within the first FP_SOULS_CUTOFF souls, and the distance/separation weight
// each item by its soul COST — expensive archetype-defining items (a t4 magnum, Cultist Sacrifice)
// drive the split while a cheap opener barely moves it. Keyed on souls (farm-independent), not game
// time. Deterministic, dep-free.
const FP_SOULS_CUTOFF = 25000; // fingerprint = committed items bought within the first 25k souls spent
const FP_MIN_COST = 1250; // ignore cheap, interchangeable items (T1 openers) — they're build noise
const COST_WEIGHT_SCALE = 1500; // per-item distance/separation weight = item cost / 1500 (t4 ≈ 4×, t2 ≈ 1×)
const MIN_ITEM_WEIGHT = 0.1; // floor so an unknown/zero-cost item still contributes a little
const DISC_LO = 0.15; // an item carries split signal only if present in [15%, 85%] of games
const DISC_HI = 0.85;
// A variant must be >= 10% of the player's games, with a floor of 2 games: a single game is never its
// own "build" — at low N it's an item-swap fragment that `absorb` folds into its nearest archetype.
const MIN_VARIANT_FRAC = 0.1;
const minVariantSize = (n: number) => Math.max(2, Math.ceil(MIN_VARIANT_FRAC * n));
const MIN_DISC_ITEMS = 4; // < 4 discriminative items ⇒ essentially one build; never split
export const MIN_PAIR_SEP = 3; // clusters are distinct only if they differ on >= 3 (cost-weighted) items
const MAX_K = 5; // cap variants at 5
const MIN_GAMES_TO_SPLIT = 4; // below this, never split (too little data)
const SEP_RATE_GAP = 0.5; // an item "differs" between clusters when its presence-rate gap >= 0.5

/** A game's fingerprint: itemId → souls-spent at first buy, for committed items within the cutoffs.
 *  Sold items are transient and excluded; implied components (chunked into a directly-bought upgrade)
 *  count — they're committed too. Cheap items (< FP_MIN_COST) are dropped as interchangeable noise. */
function fingerprint(build: Build, costById?: Map<number, number>): Map<number, number> {
  const keep = (id: number) => !costById || (costById.get(id) ?? 0) >= FP_MIN_COST;
  const fp = new Map<number, number>();
  for (const p of build.purchases) {
    if (p.sold || p.souls >= FP_SOULS_CUTOFF) continue;
    if (!keep(p.itemId)) continue;
    if (!fp.has(p.itemId)) fp.set(p.itemId, p.souls);
  }
  for (const [itemId, { souls }] of build.implied) {
    if (souls < FP_SOULS_CUTOFF && keep(itemId) && !fp.has(itemId)) fp.set(itemId, souls);
  }
  return fp;
}

/** Items that distinguish variants: the items the player varies on (per-player presence band). */
function discriminativeItems(fps: Map<number, number>[]): Set<number> {
  const n = fps.length;
  const counts = new Map<number, number>();
  for (const fp of fps) for (const i of fp.keys()) counts.set(i, (counts.get(i) ?? 0) + 1);
  const disc = new Set<number>();
  for (const [i, c] of counts) {
    const f = c / n;
    if (f >= DISC_LO && f <= DISC_HI) disc.add(i);
  }
  return disc;
}

/**
 * Distance/separation weight per discriminative item: proportional to the item's soul COST, so
 * expensive commitment items (a t4 magnum, Cultist Sacrifice) define the archetype while a cheap
 * item barely moves the split. Without cost data, falls back to uniform weight 1.
 */
function itemWeights(disc: Set<number>, costById?: Map<number, number>): Map<number, number> {
  const weights = new Map<number, number>();
  for (const it of disc) {
    weights.set(it, costById ? Math.max(MIN_ITEM_WEIGHT, (costById.get(it) ?? 0) / COST_WEIGHT_SCALE) : 1);
  }
  return weights;
}

/** Weighted Jaccard distance over discriminative items (early-souls items weigh more). */
function jaccardDist(
  a: Map<number, number>,
  b: Map<number, number>,
  disc: Set<number>,
  weights: Map<number, number>,
): number {
  let shared = 0;
  let union = 0;
  const counted = new Set<number>();
  for (const i of a.keys()) {
    if (!disc.has(i)) continue;
    counted.add(i);
    const w = weights.get(i) ?? 1;
    union += w;
    if (b.has(i)) shared += w;
  }
  for (const i of b.keys()) {
    if (!disc.has(i) || counted.has(i)) continue;
    union += weights.get(i) ?? 1;
  }
  return union === 0 ? 0 : 1 - shared / union;
}

function avgLink(c1: number[], c2: number[], dist: number[][]): number {
  let tot = 0;
  for (const a of c1) for (const b of c2) tot += dist[a][b];
  return tot / (c1.length * c2.length);
}

function minIndex(c: number[]): number {
  let m = c[0];
  for (const x of c) if (x < m) m = x;
  return m;
}

/** Deterministic average-linkage agglomeration; snapshot the partition at every cluster count. */
function agglomerate(n: number, dist: number[][]): Map<number, number[][]> {
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const snapshots = new Map<number, number[][]>([[n, clusters.map((c) => c.slice())]]);
  while (clusters.length > 1) {
    let bi = -1;
    let bj = -1;
    let bestD = Infinity;
    let bestMin = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = avgLink(clusters[i], clusters[j], dist);
        const mn = Math.min(minIndex(clusters[i]), minIndex(clusters[j]));
        if (d < bestD || (d === bestD && mn < bestMin)) {
          bestD = d;
          bestMin = mn;
          bi = i;
          bj = j;
        }
      }
    }
    const merged = [...clusters[bi], ...clusters[bj]];
    clusters = clusters.filter((_, k) => k !== bi && k !== bj).concat([merged]);
    snapshots.set(
      clusters.length,
      clusters.map((c) => c.slice()),
    );
  }
  return snapshots;
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

/** Fold every undersized cluster into its nearest neighbour (smallest-first, deterministic). */
function absorb(clusters: number[][], dist: number[][], n: number): number[][] {
  let changed = true;
  while (changed && clusters.length > 1) {
    changed = false;
    clusters.sort((a, b) => a.length - b.length || minIndex(a) - minIndex(b));
    for (let idx = 0; idx < clusters.length; idx++) {
      const c = clusters[idx];
      if (c.length >= minVariantSize(n)) continue;
      let bk = -1;
      let bestD = Infinity;
      let bestMin = Infinity;
      for (let k = 0; k < clusters.length; k++) {
        if (k === idx) continue;
        const d = avgLink(c, clusters[k], dist);
        const mn = minIndex(clusters[k]);
        if (d < bestD || (d === bestD && mn < bestMin)) {
          bestD = d;
          bestMin = mn;
          bk = k;
        }
      }
      clusters[bk] = clusters[bk].concat(c);
      clusters.splice(idx, 1);
      changed = true;
      break;
    }
  }
  return clusters;
}

/**
 * Weighted separation between two clusters: sum over discriminative items whose presence-rate
 * differs by >= SEP_RATE_GAP, each weighted by item COST. Expensive commitment items drive the
 * split; a cheap item barely counts. Compared against MIN_PAIR_SEP.
 */
export function pairSeparation(
  c1: number[],
  c2: number[],
  fps: Map<number, number>[],
  weights: Map<number, number>,
): number {
  let sep = 0;
  for (const [it, w] of weights) {
    if (w === 0) continue;
    const r1 = c1.filter((gi) => fps[gi].has(it)).length / c1.length;
    const r2 = c2.filter((gi) => fps[gi].has(it)).length / c2.length;
    if (Math.abs(r1 - r2) >= SEP_RATE_GAP) sep += w;
  }
  return sep;
}

/** Merge any cluster pair whose cost-weighted item separation is < MIN_PAIR_SEP (closest first). */
function mergeWeakPairs(
  clusters: number[][],
  fps: Map<number, number>[],
  weights: Map<number, number>,
  dist: number[][],
): number[][] {
  let changed = true;
  while (changed && clusters.length > 1) {
    changed = false;
    let best: { d: number; i: number; j: number } | null = null;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (pairSeparation(clusters[i], clusters[j], fps, weights) >= MIN_PAIR_SEP) continue;
        const d = avgLink(clusters[i], clusters[j], dist);
        // tie-break lexicographically by (d, i, j) to match the reference
        if (best === null || d < best.d || (d === best.d && (i < best.i || (i === best.i && j < best.j)))) {
          best = { d, i, j };
        }
      }
    }
    if (best) {
      clusters[best.i] = clusters[best.i].concat(clusters[best.j]);
      clusters.splice(best.j, 1);
      changed = true;
    }
  }
  return clusters;
}

/** Per-k candidate partition (index groups) with its silhouette score. */
export interface ClusterCandidate {
  k: number;
  clusters: number[][];
  silhouette: number;
}

/** Full clustering work-product, exposed for benchmarking/debugging (see scripts/playground). */
export interface ClusterAnalysis {
  n: number;
  /** false when the player is short-circuited to a single build (too few games / discriminative items). */
  split: boolean;
  fps: Map<number, number>[];
  disc: Set<number>;
  /** per-discriminative-item cost weight, applied by BOTH the distance metric and the merge gate. */
  weights: Map<number, number>;
  dist: number[][];
  /** candidate partitions for k = 2..min(MAX_K, n), in k order. */
  candidates: ClusterCandidate[];
}

/**
 * Compute the clustering analysis (fingerprints → discriminative items → agglomeration → per-k
 * candidate partitions). This is the shared core of `clusterBuilds`; the final pick is just the
 * highest-silhouette candidate. Exported so the bench can introspect the exact same work.
 */
export function clusterCandidates(builds: Build[], costById?: Map<number, number>): ClusterAnalysis {
  const n = builds.length;
  const fps = builds.map((b) => fingerprint(b, costById));
  const disc = discriminativeItems(fps);
  const weights = itemWeights(disc, costById);

  const empty: ClusterAnalysis = { n, split: false, fps, disc, weights, dist: [], candidates: [] };
  if (n < MIN_GAMES_TO_SPLIT || disc.size < MIN_DISC_ITEMS) return empty;

  const dist = distMatrix(fps, disc, weights);
  const snapshots = agglomerate(n, dist);

  const candidates: ClusterCandidate[] = [];
  for (let k = 2; k <= Math.min(MAX_K, n); k++) {
    let cl = (snapshots.get(k) ?? []).map((c) => c.slice());
    cl = absorb(cl, dist, n);
    cl = mergeWeakPairs(cl, fps, weights, dist);
    cl = absorb(cl, dist, n);
    if (cl.length < 2) continue;
    candidates.push({ k, clusters: cl, silhouette: silhouette(cl, dist) });
  }

  return { n, split: true, fps, disc, weights, dist, candidates };
}

function clusterBuilds(builds: Build[], costById?: Map<number, number>): Build[][] {
  const { split, candidates } = clusterCandidates(builds, costById);
  if (!split || candidates.length === 0) return [builds];

  // Highest silhouette wins; ties resolve to the lowest k (candidates are in k order).
  let best = candidates[0];
  for (const c of candidates) if (c.silhouette > best.silhouette) best = c;

  const clusters = best.clusters.map((c) => c.slice()).sort((a, b) => b.length - a.length || minIndex(a) - minIndex(b));
  return clusters.map((idxs) => idxs.map((i) => builds[i]));
}

function distMatrix(fps: Map<number, number>[], disc: Set<number>, weights: Map<number, number>): number[][] {
  const n = fps.length;
  const d = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = jaccardDist(fps[i], fps[j], disc, weights);
      d[i][j] = v;
      d[j][i] = v;
    }
  }
  return d;
}

/** Run the full single-build pipeline over one cluster of games. */
function computeClusterBuild(builds: Build[]): ClusterBuild {
  const n = builds.length;
  const stats = computeItemStats(builds);

  const core: ItemStat[] = [];
  const flexCandidates: ItemStat[] = [];
  const optional: ItemStat[] = [];
  for (const st of stats.values()) {
    if (st.frequency >= CORE_FREQ) core.push(st);
    else if (st.frequency >= FLEX_MIN_FREQ) flexCandidates.push(st);
    else optional.push(st);
  }

  const [flexGroups, leftover] = detectFlexGroups(flexCandidates, n);
  const common = leftover.filter((st) => st.frequency >= COMMON_FREQ);
  const optionalAll = optional.concat(leftover.filter((st) => st.frequency < COMMON_FREQ));

  // Build sequenced units (core/common single items + flex slots), each carrying the data
  // needed both for Copeland sequencing and final rendering.
  interface Unit extends SeqUnit {
    entry: TimelineEntry;
  }
  const units: Unit[] = [];
  for (const st of core) {
    units.push({
      key: String(st.itemId),
      itemIds: [st.itemId],
      medianSouls: st.medianSouls,
      entry: { kind: "core", medianTimeS: st.medianTimeS, phase: phaseOf(st.medianTimeS), item: toItem(st) },
    });
  }
  for (const st of common) {
    units.push({
      key: String(st.itemId),
      itemIds: [st.itemId],
      medianSouls: st.medianSouls,
      entry: { kind: "common", medianTimeS: st.medianTimeS, phase: phaseOf(st.medianTimeS), item: toItem(st) },
    });
  }
  for (const group of flexGroups) {
    const slotTimeS = median(group.map((m) => m.medianTimeS)); // display coordinate
    const slotSouls = median(group.map((m) => m.medianSouls)); // ordering coordinate
    const unionGames = new Set<number>();
    for (const m of group) for (const g of m.games) unionGames.add(g);
    const memberIds = group.map((m) => m.itemId);
    units.push({
      key: [...memberIds].sort((a, b) => a - b).join(","),
      itemIds: memberIds,
      medianSouls: slotSouls,
      entry: {
        kind: "flex",
        medianTimeS: slotTimeS,
        phase: phaseOf(slotTimeS),
        slotFrequency: n ? unionGames.size / n : 0,
        candidates: group.map(toItem),
      },
    });
  }

  const alwaysImplied = new Set<number>();
  for (const st of stats.values()) if (!st.hasExplicit) alwaysImplied.add(st.itemId);
  const ordered = orderByPrecedence(units, builds, alwaysImplied);
  const timeline = ordered.map((u) => u.entry);

  const phases: BuildVariant["phases"] = { early: [], mid: [], late: [] };
  for (const entry of timeline) phases[entry.phase].push(entry);

  const optionals = optionalAll
    .filter((st) => st.frequency >= OPTIONAL_DISPLAY_MIN_FREQ)
    .map(toItem)
    .sort((a, b) => b.frequency - a.frequency || a.medianTimeS - b.medianTimeS);

  // Sell-order badges across everything that's actually rendered.
  const displayed: AverageBuildItem[] = [];
  for (const entry of timeline) {
    if (entry.kind === "flex") displayed.push(...entry.candidates);
    else displayed.push(entry.item);
  }
  displayed.push(...optionals);
  assignSellOrder(displayed, stats);

  return { phases, timeline, optionals };
}

/**
 * Derive per-game shop `Build`s from player cards. Sold items are KEPT (sold-vs-upgraded already
 * resolved upstream in buildPlayerBuildCards: upgraded items carry sold === false). Time-ordered.
 * Empty builds are dropped. Exported so the bench can reconstruct the exact clustering input.
 */
export function cardsToBuilds(cards: PlayerBuildCard[], componentImplications?: Map<number, number[]>): Build[] {
  const builds: Build[] = [];
  for (const card of cards) {
    const purchases: Purchase[] = card.buildData.items
      .map((i) => ({
        itemId: i.itemId,
        gameTimeS: i.gameTimeS,
        souls: i.soulsSpent ?? 0,
        sold: i.sold,
        soldTimeS: i.soldTimeS,
      }))
      .sort((a, b) => a.gameTimeS - b.gameTimeS);
    if (purchases.length === 0) continue;

    // Imply each purchased item's components (owned even when the upgrade was bought directly).
    // Record the earliest implying-purchase coordinate; skip components bought explicitly.
    const explicitIds = new Set(purchases.map((p) => p.itemId));
    const implied = new Map<number, { time: number; souls: number }>();
    if (componentImplications) {
      for (const p of purchases) {
        for (const cid of componentImplications.get(p.itemId) ?? []) {
          if (explicitIds.has(cid)) continue;
          const prev = implied.get(cid);
          if (prev == null || p.gameTimeS < prev.time) implied.set(cid, { time: p.gameTimeS, souls: p.souls });
        }
      }
    }
    builds.push({ matchId: card.matchId, win: card.result === "win", purchases, implied });
  }
  return builds;
}

export function computeAverageBuild(
  cards: PlayerBuildCard[],
  /** itemId → transitive component item ids (from buildComponentImplications); enables implied presence. */
  componentImplications?: Map<number, number[]>,
  /** itemId → soul cost (from buildUpgradeChainLookup); drives cost-aware variant clustering. */
  costById?: Map<number, number>,
): AverageBuild | null {
  const builds = cardsToBuilds(cards, componentImplications);

  const nBuilds = builds.length;
  if (nBuilds === 0) return null;

  const clusters = clusterBuilds(builds, costById)
    .filter((cluster) => cluster.length > 0)
    .sort((a, b) => b.length - a.length);

  const variants: BuildVariant[] = clusters.map((cluster, idx) => {
    const { phases, timeline, optionals } = computeClusterBuild(cluster);
    return {
      id: String.fromCharCode(65 + idx), // A, B, C, …
      nGames: cluster.length,
      wins: cluster.filter((b) => b.win).length,
      frequency: cluster.length / nBuilds,
      phases,
      timeline,
      optionals,
    };
  });

  return { nBuilds, wins: builds.filter((b) => b.win).length, variants };
}
