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

test("advanced hero filters preserve their selections when collapsed", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(overviewUrl);
  await page.waitForLoadState("networkidle");
  const advanced = page.locator("summary").filter({ hasText: "Advanced" });
  const range = page.getByRole("button", { name: "Matches (range) Any", exact: true });
  await expect(page.getByRole("button", { name: /Mode Ranked/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Date / })).toBeVisible();
  await expect(range).not.toBeVisible();
  await advanced.focus();
  await advanced.press("Enter");
  await expect(range).toBeVisible();
  await expect(page.getByRole("button", { name: "Matches (total) Any", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Group by None", exact: true }).click();
  await page.getByRole("button", { name: "Hero type", exact: true }).click();
  await expect(page).toHaveURL(/group_by_type=true/);
  await advanced.focus();
  await advanced.press("Space");
  await expect(page.getByRole("button", { name: "Group by Hero type", exact: true })).not.toBeVisible();
  await advanced.press("Enter");
  await expect(page.getByRole("button", { name: "Group by Hero type", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("hero rank and identity stay together while the crisp table scrolls", async ({ page }) => {
  await page.goto(overviewUrl);
  const table = page.getByRole("table", { name: "Hero stats", exact: true });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  for (const width of [320, 390, 700, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await table.evaluate((element) => {
      const container = element.parentElement!;
      container.scrollLeft = 0;
      const identity = element.querySelector("tbody tr td")!;
      const before = identity.getBoundingClientRect().left;
      container.scrollLeft = 200;
      return {
        before,
        after: identity.getBoundingClientRect().left,
        text: identity.textContent,
        scroll: container.scrollLeft,
        mask: getComputedStyle(container).maskImage,
        left: container.getBoundingClientRect().left,
        right: container.getBoundingClientRect().right,
        pageWidth: document.body.getBoundingClientRect().right,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(result.text).toBe("1Dynamo100 matches");
    expect(result.after).toBeCloseTo(result.before);
    expect(result.mask).toBe("none");
    expect(result.overflow).toBe(false);
    if (width < 768) {
      expect(result.scroll).toBeGreaterThan(0);
      expect(result.left).toBeCloseTo(0);
      expect(result.right).toBeCloseTo(result.pageWidth);
    }
  }
});
