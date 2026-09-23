import { expect, test } from "@playwright/test";

import { ACCOUNT_ID, CURRENT_MATCH } from "./fixtures";

test.beforeEach(async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem("tracker-feedback-notice-dismissed", "true"));
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
    deadlockdle: "games/deadlockdle",
    flashcards: "games/flashcards",
  };
  await Promise.all(
    Object.entries(destinations).map(async ([old, destination]) => {
      const response = await request.get(`/${old}?hero=11&date_range=_`, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(`/${destination}?hero=11&date_range=_`);
    }),
  );
  await Promise.all(
    [
      ["/heroes/dynamo", "/analytics/heroes/dynamo"],
      ["/items/extra-health", "/analytics/items/extra-health"],
      ["/heroes?tab=stats-by-duration&min_rank=61", "/analytics/heroes/by-duration?min_rank=61"],
      ["/analytics/items?tab=item-purchase-analysis&hero=11", "/analytics/items/item-purchase-analysis?hero=11"],
      ["/deadlockdle/guess-hero?date=2026-09-01", "/games/deadlockdle/guess-hero?date=2026-09-01"],
      ["/flashcards/item-upgrades", "/games/flashcards/item-upgrades"],
      ["/players/400239835?match=105968442", "/tracker/players/400239835?match=105968442"],
    ].map(async ([old, destination]) => {
      const response = await request.get(old, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(destination);
    }),
  );
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
  await Promise.all(
    [
      ["Players", "/analytics/players"],
      ["Heroes", "/analytics/heroes"],
      ["Leaderboard", "/community/leaderboard"],
      ["Rank Distribution", "/community/badge-distribution"],
      ["Kill Heatmap", "/community/heatmap"],
      ["Player Tracker", "/tracker"],
      ["Blog", "/blog"],
      ["Deadlockdle", "/games/deadlockdle"],
      ["Flashcards", "/games/flashcards"],
      ["Stream Kit", "/streamkit"],
    ].map(([name, href]) => expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href)),
  );
  await page.getByRole("tab", { name: "Stats Metrics", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/players\/stats-metrics\?date_range=_$/);
});

test("old player profiles retain their selected match on the tracker path", async ({ page }) => {
  await page.goto(`/players/${ACCOUNT_ID}?date_range=_&match=${CURRENT_MATCH}`);
  await expect(page).toHaveURL(new RegExp(`/tracker/players/${ACCOUNT_ID}\\?date_range=_&match=${CURRENT_MATCH}$`));
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Player Tracker", exact: true }),
  ).toHaveAttribute("href", "/tracker");
});

test("game hubs keep archive dates and use their new paths", async ({ page }) => {
  await page.goto("/deadlockdle?date=2026-09-01");
  await expect(page).toHaveURL(/\/games\/deadlockdle\?date=2026-09-01$/);
  await expect(page.locator('a[href="/games/deadlockdle/guess-hero?date=2026-09-01"]')).toBeVisible();
  await page.goto("/flashcards");
  await expect(page).toHaveURL(/\/games\/flashcards$/);
  await expect(page.locator('a[href="/games/flashcards/items"]')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://deadlock-api.com/games/flashcards",
  );
});

test("hero and item slugs written another way redirect to the canonical address", async ({ request }) => {
  await Promise.all(
    [
      ["/analytics/heroes/Dynamo", "/analytics/heroes/dynamo"],
      ["/analytics/items/Sold_Item_1", "/analytics/items/sold-item-1"],
    ].map(async ([from, to]) => {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(to);
    }),
  );
  expect((await request.get("/analytics/heroes/dynamoo", { maxRedirects: 0 })).status()).toBe(404);
});

test("a Deadlockdle game saved as today still reads as finished once it is in the past", async ({ page }) => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  // Games saved before each day got its own storage slot live under the undated key.
  await page.addInitScript((date) => {
    localStorage.setItem(
      "deadlockdle:guess-hero:game",
      JSON.stringify({ date, status: "won", guesses: ["Dynamo"], hintsRevealed: 1 }),
    );
  }, yesterday);
  await page.goto(`/games/deadlockdle?date=${yesterday}`);
  await expect(page.getByRole("link", { name: /Guess the Hero/ })).toContainText(/completed/i);
});
