import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? route.continue() : route.abort();
  });
});

test("old category URLs permanently redirect and preserve filters", async ({ request }) => {
  const destinations = {
    games: "analytics/games",
    heroes: "analytics/heroes",
    items: "analytics/items",
    abilities: "analytics/abilities",
    players: "analytics/players",
    "team-builder": "analytics/team-builder",
    leaderboard: "community/leaderboard",
    "badge-distribution": "community/badge-distribution",
    heatmap: "community/heatmap",
  };
  for (const [old, destination] of Object.entries(destinations)) {
    const response = await request.get(`/${old}?hero=11&date_range=_`, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(`/${destination}?hero=11&date_range=_`);
  }
  for (const [old, destination] of [
    ["/heroes/dynamo", "/analytics/heroes/dynamo"],
    ["/items/extra-health", "/analytics/items/extra-health"],
    ["/heroes?tab=stats-by-duration&min_rank=61", "/analytics/heroes/by-duration?min_rank=61"],
    ["/analytics/items?tab=item-purchase-analysis&hero=11", "/analytics/items/item-purchase-analysis?hero=11"],
  ]) {
    const response = await request.get(old, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(destination);
  }
});

test("hero view paths preserve filters across navigation, history and reload", async ({ page }) => {
  await page.goto("/heroes?tab=stats-by-duration&min_rank=61&date_range=_");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/analytics\/heroes\/by-duration\?min_rank=61&date_range=_$/);
  await expect(page.getByRole("tab", { name: "By Duration", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://deadlock-api.com/analytics/heroes/by-duration",
  );
  await page.getByRole("tab", { name: "By Rank", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/heroes\/by-rank\?min_rank=61&date_range=_$/);
  await page.goBack();
  await expect(page.getByRole("tab", { name: "By Duration", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("tab", { name: "By Duration", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Overall Stats", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/heroes\?min_rank=61&date_range=_$/);
});

test("item purchase links use the requested path and mobile view selection updates the URL", async ({ page }) => {
  await page.goto("/analytics/items?tab=item-purchase-analysis&hero=11&date_range=_");
  await expect(page).toHaveURL(/\/analytics\/items\/item-purchase-analysis\?hero=11&date_range=_$/);
  await expect(page.getByRole("tab", { name: "Purchase Analysis", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("combobox", { name: "Item stats sections", exact: true }).click();
  await page.getByRole("option", { name: "Item Combos", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/items\/combos\?hero=11&date_range=_$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("navigation groups move while tracker and other categories keep their paths", async ({ page }) => {
  await page.goto("/analytics/players?date_range=_");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  for (const [name, href] of [
    ["Players", "/analytics/players"],
    ["Heroes", "/analytics/heroes"],
    ["Leaderboard", "/community/leaderboard"],
    ["Rank Distribution", "/community/badge-distribution"],
    ["Kill Heatmap", "/community/heatmap"],
    ["Player Tracker", "/tracker"],
    ["Blog", "/blog"],
    ["Deadlockdle", "/deadlockdle"],
    ["Stream Kit", "/streamkit"],
  ])
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  await page.getByRole("tab", { name: "Stats Metrics", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/players\/stats-metrics\?date_range=_$/);
});
