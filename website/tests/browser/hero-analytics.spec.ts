import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { AnalyticsHeroStats } from "deadlock_api_client";

const totals = {
  bucket: 91,
  players: 100,
  matches_per_bucket: 300,
  total_max_health: 100000,
  total_kills: 500,
  total_deaths: 400,
  total_assists: 600,
  total_net_worth: 100000,
  total_last_hits: 1000,
  total_denies: 100,
  total_player_damage: 10000,
  total_player_damage_taken: 10000,
  total_boss_damage: 1000,
  total_creep_damage: 1000,
  total_neutral_damage: 1000,
  total_shots_hit: 500,
  total_shots_missed: 100,
};
const stats: AnalyticsHeroStats[] = [
  { ...totals, hero_id: 11, matches: 100, wins: 60, losses: 40 },
  { ...totals, hero_id: 1, matches: 200, wins: 90, losses: 110 },
];
const trendStart = Math.floor(Date.now() / 86_400_000) * 86_400 - 3 * 86_400;
const trendStats = stats.flatMap((row) => [
  Object.assign({}, row, { bucket: trendStart }),
  Object.assign({}, row, { bucket: trendStart + 86_400 }),
]);
const trendUrl = "/analytics/heroes/over-time?date_range=_&min_rank=0";
const overviewUrl = "/analytics/heroes?date_range=_&min_rank=0";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/hero-stats") {
      return route.fulfill({ json: url.searchParams.get("bucket")?.startsWith("start_time_") ? trendStats : stats });
    }
    if (url.pathname === "/v1/analytics/hero-ban-stats") {
      return route.fulfill({
        json: [
          { hero_id: 11, bans: 20 },
          { hero_id: 1, bans: 80 },
        ],
      });
    }
    if (url.pathname === "/v1/analytics/scoreboards/heroes") return route.fulfill({ json: [] });
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? route.continue() : route.abort();
  });
});

test("search preserves roster rates and positions, hides empty groups and recovers from no results", async ({
  page,
}) => {
  await page.goto(overviewUrl);
  const panel = page.getByRole("tabpanel", { name: "Overall Stats" });
  const search = page.getByRole("searchbox", { name: "Filter heroes by name" });
  await expect(panel.getByText("Showing 2 of 2 heroes.")).toBeVisible();
  await expect(panel.getByText("100 matches", { exact: true })).toBeVisible();
  await expect(panel.getByRole("columnheader", { name: "Win Rate" })).toHaveAttribute("aria-sort", "descending");
  const infernus = panel.getByRole("row").filter({ hasText: "Infernus" });
  const originalRow = await infernus.textContent();
  await search.fill("  INFERNUS  ");
  await expect(panel.getByRole("status")).toContainText("Showing 1 of 2 heroes");
  await expect(infernus).toHaveText(originalRow!);
  await page.getByRole("switch", { name: "Group by Type" }).click();
  await expect(panel.getByRole("heading", { name: "Brawler", exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Mystic", exact: true })).toHaveCount(0);
  await search.fill("no-such-hero");
  await expect(panel.getByText("No heroes match your search")).toBeVisible();
  await panel.getByRole("button", { name: "Clear search", exact: true }).last().click();
  await expect(search).toHaveValue("");
  await expect(panel.getByRole("heading", { name: "Mystic", exact: true })).toBeVisible();
});

test("Brawl excludes normal-mode bans and explains why rank breakdown is unavailable", async ({ page }) => {
  const rankRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/hero-stats" && url.searchParams.get("bucket") === "avg_badge") {
      rankRequests.push(request.url());
    }
  });
  await page.goto(overviewUrl);
  await expect(page.getByRole("button", { name: "Presence", exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Brawl", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Brawl", exact: true })).toBeChecked();
  await expect(page.getByRole("button", { name: "Presence", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sort by pick rate", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "By Rank", exact: true }).click();
  await expect(page.getByText("Rank breakdown is unavailable for Brawl")).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);
  expect(rankRequests).toEqual([]);
  await page.getByRole("button", { name: "View Brawl stats", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Overall Stats", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("radio", { name: "Brawl", exact: true })).toBeChecked();
  await page.getByRole("tab", { name: "By Rank", exact: true }).click();
  await page.getByRole("button", { name: "Switch to normal mode", exact: true }).click();
  await expect(page.getByRole("figure")).toBeVisible();
  expect(rankRequests.length).toBeGreaterThan(0);
  expect(rankRequests.every((url) => new URL(url).searchParams.get("game_mode") === "normal")).toBe(true);
});

test("empty API results are distinguished from search misses", async ({ page }) => {
  await page.route("**/v1/analytics/hero-stats?**", (route) => route.fulfill({ json: [] }));
  await page.goto(overviewUrl);
  await expect(page.getByText("No hero stats for these filters")).toBeVisible();
  await expect(page.getByText("No heroes match your search")).toHaveCount(0);
});

test("failed stats can be retried without losing filters", async ({ page }) => {
  let fail = true;
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    fail ? route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }) : route.fulfill({ json: stats }),
  );
  await page.goto(overviewUrl);
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load hero stats" })).toBeVisible({
    timeout: 20_000,
  });
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Showing 2 of 2 heroes.")).toBeVisible();
  await expect(page).toHaveURL(/min_rank=0/);
});

test("scoreboard requests wait until its tab is selected", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/v1/analytics/scoreboards/heroes") requests.push(request.url());
  });
  await page.goto(overviewUrl);
  await expect(page.getByText("Showing 2 of 2 heroes.")).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("tab", { name: "Scoreboard", exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
});

test("overview search and recovery fit a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(overviewUrl);
  const search = page.getByRole("searchbox", { name: "Filter heroes by name" });
  await expect(page.getByText("Showing 2 of 2 heroes.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await search.fill("unknown");
  await expect(page.getByText("No heroes match your search")).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).last().click();
  await expect(search).toHaveValue("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("trend portraits toggle with the keyboard and clear/show all recover the chart", async ({ page }) => {
  await page.goto(trendUrl);
  const selected = page.getByRole("list", { name: "Selected heroes" });
  const picker = page.getByRole("region", { name: "Chart heroes", exact: true });
  await expect(selected).toHaveText("Dynamo");
  await expect(page.locator(".recharts-line-curve")).toHaveCount(1);
  const infernus = picker.getByRole("button", { name: /Infernus/ });
  await infernus.focus();
  await infernus.press("Space");
  await expect(infernus).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toContainText("Dynamo");
  await expect(selected).toContainText("Infernus");
  await expect(page.locator(".recharts-line-curve")).toHaveCount(2);
  await picker.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(page.getByText("Choose heroes to compare", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Selected hero trend comparison" })).toHaveCount(0);
  await picker.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(page.locator(".recharts-line-curve")).toHaveCount(2);
});

test("trend errors and empty results are recoverable without an empty chart", async ({ page }) => {
  test.setTimeout(150_000);
  let fail = true;
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    fail ? route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }) : route.fulfill({ json: [] }),
  );
  await page.goto(trendUrl);
  await expect(page.getByRole("combobox", { name: "Trend metric" })).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByText("Unable to load hero trends", { exact: true })).toBeVisible({ timeout: 60_000 });
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No trend data for these filters", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);
});

test("Brawl ban history never requests or displays normal-mode bans", async ({ page }) => {
  const banRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/analytics/hero-ban-stats" && url.searchParams.has("bucket"))
      banRequests.push(request.url());
  });
  await page.goto(`${trendUrl}&game_mode=street_brawl&match_mode=unranked&hero_stat=ban_rate`);
  await expect(page.getByText("Ban rates are unavailable for Brawl", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);
  expect(banRequests).toEqual([]);
  await page.getByRole("combobox", { name: "Trend metric" }).click();
  await page.getByRole("option", { name: "Win rate", exact: true }).click();
  await expect(page.getByRole("figure")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Brawl", exact: true })).toBeChecked();
});

test("trend controls, comparison and selection fit mobile screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(trendUrl);
  await expect(page.getByRole("figure")).toBeVisible();
  const picker = page.getByRole("region", { name: "Chart heroes", exact: true });
  await picker.getByRole("button", { name: "Show all", exact: true }).click();
  const comparison = page.getByRole("table", { name: "Selected hero trend comparison" });
  await expect(comparison.getByRole("row")).toHaveCount(3);
  await comparison.evaluate((table) => {
    table.parentElement!.scrollLeft = table.scrollWidth;
  });
  await expect(comparison.getByRole("row").filter({ hasText: "Infernus" }).getByRole("cell").first()).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("combobox", { name: "Trend metric" }).click();
  await page.getByRole("option", { name: "Net worth per match", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Net worth per match over time" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("shared URLs restore hero selections, including an empty selection", async ({ page }) => {
  await page.goto(`${trendUrl}&trend_heroes=11,1`);
  const picker = page.getByRole("region", { name: "Chart heroes", exact: true });
  const selected = page.getByRole("list", { name: "Selected heroes" });
  await expect(selected).toContainText("Dynamo");
  await expect(selected).toContainText("Infernus");
  await picker.getByRole("button", { name: /Infernus/ }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("trend_heroes") === "11");
  await expect(selected).toHaveText("Dynamo");
  await page.reload();
  await expect(selected).toHaveText("Dynamo");
  await picker.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("trend_heroes") === "");
  await page.reload();
  await expect(page.getByText("Choose heroes to compare", { exact: true })).toBeVisible();
  await expect(page.getByRole("figure")).toHaveCount(0);
  await picker.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(selected).toContainText("Dynamo");
  await expect(selected).toContainText("Infernus");
});

test("comparison shows percentage-point changes and exports only selected heroes", async ({ page }) => {
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    route.fulfill({
      json: [
        { ...stats[0], bucket: trendStart, wins: 60 },
        { ...stats[0], bucket: trendStart + 86400, wins: 65 },
        { ...stats[1], bucket: trendStart },
      ],
    }),
  );
  await page.goto(trendUrl);
  const table = page.getByRole("table", { name: "Selected hero trend comparison" });
  const dynamo = table.getByRole("row").filter({ hasText: "Dynamo" });
  await expect(dynamo).toContainText("60%");
  await expect(dynamo).toContainText("65%");
  await expect(dynamo).toContainText("+5 pp");
  await expect(dynamo).toContainText("100 matches in latest");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hero-trends-winrate-day.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"Dynamo","winrate","65","100","start_time_day"');
  expect(csv).not.toContain("Infernus");
  expect(csv.split("\r\n")).toHaveLength(3);
  await page
    .getByRole("region", { name: "Chart heroes", exact: true })
    .getByRole("button", { name: /Infernus/ })
    .click();
  await expect(table.getByRole("row").filter({ hasText: "Infernus" })).toContainText("Not enough data");
  await table.getByRole("button", { name: "Change (pp)", exact: true }).click();
  await expect(table.getByRole("row").last()).toContainText("Infernus");
  await table.getByRole("button", { name: "Change (pp)", exact: true }).click();
  await expect(table.getByRole("row").last()).toContainText("Infernus");
});

test("comparison sorts latest values and changes with keyboard-accessible headers", async ({ page }) => {
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    route.fulfill({
      json: [
        { ...stats[0], bucket: trendStart, wins: 60 },
        { ...stats[0], bucket: trendStart + 86400, wins: 55 },
        { ...stats[1], bucket: trendStart, wins: 90 },
        { ...stats[1], bucket: trendStart + 86400, wins: 120 },
      ],
    }),
  );
  await page.goto(`${trendUrl}&trend_heroes=11,1`);
  const table = page.getByRole("table", { name: "Selected hero trend comparison" });
  await expect(table.getByRole("row").nth(1)).toContainText("Dynamo");
  const latest = table.getByRole("button", { name: "Latest recorded", exact: true });
  await latest.click();
  await expect(table.getByRole("columnheader", { name: "Latest recorded", exact: true })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await expect(table.getByRole("row").nth(1)).toContainText("Infernus");
  await latest.press("Space");
  await expect(table.getByRole("columnheader", { name: "Latest recorded", exact: true })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(table.getByRole("row").nth(1)).toContainText("Dynamo");
  await table.getByRole("button", { name: "Change (pp)", exact: true }).click();
  await expect(table.getByRole("row").nth(1)).toContainText("+15 pp");
  await expect(table.getByRole("row").nth(2)).toContainText("-5 pp");
});

test("filtered and absent buckets break trend lines instead of fabricating continuity", async ({ page }) => {
  const start = trendStart - 5 * 86400;
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    route.fulfill({
      json: [
        { ...stats[0], bucket: start, wins: 60 },
        { ...stats[0], bucket: start + 86400, matches: 1, wins: 1 },
        { ...stats[0], bucket: start + 2 * 86400, wins: 65 },
        { ...stats[0], bucket: start + 4 * 86400, wins: 70 },
      ],
    }),
  );
  await page.goto(trendUrl);
  const curve = page.locator(".recharts-line-curve");
  await expect(curve).toHaveCount(1);
  await expect.poll(async () => ((await curve.getAttribute("d"))?.match(/M/g) ?? []).length).toBe(3);
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Dynamo" })).toContainText("3 buckets");
  await expect(page.getByText("Buckets below 10 matches are omitted.", { exact: false })).toBeVisible();
  await page.getByRole("combobox", { name: "Trend metric" }).click();
  await page.getByRole("option", { name: "Matches", exact: true }).click();
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Dynamo" })).toContainText("4 buckets");
  await expect.poll(async () => ((await curve.getAttribute("d"))?.match(/M/g) ?? []).length).toBe(2);
});

test("portrait focus highlights a selected series and its markers without changing selection", async ({ page }) => {
  await page.goto(`${trendUrl}&trend_heroes=11,1`);
  const picker = page.getByRole("region", { name: "Chart heroes", exact: true });
  await expect(page.locator(".recharts-line-curve")).toHaveCount(2);
  await picker.getByRole("button", { name: "Dynamo", exact: true }).focus();
  await expect(page.locator(".hero-line-11 .recharts-line-curve")).toHaveCSS("opacity", "1");
  await expect(page.locator(".hero-line-1 .recharts-line-curve")).toHaveCSS("opacity", "0.15");
  await expect(page.locator(".hero-dot-1").first()).toHaveCSS("opacity", "0.15");
  await expect(page.getByRole("list", { name: "Selected heroes" })).toHaveText("DynamoInfernus");
  await picker.getByRole("button", { name: "Clear selection", exact: true }).focus();
  await expect(page.locator(".hero-line-1 .recharts-line-curve")).toHaveCSS("opacity", "1");
  await picker.getByRole("button", { name: "Infernus", exact: true }).click();
  await expect(page.locator(".recharts-line-curve")).toHaveCount(1);
  await expect(page.locator(".hero-line-11 .recharts-line-curve")).toHaveCSS("opacity", "1");
});

test("dense charts reduce markers while preserving all line points and isolated readings", async ({ page }) => {
  const start = trendStart - 200 * 3600;
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    route.fulfill({
      json: [
        ...Array.from({ length: 150 }, (_, index) => ({
          ...stats[0],
          bucket: start + index * 3600,
          wins: 50 + (index % 10),
        })),
        ...[0, 75, 149].map((index) => Object.assign({}, stats[1], { bucket: start + index * 3600 })),
      ],
    }),
  );
  await page.goto(`${trendUrl}&trend_heroes=11,1&time_interval=start_time_hour`);
  await expect(page.locator(".hero-dot-1")).toHaveCount(3);
  await expect(page.locator(".hero-dot-11")).toHaveCount(0);
  const curve = page.locator(".hero-line-11 .recharts-line-curve");
  expect(((await curve.getAttribute("d"))?.match(/L/g) ?? []).length).toBe(149);
  const table = page.getByRole("table", { name: "Selected hero trend comparison" });
  await expect(table.getByRole("row").filter({ hasText: "Dynamo" })).toContainText("150 buckets");
  await expect(table.getByRole("row").filter({ hasText: "Infernus" })).toContainText("3 buckets");
});

test("crowded trend tooltips can scroll through every hero without changing the bucket", async ({ page }) => {
  const heroIds = Array.from({ length: 20 }, (_, index) => 101 + index);
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    route.fulfill({
      json: heroIds.flatMap((heroId, index) => [
        Object.assign({}, stats[0], { hero_id: heroId, bucket: trendStart, wins: 50 + index }),
        Object.assign({}, stats[0], { hero_id: heroId, bucket: trendStart + 86400, wins: 51 + index }),
      ]),
    }),
  );
  await page.goto(`${trendUrl}&trend_heroes=${heroIds.join(",")}`);
  await expect(page.locator(".recharts-line-curve")).toHaveCount(20);
  await page.locator(".hero-dot-101").first().hover();
  const readings = page.getByRole("region", { name: /^Hero values for/ });
  await expect(readings).toBeVisible();
  await expect(readings.getByRole("listitem")).toHaveCount(20);
  await expect(readings.getByRole("listitem").first()).toContainText("Hero 101");
  await expect(readings.getByRole("listitem").first()).toContainText("50%");
  await expect(readings.getByRole("listitem").first().getByLabel("100 matches")).toBeVisible();
  const bucket = await readings.getAttribute("aria-label");
  await readings.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => readings.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(readings).toHaveAttribute("aria-label", bucket!);
  await expect(readings.getByRole("listitem").last()).toBeInViewport();
  await readings.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => readings.evaluate((element) => element.scrollTop)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(readings).not.toBeVisible();
});

test("trend tooltip supports keyboard inspection and fits a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${trendUrl}&trend_heroes=11,1`);
  const chart = page.getByRole("application");
  await expect(page.locator(".recharts-line-curve")).toHaveCount(2);
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  const readings = page.getByRole("region", { name: /^Hero values for/ });
  await expect(readings).toBeVisible();
  await expect(readings.getByRole("listitem")).toHaveCount(2);
  await expect(readings.getByRole("listitem").filter({ hasText: "Dynamo" })).toContainText("60%");
  const box = await page.locator(".recharts-tooltip-wrapper").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(readings).not.toBeVisible();
});

test("small-sample empty states explain the cutoff and match counts still show their data", async ({ page }) => {
  await page.route("**/v1/analytics/hero-stats?**", (route) =>
    route.fulfill({
      json: trendStats.map((row) => Object.assign({}, row, { matches: 5, wins: 3, losses: 2 })),
    }),
  );
  await page.goto(trendUrl);
  await expect(page.getByText("No trend data for these filters", { exact: true })).toBeVisible();
  await expect(page.getByText("This metric requires at least 10 matches per bucket.", { exact: false })).toBeVisible();
  await page.getByRole("combobox", { name: "Trend metric" }).click();
  await page.getByRole("option", { name: "Matches", exact: true }).click();
  await expect(page.getByRole("figure")).toBeVisible();
  await expect(page.getByRole("table").getByRole("row").filter({ hasText: "Dynamo" })).toContainText("2 buckets");
});

for (const view of ["by-duration", "by-rank"]) {
  test(`${view} reuses the compact hero sidebar with equal height and clear recovery`, async ({ page }) => {
    await page.goto(`/analytics/heroes/${view}?date_range=_&min_rank=0`);
    const picker = page.getByRole("region", { name: "Chart heroes", exact: true });
    await expect(page.getByRole("figure")).toBeVisible();
    const panel = page.getByRole("region", {
      name: view === "by-duration" ? "Duration chart" : "Rank comparison chart",
      exact: true,
    });
    const plotBox = await panel.boundingBox();
    const pickerBox = await picker.boundingBox();
    expect(Math.abs(plotBox!.height - pickerBox!.height)).toBeLessThan(2);
    expect(pickerBox!.width).toBe(288);
    expect(pickerBox!.x).toBeGreaterThan(plotBox!.x);
    await picker.getByRole("button", { name: "Clear selection", exact: true }).click();
    await expect(page.getByText("Choose heroes to compare", { exact: true })).toBeVisible();
    await picker.getByRole("button", { name: "Show all", exact: true }).click();
    await expect(page.getByRole("figure")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(picker.getByRole("button", { name: "Infernus", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
}

for (const breakdown of ["duration", "rank"]) {
  test(`${breakdown} request failures show a retry instead of claiming the filters have no data`, async ({ page }) => {
    let fail = true;
    await page.route("**/v1/analytics/hero-stats?**", (route) =>
      fail ? route.fulfill({ status: 503, json: { error: "Unavailable" } }) : route.fulfill({ json: stats }),
    );
    await page.goto(`/analytics/heroes/by-${breakdown}?date_range=_&min_rank=0`);
    await expect(page.getByText(`Unable to load hero ${breakdown} data`, { exact: true })).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("figure")).toBeVisible();
    await expect(page).toHaveURL(/min_rank=0/);
  });
}
