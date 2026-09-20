import { expect, test } from "@playwright/test";

import { upgrades } from "./fixtures";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/v1/analytics/item-stats")
      return route.fulfill({
        json: upgrades.slice(0, 2).map((item, index) => ({
          item_id: item.id,
          matches: 100,
          wins: 60 - index * 10,
          losses: 40 + index * 10,
          players: 100,
        })),
      });
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? route.continue() : route.abort();
  });
});

test("item statistics retain keyboard sorting and visible names while scrolling", async ({ page }) => {
  await page.goto("/analytics/items?date_range=_");
  const table = page.getByRole("table", { name: "Item statistics", exact: true });
  const rows = table.locator("tbody > tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Sold Item 1");
  const sort = table.getByRole("button", { name: "Win Rate", exact: true });
  await sort.focus();
  await sort.press("Enter");
  await expect(rows.first()).toContainText("Sold Item 2");
  await expect(page).toHaveURL(/item_sort_direction=asc/);
  await expect(table.getByRole("columnheader", { name: "Win Rate", exact: true })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await rows.first().scrollIntoViewIfNeeded();
  await table.evaluate((element) => {
    element.parentElement!.scrollLeft = element.scrollWidth;
  });
  const item = rows.first().getByRole("link", { name: "Sold Item 2", exact: true });
  await expect(item).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("compact data headings preserve their context behind an accessible disclosure", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/analytics/items?date_range=_");
  const description = page.getByText(/Analyze item win rates with statistical confidence intervals/);
  await expect(description).not.toBeVisible();
  const toggle = page.locator("main summary").filter({ hasText: "About this data" });
  await toggle.focus();
  await toggle.press("Enter");
  await expect(description).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
