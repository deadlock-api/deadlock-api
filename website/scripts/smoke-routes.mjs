#!/usr/bin/env node
// Opens every page route of a running site in a real browser and reports what only shows up at runtime: uncaught
// errors, React errors (hydration mismatches, duplicate keys), failed requests to the site itself, a missing or
// repeated <h1>, and horizontal overflow. Point it at `pnpm dev` (the default) or at `pnpm wrangler:dev`.
//
//   pnpm smoke                                  every route at 1440px in the machine's timezone
//   pnpm smoke --tz America/Los_Angeles         catches server/client timezone mismatches (the Worker runs in UTC)
//   pnpm smoke --width 360 --only analytics     phone width, only paths containing "analytics"
//   pnpm smoke --base http://127.0.0.1:8787     against the built Worker
//
// Uses the Playwright Chromium (`pnpm exec playwright install chromium`), or the installed Chrome as a fallback.
// Exits 1 when any page has a finding.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    tz: { type: "string" },
    width: { type: "string", default: "1440" },
    only: { type: "string", multiple: true },
    concurrency: { type: "string", default: "4" },
    "settle-ms": { type: "string", default: "1500" },
  },
});

// Dynamic segments get one real example each; routes that need an account or a login are left out.
const SAMPLE_PARAMS = {
  $heroName: "haze",
  $itemName: "extra-health",
  $slug: fs
    .readdirSync(path.join(ROOT, "content/blog"))
    .find((file) => file.endsWith(".md"))
    ?.replace(/\.md$/, ""),
};
const SKIP = [/^\/auth\//, /^\/streamkit\/widgets\//, /\$accountId/, /\.xml$/];

// Recharts and third-party scripts log noise that says nothing about our pages.
const IGNORED_CONSOLE = [/Download the React DevTools/, /react-compiler/i, /posthog/i, /\[vite\]/];

function routePaths() {
  const tree = fs.readFileSync(path.join(ROOT, "src/routeTree.gen.ts"), "utf8");
  const block = tree.slice(tree.indexOf("export interface FileRoutesByFullPath"));
  const paths = [...block.slice(0, block.indexOf("}")).matchAll(/^\s*'([^']+)':/gm)].map(([, p]) => p);
  return paths
    .filter((p) => !SKIP.some((re) => re.test(p)))
    .map((p) => p.replace(/\$\w+/g, (param) => SAMPLE_PARAMS[param] ?? param))
    .filter((p) => !p.includes("$"))
    .map((p) => (p.length > 1 ? p.replace(/\/$/, "") : p))
    .filter((p) => !args.only || args.only.some((needle) => p.includes(needle)));
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

/** React logs `%s` templates with the values as arguments; fill them in so the report names the duplicate key. */
async function formatConsole(message) {
  const [template, ...values] = await Promise.all(
    message.args().map((arg) => arg.jsonValue().catch(() => String(arg))),
  );
  if (typeof template !== "string") return message.text();
  let rest = values;
  const filled = template.replace(/%[sdoOi]/g, () => {
    const [next, ...others] = rest;
    rest = others;
    return typeof next === "string" ? next : JSON.stringify(next);
  });
  return [filled, ...rest.filter((v) => typeof v === "string" && !v.includes("\n    at "))].join(" ");
}

async function check(context, route) {
  const page = await context.newPage();
  const findings = [];
  const origin = new URL(args.base).origin;
  page.on("pageerror", (error) => findings.push(`uncaught: ${error.message.split("\n")[0]}`));
  const pending = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    // A request that failed is reported once, below, with its URL.
    if (text.startsWith("Failed to load resource")) return;
    pending.push(
      formatConsole(message).then((formatted) =>
        findings.push(`console: ${formatted.replace(/\s+/g, " ").slice(0, 240)}`),
      ),
    );
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 400 && url.pathname !== route) {
      findings.push(`${response.status()}: ${url.pathname}`);
    }
  });

  let status = 0;
  try {
    const response = await page.goto(args.base + route, { waitUntil: "networkidle", timeout: 60_000 });
    status = response?.status() ?? 0;
  } catch (error) {
    findings.push(`navigation: ${error.message.split("\n")[0]}`);
  }
  await page.waitForTimeout(Number(args["settle-ms"]));
  await Promise.all(pending);

  const finalPath = new URL(page.url()).pathname;
  if (status >= 400) findings.push(`status ${status}`);
  const layout = await page
    .evaluate(() => ({
      h1: document.querySelectorAll("h1").length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }))
    .catch(() => null);
  if (layout && layout.h1 !== 1) findings.push(`${layout.h1} <h1> elements`);
  if (layout && layout.overflow > 0) findings.push(`page scrolls sideways by ${layout.overflow}px`);

  await page.close();
  return { route, finalPath, findings: [...new Set(findings)] };
}

const routes = routePaths();
const browser = await launch();
const context = await browser.newContext({
  viewport: { width: Number(args.width), height: 900 },
  timezoneId: args.tz,
  serviceWorkers: "block",
});
// Analytics must not count smoke runs as visitors.
await context.route(/posthog|i\.deadlock-api\.com/, (route) => route.abort());

console.log(`smoke: ${routes.length} routes on ${args.base} at ${args.width}px${args.tz ? ` in ${args.tz}` : ""}`);
const results = [];
const queue = [...routes];
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    for (let route = queue.shift(); route; route = queue.shift()) {
      const result = await check(context, route);
      results.push(result);
      const target = result.finalPath === route ? "" : ` -> ${result.finalPath}`;
      console.log(`${result.findings.length ? "FAIL" : "ok  "} ${route}${target}`);
      for (const finding of result.findings) console.log(`       ${finding}`);
    }
  }),
);
await browser.close();

const failed = results.filter((r) => r.findings.length > 0);
console.log(`\nsmoke: ${results.length - failed.length}/${results.length} routes clean`);
process.exit(failed.length > 0 ? 1 : 0);
