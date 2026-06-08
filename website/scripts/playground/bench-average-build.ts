/**
 * Average-build clustering bench.
 *
 * Runs the REAL site logic (`~/lib/build-transform` + `~/lib/average-build`) against live API
 * data for a single player + hero over a date window, then pretty-prints the resulting build
 * variants. This is the source of truth for debugging the recent-builds "average build" card —
 * the output here matches the website exactly because it imports the same modules the site does.
 *
 * It does NOT import `~/lib/api` (that reads `import.meta.env`, which only exists under Vite).
 * Instead it constructs the generated SDK clients directly against the same endpoints.
 *
 * Run from the website/ dir:
 *   pnpm bench:avg                       # defaults: johnpyp (127331261), hero 7, 50 most-recent games
 *   pnpm bench:avg --account 127331261 --hero 7 --limit 50
 *   pnpm bench:avg --days 14             # optionally also bound by a date window
 *   pnpm bench:avg --json                # dump the raw AverageBuild JSON too
 */

import { create } from "axios";
import { type Ability, HeroesApi, ItemsApi, MatchesApi, type Upgrade } from "deadlock_api_client";

import {
  type Build,
  cardsToBuilds,
  clusterCandidates,
  computeAverageBuild,
  MIN_PAIR_SEP,
  pairSeparation,
  type TimelineEntry,
} from "~/lib/average-build";
import {
  type BulkMatchMetadata,
  buildComponentImplications,
  buildPlayerBuildCards,
  buildUpgradeChainLookup,
  getHeroAbilityMetadata,
} from "~/lib/build-transform";

const API_ORIGIN = process.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ?? "https://api.deadlock-api.com";

// ── CLI args ─────────────────────────────────────────────────────────────────
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const ACCOUNT_ID = Number(arg("account", "127331261")); // johnpyp
const HERO_ID = Number(arg("hero", "7"));
const LIMIT = Number(arg("limit", "50")); // fetch the N most-recent games
const WINDOW_DAYS = Number(arg("days", "0")); // 0 = no date bound (recency only)
const DUMP_JSON = process.argv.includes("--json");
const DEBUG = process.argv.includes("--debug");
const DUMP_GAMES = process.argv.includes("--games");

// ── SDK clients (same generated SDK the site uses) ───────────────────────────
const client = create({ timeout: 30_000, headers: { Accept: "application/json" } });
const matchesApi = new MatchesApi(undefined, API_ORIGIN, client);
const heroesApi = new HeroesApi(undefined, API_ORIGIN, client);
const itemsApi = new ItemsApi(undefined, API_ORIGIN, client);

// ── pretty-print helpers ─────────────────────────────────────────────────────
function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function entryStr(e: TimelineEntry, nameOf: (id: number) => string): string {
  if (e.kind === "core" || e.kind === "common") {
    const it = e.item;
    const tag = e.kind === "common" ? "~" : "";
    return `${tag}${nameOf(it.itemId)}@${fmtTime(it.medianTimeS)}(${Math.round(it.frequency * 100)}%)`;
  }
  const cands = e.candidates.map((c) => `${nameOf(c.itemId)}(${Math.round(c.frequency * 100)}%)`).join(" / ");
  return `[1of ${cands}]@${fmtTime(e.medianTimeS)}`;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface ItemMeta {
  nameOf: (id: number) => string;
  costOf: (id: number) => number;
  tierOf: (id: number) => number;
}

/** Dump each game's fingerprint (early items, by buy-souls) grouped by current cluster, so the real
 *  per-game archetypes are visible. cost/tier annotate each item to inform a cost-aware fingerprint. */
function dumpGames(builds: Build[], meta: ItemMeta, costById: Map<number, number>): void {
  const a = clusterCandidates(builds, costById);
  let best = a.candidates[0];
  for (const c of a.candidates) if (c.silhouette > best.silhouette) best = c;
  const chosen = best.clusters
    .map((c) => c.slice())
    .sort((x, y) => y.length - x.length || Math.min(...x) - Math.min(...y));

  console.log("\n" + "#".repeat(90));
  console.log("# PER-GAME FINGERPRINTS (item@souls·t<tier>·$<cost>, only discriminative items starred)");
  console.log("#".repeat(90));
  chosen.forEach((cl, i) => {
    console.log(`\n  --- cluster ${String.fromCharCode(65 + i)} (${cl.length} games) ---`);
    for (const gi of cl) {
      const fp = a.fps[gi];
      const items = [...fp.entries()]
        .sort((x, y) => x[1] - y[1])
        .map(
          ([id, souls]) =>
            `${a.disc.has(id) ? "*" : ""}${meta.nameOf(id)}@${Math.round(souls / 100) / 10}k·t${meta.tierOf(id)}`,
        );
      console.log(`    [${builds[gi].matchId}] ${items.join("  ")}`);
    }
  });
}

/** Introspect the EXACT clustering the site runs: discriminative items, per-k candidates, and the
 *  per-item presence split across the chosen variants — to see why distinct builds get merged. */
function printClusterDebug(builds: Build[], nameOf: (id: number) => string, costById: Map<number, number>): void {
  const a = clusterCandidates(builds, costById);
  const n = a.n;
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

  console.log("\n" + "#".repeat(90));
  console.log(`# CLUSTER DEBUG   n=${n}  discriminative=${a.disc.size}  split=${a.split}`);
  console.log("#".repeat(90));

  if (!a.split) {
    console.log("  (short-circuited to a single build — too few games or discriminative items)");
    return;
  }

  // Discriminative items: the only items that can drive a split. Presence band is [15%, 85%].
  const disc = [...a.disc].map((it) => {
    const present = a.fps.filter((fp) => fp.has(it)).length;
    const soulsArr = a.fps.map((fp) => fp.get(it)).filter((s): s is number => s != null);
    return {
      it,
      present,
      presence: present / n,
      w: a.weights.get(it) ?? 1,
      cost: costById.get(it) ?? 0,
      medSouls: median(soulsArr),
    };
  });
  disc.sort((x, y) => y.w - x.w || y.presence - x.presence);
  console.log(`\n  Discriminative items (w = cost weight, drives both distance and merge gate):`);
  console.log(`    ${"item".padEnd(22)} present   w     cost   medSouls`);
  for (const d of disc) {
    console.log(
      `    ${nameOf(d.it).slice(0, 22).padEnd(22)} ${pct(d.presence)}   ${d.w.toFixed(2)}  ${d.cost}    ${Math.round(d.medSouls)}`,
    );
  }

  // Candidate partitions per k (after absorb → mergeWeakPairs → absorb), with silhouette.
  let best = a.candidates[0];
  for (const c of a.candidates) if (c.silhouette > best.silhouette) best = c;
  console.log(`\n  Candidate partitions (chosen = highest silhouette, ties → lowest k):`);
  for (const c of a.candidates) {
    const sizes = c.clusters
      .map((cl) => cl.length)
      .sort((x, y) => y - x)
      .join("/");
    console.log(
      `    k=${c.k}: clusters=${c.clusters.length}  sizes=${sizes}  silhouette=${c.silhouette.toFixed(3)}${c === best ? "   <-- CHOSEN" : ""}`,
    );
  }

  // Chosen partition, ordered by size desc (= Variant A, B, …).
  const chosen = best.clusters
    .map((c) => c.slice())
    .sort((x, y) => y.length - x.length || Math.min(...x) - Math.min(...y));
  const label = (i: number) => String.fromCharCode(65 + i);

  // Per-pair separation vs the gate that merges clusters.
  console.log(`\n  Pairwise separation (MIN_PAIR_SEP=${MIN_PAIR_SEP}; below ⇒ merged into one variant):`);
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const sep = pairSeparation(chosen[i], chosen[j], a.fps, a.weights);
      console.log(
        `    ${label(i)} vs ${label(j)}: weighted sep = ${sep.toFixed(2)}  ${sep < MIN_PAIR_SEP ? "(WOULD MERGE)" : "(distinct)"}`,
      );
    }
  }

  // For the LARGEST cluster (the grab-bag), show each game's discriminative early fingerprint so the
  // internal variety is visible.
  chosen.forEach((cl, i) => {
    console.log(`\n  VARIANT ${label(i)} (${cl.length} games) — per-item presence within cluster:`);
    const rows = disc
      .map((d) => ({ name: nameOf(d.it), rate: cl.filter((gi) => a.fps[gi].has(d.it)).length / cl.length, w: d.w }))
      .filter((r) => r.rate > 0)
      .sort((x, y) => y.w - x.w || y.rate - x.rate);
    console.log("    " + rows.map((r) => `${r.name}:${pct(r.rate).trim()}`).join("  "));
  });
}

async function main() {
  const maxTs = Math.floor(Date.now() / 1000);
  const minTs = WINDOW_DAYS > 0 ? maxTs - WINDOW_DAYS * 86_400 : undefined;
  const scope = WINDOW_DAYS > 0 ? `${LIMIT} most-recent within last ${WINDOW_DAYS}d` : `${LIMIT} most-recent`;

  console.log(`Fetching assets + matches for account ${ACCOUNT_ID}, hero ${HERO_ID} (${scope})…`);

  const [upgradesRes, abilitiesRes, heroesRes, matchesRes] = await Promise.all([
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
      minUnixTimestamp: minTs,
      maxUnixTimestamp: maxTs,
      gameMode: "normal", // mirror the site: exclude Street Brawl
      orderBy: "match_id",
      orderDirection: "desc",
      limit: LIMIT,
    }),
  ]);

  const assetsItems = upgradesRes.data as Upgrade[];
  const abilityItems = abilitiesRes.data as Ability[];
  const heroesData = heroesRes.data;
  const matches = matchesRes.data as unknown as BulkMatchMetadata[];

  const nameById = new Map<number, string>(assetsItems.map((i) => [i.id, i.name]));
  const nameOf = (id: number) => nameById.get(id) ?? `#${id}`;

  // Mirror PlayerHeroBuildsDialog: same card-building + average-build calls.
  const heroData = heroesData.find((h) => h.id === HERO_ID);
  const heroAbilityMetadata = getHeroAbilityMetadata(heroData, abilityItems);
  const upgradeChainLookup = buildUpgradeChainLookup(assetsItems);
  const componentImplications = buildComponentImplications(assetsItems);

  const cards = buildPlayerBuildCards(matches, HERO_ID, heroAbilityMetadata, upgradeChainLookup, {
    accountId: ACCOUNT_ID,
  });
  const result = computeAverageBuild(cards, componentImplications, upgradeChainLookup?.costById);

  if (!result) {
    console.log("No builds found.");
    return;
  }

  console.log("=".repeat(90));
  console.log(
    `account ${ACCOUNT_ID}  hero ${HERO_ID}  (${scope})   ` +
      `(${result.nBuilds} games, ${result.wins}W ${result.nBuilds - result.wins}L, ${result.variants.length} variant(s))`,
  );
  console.log("=".repeat(90));

  for (const v of result.variants) {
    console.log(
      `\n  VARIANT ${v.id}  —  ${v.nGames} games (${Math.round(v.frequency * 100)}%)  ` +
        `${v.wins}W ${v.nGames - v.wins}L`,
    );
    for (const ph of ["early", "mid", "late"] as const) {
      const entries = v.phases[ph];
      if (entries.length === 0) continue;
      console.log(`    [${ph}] ` + entries.map((e) => entryStr(e, nameOf)).join("  "));
    }
    if (v.optionals.length > 0) {
      const opt = v.optionals
        .slice(0, 8)
        .map((o) => `${nameOf(o.itemId)}(${Math.round(o.frequency * 100)}%)`)
        .join(", ");
      console.log(`    [opt] ${opt}`);
    }
  }

  console.log(
    `\n  games=${result.nBuilds}  variants=${result.variants.length}  ` +
      `sizes=${result.variants.map((v) => v.nGames).join("/")}`,
  );

  if (DEBUG || DUMP_GAMES) {
    const builds = cardsToBuilds(cards, componentImplications);
    const costById = new Map<number, number>(assetsItems.map((i) => [i.id, i.cost ?? 0]));
    const tierById = new Map<number, number>(assetsItems.map((i) => [i.id, i.item_tier ?? 0]));
    if (DEBUG) printClusterDebug(builds, nameOf, costById);
    if (DUMP_GAMES) {
      dumpGames(
        builds,
        { nameOf, costOf: (id) => costById.get(id) ?? 0, tierOf: (id) => tierById.get(id) ?? 0 },
        costById,
      );
    }
  }

  if (DUMP_JSON) {
    console.log(`\n${JSON.stringify(result, null, 2)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
