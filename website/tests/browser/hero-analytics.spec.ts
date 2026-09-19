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
const overviewUrl = "/analytics/heroes?date_range=_&min_rank=0";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/hero-stats") return route.fulfill({ json: stats });
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
