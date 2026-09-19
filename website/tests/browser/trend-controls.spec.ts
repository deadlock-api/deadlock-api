import { expect, test } from "@playwright/test";

const start = Math.floor(Date.now() / 86_400_000) * 86_400 - 30 * 86_400;

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/game-stats") {
      return route.fulfill({
        json: [
          { bucket: start, total_matches: 100, avg_kills: 12, avg_deaths: 10 },
          { bucket: start + 7 * 86400, total_matches: 200, avg_kills: 14, avg_deaths: 11 },
        ],
      });
    }
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? route.continue() : route.abort();
  });
});

test("shared game trend controls preserve metrics and intervals in the URL", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/v1/analytics/game-stats") requests.push(request.url());
  });
  await page.goto("/analytics/games/over-time?date_range=_");
  const metric = page.getByRole("combobox", { name: "Trend metric" });
  await expect(metric).toHaveText("Avg Kills");
  await metric.click();
  await page.getByRole("option", { name: "Avg Deaths", exact: true }).click();
  await page.getByRole("radio", { name: "Weekly", exact: true }).click();
  await expect(page).toHaveURL(/stat=avg_deaths/);
  await expect(page).toHaveURL(/time_bucket=start_time_week/);
  await expect(page.getByRole("figure", { name: "Avg Deaths over time chart" })).toBeVisible();
  expect(requests.some((url) => new URL(url).searchParams.get("bucket") === "start_time_week")).toBe(true);
  await page.reload();
  await expect(metric).toHaveText("Avg Deaths");
  await expect(page.getByRole("radio", { name: "Weekly", exact: true })).toBeChecked();
});

test("shared controls retain Brawl metric restrictions and fit mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/analytics/games/over-time?date_range=_&game_mode=street_brawl&match_mode=unranked");
  await page.getByRole("combobox", { name: "Trend metric" }).click();
  await expect(page.getByRole("option", { name: "Avg Deaths", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Mid Boss Kill Rate", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Avg Souls", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Avg Deaths", exact: true }).click();
  await expect(page.getByRole("figure", { name: "Avg Deaths over time chart" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
