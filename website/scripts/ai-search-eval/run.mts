// Scores the AI search against questions.json: 1,000 questions players could ask, each with the page and filters a
// careful human would pick, and 50 that no page answers ("test", other games). It runs the site's own routing code
// (src/lib/ai-search) against Mercury Decide, so a change to the page registry's descriptions can be measured before
// it ships.
//
//   pnpm eval:search                    all questions
//   pnpm eval:search --only sloppy      one category
//   pnpm eval:search --limit 100        the first 100
//
// Needs INCEPTION_API_KEY in website/.env. A full run is about 1,000 model calls of ~5,000 input tokens each (about
// $0.20) and takes ~5 minutes.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { buildSearchCatalog } from "../../src/lib/ai-search/catalog";
import {
  decideRequestBody,
  intentFromDecision,
  questionEntities,
  requestDecision,
} from "../../src/lib/ai-search/decide";
import { directIntent, type SearchIntent } from "../../src/lib/ai-search/intent";
import { pageSlots, registeredPage } from "../../src/lib/page-registry";

interface Expected {
  q: string;
  category: string;
  /** The page, or null for a question no page answers. */
  page: string | null;
  accept: string[];
  heroes: string[];
  enemies: string[];
  items: string[];
  rank_min: string | null;
  rank_max: string | null;
  mode: string | null;
  time: string | null;
  region: string | null;
}

const ASSETS = "https://api.deadlock-api.com/v1/assets";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const MAX_ATTEMPTS = 6;

const { values: args } = parseArgs({
  options: {
    only: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "16" },
  },
});

process.loadEnvFile(path.join(HERE, "../../.env"));
const key = process.env.INCEPTION_API_KEY;
if (!key) throw new Error("INCEPTION_API_KEY is not set (website/.env)");

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": "deadlock-api-website-eval" } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

/** The names the site matches questions against, from the live assets, filtered as the site filters them. */
const [heroes, items, ranks] = await Promise.all([
  getJson<Parameters<typeof buildSearchCatalog>[0]>(`${ASSETS}/heroes?only_active=true`),
  getJson<Parameters<typeof buildSearchCatalog>[1]>(`${ASSETS}/items/by-type/upgrade`),
  getJson<Parameters<typeof buildSearchCatalog>[2]>(`${ASSETS}/ranks`),
]);
const { vocabulary } = buildSearchCatalog(heroes, items, ranks);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mercury's decision, retried through its rate limit and outages. The wait honours `Retry-After` and is jittered, so
 * the concurrent askers do not all come back at once.
 */
async function decide(body: Parameters<typeof requestDecision>[1]) {
  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await requestDecision(key!, body, 60_000);
      if (response.ok) return (await response.json()) as { answers: Parameters<typeof intentFromDecision>[0] };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
    }
    const retryable = !response || response.status === 429 || response.status >= 500;
    if (response && (!retryable || attempt === MAX_ATTEMPTS)) {
      throw new Error(`Mercury answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const retryAfter = Number(response?.headers.get("retry-after")) * 1000;
    await sleep((retryAfter || 1000 * 2 ** attempt) * (0.5 + Math.random()));
  }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Which of the asked-for parts the search got right. Sides count only where the page reads two teams. */
function grade(expected: Expected, got: SearchIntent) {
  const page = expected.page === null ? undefined : registeredPage(expected.page);
  const twoTeams = page !== undefined && pageSlots(page).has("enemyHeroes");
  const fields = {
    heroes: twoTeams
      ? same(expected.heroes, got.heroes) && same(expected.enemies, got.enemy_heroes)
      : same([...expected.heroes, ...expected.enemies], [...got.heroes, ...got.enemy_heroes]),
    items: same(expected.items, got.items),
    rank: expected.rank_min === got.rank_min && expected.rank_max === got.rank_max,
    mode: expected.mode === got.mode,
    time: expected.time === got.time,
    region: expected.region === got.region,
  };
  return {
    page: expected.page === null ? got.page === null : [expected.page, ...expected.accept].includes(got.page ?? ""),
    fields,
    allFields: Object.values(fields).every(Boolean),
  };
}

type Result = Expected & { ms: number } & (
    | { ok: true; got: SearchIntent; grade: ReturnType<typeof grade> }
    | { ok: false; error: string }
  );

const questions = (JSON.parse(fs.readFileSync(path.join(HERE, "questions.json"), "utf8")) as Expected[])
  .filter((q) => !args.only || q.category === args.only)
  .slice(0, args.limit ? Number(args.limit) : undefined);

const results: Result[] = [];
let next = 0;
const startedAt = Date.now();
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    while (next < questions.length) {
      const expected = questions[next++];
      const t = Date.now();
      try {
        let got = directIntent(expected.q, vocabulary);
        if (!got) {
          const entities = questionEntities(expected.q, vocabulary);
          const { answers } = await decide(decideRequestBody(expected.q, entities, vocabulary.rankNames));
          got = intentFromDecision(answers, expected.q, entities, vocabulary.rankNames);
        }
        results.push({ ...expected, ms: Date.now() - t, ok: true, got, grade: grade(expected, got) });
      } catch (error) {
        results.push({ ...expected, ms: Date.now() - t, ok: false, error: String(error) });
      }
    }
  }),
);

const pct = (rows: Result[], test: (r: Extract<Result, { ok: true }>) => boolean) =>
  rows.length === 0 ? "-" : `${Math.round((100 * rows.filter((r) => r.ok && test(r)).length) / rows.length)}%`;
const real = results.filter((r) => r.page !== null);
const offTopic = results.filter((r) => r.page === null);
const ms = real.map((r) => r.ms).sort((a, b) => a - b);

console.log(
  `${results.length} questions in ${Math.round((Date.now() - startedAt) / 1000)}s, ${results.filter((r) => !r.ok).length} errors`,
);
console.log(`  right page            ${pct(real, (r) => r.grade.page)}`);
console.log(`  every filter right    ${pct(real, (r) => r.grade.allFields)}`);
console.log(`  both                  ${pct(real, (r) => r.grade.page && r.grade.allFields)}`);
console.log(`  real ones it refused  ${pct(real, (r) => r.got.page === null)}`);
console.log(`  off-topic it refused  ${pct(offTopic, (r) => r.got.page === null)}`);
console.log(`  median time           ${ms[Math.floor(ms.length / 2)] ?? 0} ms`);
for (const field of ["heroes", "items", "rank", "mode", "time", "region"] as const) {
  console.log(`  ${field.padEnd(22)}${pct(real, (r) => r.grade.fields[field])}`);
}
console.log("\nby category (page / filters):");
for (const category of new Set(results.map((r) => r.category))) {
  const rows = results.filter((r) => r.category === category);
  console.log(
    `  ${category.padEnd(14)} ${pct(rows, (r) => r.grade.page).padStart(4)} / ${pct(rows, (r) => r.grade.allFields)}`,
  );
}

const misses = results.filter((r) => !r.ok || !r.grade.page || !r.grade.allFields);
const report = path.join(HERE, "../../node_modules/.tmp/ai-search-eval.json");
fs.mkdirSync(path.dirname(report), { recursive: true });
fs.writeFileSync(report, JSON.stringify(misses, null, 1));
console.log(`\n${misses.length} misses written to ${path.relative(process.cwd(), report)}`);
