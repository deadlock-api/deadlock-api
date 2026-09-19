#!/usr/bin/env node
/**
 * Renders the static Open Graph cards in public/og/v2/ (1200x630).
 *
 * Google Search, WhatsApp and iMessage center-crop the card to a square, so
 * everything that matters has to sit inside the central 630x630 area: three
 * hero portraits on top, the text underneath, shrunk until it fits. The heroes
 * further out only show up on wide previews (Discord, Slack, X).
 *
 * Hero art is fetched from the assets API, so this needs network access.
 *
 * Usage: pnpm og            # all cards
 *        pnpm og blog-foo   # only cards whose name contains "blog-foo"
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "og", "v2");
const BLOG_DIR = join(ROOT, "content", "blog");
const HEROES_URL = "https://assets.deadlock-api.com/v2/heroes?only_active=true";
const HEROES_PER_CARD = 7;

const PAGE_CARDS = [
  ["default", "Deadlock API", "Game stats, hero analytics, item data & leaderboards"],
  ["heroes", "Hero Stats & Analytics", "Win rates, pick rates, matchups & performance data"],
  ["items", "Item Stats & Build Analytics", "Win rates, purchase timing, confidence intervals & combos"],
  ["abilities", "Ability Stats & Upgrade Paths", "Optimal skill orders & ability win rates by rank"],
  ["leaderboard", "Ranked Leaderboard", "Top players by region, hero filters & player search"],
  ["badge-distribution", "Rank Distribution", "Average Match rank distribution data over time"],
  ["games", "Live Games", "Active matches and recent game results"],
  ["heatmap", "Kill & Death Heatmap", "Visualize where fights happen on the map"],
  ["player-scoreboard", "Player Scoreboard", "Top player performances ranked by various stats"],
  ["streamkit", "Stream Toolkit", "Chatbot commands & OBS overlay widgets for streamers"],
  ["ingest-cache", "Community Match Ingest", "Scan your Steam cache to contribute match data"],
  ["blog", "Blog", "Engineering posts, data analyses & project updates"],
];

async function blogCards() {
  const files = (await readdir(BLOG_DIR)).filter((f) => f.endsWith(".md"));
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(BLOG_DIR, file), "utf8");
      const title = raw.match(/^title:\s*(.+)$/m)?.[1].replace(/^(["'])(.*)\1$/, "$2");
      if (!title) throw new Error(`${file}: no title in frontmatter`);
      return [`blog-${file.replace(/\.md$/, "")}`, title, "Deadlock API Blog"];
    }),
  );
}

async function heroCardUrls() {
  const res = await fetch(HEROES_URL);
  if (!res.ok) throw new Error(`${HEROES_URL}: ${res.status}`);
  return (await res.json())
    .toSorted((a, b) => a.id - b.id)
    .map((hero) => hero.images?.icon_hero_card_webp)
    .filter(Boolean);
}

/** Shuffles by card name rather than position, so adding a card doesn't change the heroes on all the others. */
function heroesFor(name, urls) {
  let state = [...name].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 0);
  // mulberry32
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const pool = [...urls];
  return Array.from({ length: HEROES_PER_CARD }, () => pool.splice(Math.floor(random() * pool.length), 1)[0]);
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardHtml({ title, subtitle, heroes, font, logo }) {
  const center = (HEROES_PER_CARD - 1) / 2;
  return `<!doctype html>
<style>
  @font-face { font-family: Inter; font-weight: 100 900; src: url(${font}) format("woff2"); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; position: relative; overflow: hidden; background: #0a0a0c; color: #fff; font-family: Inter, sans-serif; }
  body > * { position: absolute; }
  .glow { inset: 0; background: radial-gradient(ellipse 560px 380px at 50% 30%, rgba(250, 68, 84, 0.38), transparent 70%); }
  .heroes { top: -6px; left: 50%; width: 1600px; transform: translateX(-50%); display: flex; align-items: flex-start; justify-content: center; }
  .heroes img {
    height: calc(470px - var(--d) * 60px); margin: calc(var(--d) * 34px) -62px 0; z-index: calc(10 - var(--d));
    filter: brightness(calc(1 - var(--d) * 0.2)) drop-shadow(0 0 30px rgba(0, 0, 0, 0.85));
    /* the portraits are rectangular crops; without this their cut-off sides show as hard vertical edges */
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent);
  }
  .fade { inset: 0; z-index: 20; background: linear-gradient(transparent 44%, rgba(10, 10, 12, 0.92) 62%, #0a0a0c 72%); }
  main {
    left: 285px; top: 0; width: 630px; height: 630px; padding: 330px 40px 28px; z-index: 30;
    display: flex; flex-direction: column; justify-content: flex-end; align-items: center; text-align: center;
  }
  section { display: flex; flex-direction: column; align-items: center; max-width: 100%; }
  h1 { font-size: 60px; font-weight: 800; line-height: 1.04; letter-spacing: -0.03em; text-wrap: balance; max-width: 100%; }
  p { color: #b4b4bd; font-size: 25px; line-height: 1.3; margin-top: 14px; text-wrap: balance; }
  footer { display: flex; align-items: center; gap: 10px; margin-top: 20px; color: #fa4454; font-size: 21px; font-weight: 600; }
  footer svg { width: 38px; height: auto; }
</style>
<div class="glow"></div>
<div class="heroes">${heroes.map((url, i) => `<img src="${url}" style="--d:${Math.abs(i - center)}" alt="" />`).join("")}</div>
<div class="fade"></div>
<main>
  <section>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <footer>${logo}<span>deadlock-api.com</span></footer>
  </section>
</main>`;
}

const filter = process.argv[2];
const cards = [...PAGE_CARDS, ...(await blogCards())].filter(([name]) => !filter || name.includes(filter));
if (cards.length === 0) throw new Error(`no card matches "${filter}"`);

const fontFile = join(ROOT, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
const font = `data:font/woff2;base64,${(await readFile(fontFile)).toString("base64")}`;
const logo = (await readFile(join(ROOT, "public", "logo", "hexe.svg"), "utf8"))
  .replace(/<\?xml[^>]*\?>/, "")
  .replace(/fill="#[0-9A-Fa-f]+"/g, 'fill="currentColor"')
  .replace(/width="(\d+)" height="(\d+)"/, 'viewBox="0 0 $1 $2"');
const heroUrls = await heroCardUrls();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
/* oxlint-disable no-await-in-loop -- cards share one page, so they render one after another */
for (const [name, title, subtitle] of cards) {
  await page.setContent(cardHtml({ title, subtitle, heroes: heroesFor(name, heroUrls), font, logo }));
  await page.evaluate(async () => {
    await document.fonts.ready;
    const main = document.querySelector("main");
    const section = document.querySelector("section");
    const h1 = document.querySelector("h1");
    const style = getComputedStyle(main);
    const room = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fits = () => section.offsetHeight <= room && h1.scrollWidth <= h1.clientWidth;
    for (let size = 60; size > 28 && !fits(); size -= 2) h1.style.fontSize = `${size}px`;
  });
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`public/og/v2/${name}.png`);
}
/* oxlint-enable no-await-in-loop */
await browser.close();
