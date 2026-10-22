import { expect, test } from "@playwright/test";
import type { AnalyticsHeroStats } from "deadlock_api_client";

const totals = {
  bucket: 91,
  players: 100,
  matches_per_bucket: 300,
  bucket_matches_since_first_day: 300,
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
  total_permanent_buffs: 2500,
  permanent_buff_timing_matches: 0,
  total_first_permanent_buff_time_s: 0,
};
const stats: AnalyticsHeroStats[] = [
  { ...totals, hero_id: 11, matches: 100, permanent_buff_matches: 100, wins: 60, losses: 40 },
  { ...totals, hero_id: 1, matches: 200, permanent_buff_matches: 200, wins: 90, losses: 110 },
];
const overviewUrl = "/analytics/heroes?date_range=_&min_rank=0";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/hero-stats") {
      return route.fulfill({ json: stats });
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
  await expect(page.getByRole("row").filter({ hasText: "Infernus" })).toBeVisible();
  await expect(page).toHaveURL(/min_rank=0/);
});

test("overview search and recovery fit a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(overviewUrl);
  const search = page.getByRole("searchbox", { name: "Filter heroes by name" });
  await expect(page.getByRole("row").filter({ hasText: "Infernus" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await search.fill("unknown");
  await expect(page.getByText("No heroes match your search")).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).last().click();
  await expect(search).toHaveValue("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
