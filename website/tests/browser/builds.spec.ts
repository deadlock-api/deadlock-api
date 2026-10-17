import { expect, test } from "@playwright/test";

import { upgrades } from "./fixtures";

// The default hero: the fixtures' hero list does not make every id a known hero, and an unknown one falls back to it.
const HERO_ID = 2;
/** Three builds, most played first; the second lists item 100, the others item 101. */
const BUILDS = [
  { id: 501, name: "Alpha Build", matches: 300, wins: 160, items: [101] },
  { id: 502, name: "Bravo Build", matches: 200, wins: 90, items: [100, 101] },
  { id: 503, name: "Charlie Build", matches: 100, wins: 55, items: [101] },
];

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/v1/analytics/hero-build-stats/${HERO_ID}`)
      return route.fulfill({
        json: BUILDS.map((build) => ({
          hero_id: HERO_ID,
          hero_build_id: build.id,
          bucket: 0,
          wins: build.wins,
          losses: build.matches - build.wins,
          matches: build.matches,
          players: build.matches,
        })),
      });
    if (url.pathname === "/v1/graphql" && route.request().postData()?.includes("hero_builds")) {
      // The page asks for every build under an alias `b<id>`.
      const ids = [...(route.request().postData() ?? "").matchAll(/b(\d+):/g)].map((match) => Number(match[1]));
      const data = Object.fromEntries(
        ids.map((id) => {
          const build = BUILDS.find((candidate) => candidate.id === id)!;
          return [
            `b${id}`,
            [
              {
                hero_build: {
                  hero_build_id: id,
                  name: build.name,
                  author_account_id: 1000 + id,
                  version: 1,
                  last_updated_timestamp: 1_790_000_000,
                  language: 0,
                  details: {
                    mod_categories: [
                      {
                        name: "Core",
                        description: null,
                        mods: build.items.map((itemId) => ({ ability_id: itemId, annotation: null })),
                      },
                    ],
                    ability_order: null,
                  },
                },
              },
            ],
          ];
        }),
      );
      return route.fulfill({ json: { data } });
    }
    // Everything else the page reads about a build answers empty: the list is under test, not its details.
    if (url.pathname.startsWith("/v1/analytics/")) return route.fulfill({ json: [] });
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? route.continue() : route.abort();
  });
});

test("the arrow keys step through the build list after a click on any cell", async ({ page }) => {
  await page.goto(`/analytics/builds?hero=${HERO_ID}&date_range=_`);
  const rows = page.getByRole("table", { name: "Builds by matches and win rate" }).locator("tbody > tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Alpha Build");

  // A click on a number cell, not the name button.
  await rows.nth(1).locator("td").nth(2).click();
  await expect(page).toHaveURL(/build=502/);
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/build=503/);
  await expect(rows.nth(2).getByRole("button", { name: "Charlie Build" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page).toHaveURL(/build=501/);
  await expect(rows.first()).toHaveAttribute("data-state", "active");
});

test("the item filter keeps the builds that list the item", async ({ page }) => {
  await page.goto(`/analytics/builds?hero=${HERO_ID}&date_range=_&with_items=${upgrades[0].id}`);
  const rows = page.getByRole("table", { name: "Builds by matches and win rate" }).locator("tbody > tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Bravo Build");

  await page.goto(`/analytics/builds?hero=${HERO_ID}&date_range=_&without_items=${upgrades[0].id}`);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Alpha Build");
});
