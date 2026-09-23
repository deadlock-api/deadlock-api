import { expect, test } from "@playwright/test";

import { ACCOUNT_ID, API_ORIGIN, CURRENT_MATCH, history, metadata, requestedMatchId, TRACKER_URL } from "./fixtures";

test.beforeEach(async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem("tracker-feedback-notice-dismissed", "true"));
  // Keep analytics, avatars and other optional integrations outside the regression suite.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" ? route.continue() : route.abort();
  });
});

test("filter boxes reset independently and keep the selected match", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/assets/ranked-seasons`, (route) =>
    route.fulfill({
      json: [
        {
          class_name: "test_beta_season_1",
          name: "Beta Season 1",
          intervals: [
            {
              start_timestamp: Date.parse("2026-07-30T20:00:00Z") / 1000,
              end_timestamp: Date.parse("2027-01-01T00:00:00Z") / 1000,
            },
          ],
        },
      ],
    }),
  );
  await page.goto(`${TRACKER_URL}&hero=11&result=win&match_mode=ranked`);
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  const hero = page.getByRole("button", { name: "Reset hero", exact: true });
  const result = page.getByRole("button", { name: "Reset result", exact: true });
  const mode = page.getByRole("button", { name: "Reset mode", exact: true });
  const date = page.getByRole("button", { name: "Reset date", exact: true });
  await expect(date).toBeVisible();
  await hero.click();
  await expect(hero).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Hero Any$/i })).toBeFocused();
  await expect(page).not.toHaveURL(/[?&]hero=/);
  await expect(result).toBeEnabled();
  await expect(mode).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await result.click();
  await expect(result).toHaveCount(0);
  await expect(
    page.getByRole("radiogroup", { name: "Result", exact: true }).getByRole("radio", { name: "All", exact: true }),
  ).toBeFocused();
  await expect(mode).toBeEnabled();
  await mode.click();
  await expect(mode).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`match=${CURRENT_MATCH}`));

  await page.setViewportSize({ width: 320, height: 568 });
  const filters = page.getByRole("button", { name: /^Filters:/ });
  if ((await filters.getAttribute("aria-expanded")) === "false") await filters.click();
  await page.getByRole("button", { name: /^Date All Time$/i }).click();
  const calendar = page.getByRole("dialog");
  await expect(calendar).toBeVisible();
  const bounds = await calendar.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Reset restores the page's initial season and removes its own control.
  await expect(date).toBeEnabled();
  await date.click();
  await expect(date).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Date Beta Season 1$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Date Beta Season 1$/i })).toBeFocused();
  await expect(page).not.toHaveURL(/date_range=_/);
  await expect(page).toHaveURL(new RegExp(`match=${CURRENT_MATCH}`));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  await page.getByRole("button", { name: /^Filters:/ }).click();
  await expect(page.getByRole("button", { name: /^Reset / })).toHaveCount(0);
});

test("saved-only history preserves details and navigates between bookmarked matches", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "[3000,2998,2996]"),
    `tracker:saved-matches:${ACCOUNT_ID}`,
  );
  await page.goto(TRACKER_URL);
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  const filter = page.getByRole("button", { name: "Show only saved matches", exact: true });
  const historyList = page.getByRole("navigation", { name: "Match history", exact: true });
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await expect(historyList.locator("[data-match-id]")).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Match navigation", exact: true })).toContainText("2 of 3");
  await page.getByRole("button", { name: "Next match in list", exact: true }).click();
  await expect(page).toHaveURL(/match=2996/);
  await expect(historyList.locator('[data-match-id="2996"]')).toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: "Remove match from saved matches", exact: true }).click();
  await expect(historyList.locator("[data-match-id]")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Match 2996 details", exact: true })).toBeVisible();

  // Removing bookmarks in another tab updates the list without dismissing the open match.
  await page.evaluate((key) => {
    localStorage.setItem(key, "[]");
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: "[]", storageArea: localStorage }));
  }, `tracker:saved-matches:${ACCOUNT_ID}`);
  await expect(historyList.locator("[data-match-id]")).toHaveCount(0);
  await expect(historyList).toContainText("No saved matches match these filters.");
  await expect(page.getByRole("region", { name: "Match 2996 details", exact: true })).toBeVisible();
  await historyList.getByRole("button", { name: "Show all matches", exact: true }).click();
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await expect(filter).toBeFocused();
  await expect(historyList.locator('[data-match-id="2996"]')).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(/match=2996/);

  await page.setViewportSize({ width: 320, height: 568 });
  await filter.click();
  await page.getByRole("button", { name: "Back to overview", exact: true }).click();
  await page.getByRole("button", { name: "Match history", exact: true }).click();
  await expect(historyList).toBeFocused();
  const bounds = await historyList.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
});

test("hero comparisons wait for a successful rank lookup and recover without hiding player stats", async ({ page }) => {
  let rankAvailable = false;
  let rankBadge = 115;
  const cohorts: string[] = [];
  await page.route(`${API_ORIGIN}/v1/players/${ACCOUNT_ID}/rank`, (route) =>
    route.fulfill({
      status: rankAvailable ? 200 : 400,
      json: rankAvailable ? { badge: rankBadge } : { error: "Rank unavailable" },
    }),
  );
  await page.route(`${API_ORIGIN}/v1/players/hero-stats?**`, (route) =>
    route.fulfill({
      json: [
        {
          hero_id: 11,
          matches_played: 20,
          wins: 12,
          kills: 100,
          deaths: 50,
          assists: 100,
          networth_per_min: 1000,
          damage_per_min: 400,
          last_hits_per_min: 3,
          last_played: history[0].start_time,
        },
      ],
    }),
  );
  await page.route(`${API_ORIGIN}/v1/analytics/hero-stats?**`, (route) => {
    const params = new URL(route.request().url()).searchParams;
    cohorts.push(`${params.get("min_average_badge")}-${params.get("max_average_badge")}`);
    return route.fulfill({
      json: [{ hero_id: 11, matches: 100, wins: 50, total_kills: 300, total_deaths: 200, total_assists: 300 }],
    });
  });
  await page.goto(`/tracker/players/${ACCOUNT_ID}?date_range=_&tab=heroes`);
  const table = page.getByRole("table", { name: "Detailed hero performance", exact: true });
  await expect(table).toContainText("60.0%");
  await expect(page.getByText("Could not load comparison rank", { exact: true })).toBeVisible();
  expect(cohorts).toEqual([]);
  await expect(page.getByRole("button", { name: "Dynamo win rate comparison details", exact: true })).toHaveCount(0);
  rankAvailable = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Could not load comparison rank", { exact: true })).toHaveCount(0);
  await expect.poll(() => cohorts).toEqual(["111-116"]);
  await expect(table).toContainText("60.0%");
  await expect(page.getByText(/Compared with Tier 11 players/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Dynamo win rate comparison details", exact: true })).toBeVisible();
  // A confirmed unranked player still gets the intentional all-player comparison.
  rankBadge = 0;
  await page.reload();
  await expect(page.getByText(/Compared with all players/)).toBeVisible();
  expect(cohorts).toEqual(["111-116", "null-null"]);
});

test("hero details opened offline explain the pause and resume when reconnected", async ({ page, context }) => {
  let heroRequests = 0;
  await page.route(`${API_ORIGIN}/v1/players/hero-stats?**`, (route) => {
    heroRequests += 1;
    return route.fulfill({ json: [] });
  });
  await page.goto(`/tracker/players/${ACCOUNT_ID}?date_range=_`);
  const openDetails = page.getByRole("button", { name: "Show more hero pool", exact: true });
  await expect(openDetails).toBeVisible();
  await context.setOffline(true);
  await openDetails.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Waiting for connection", { exact: true })).toBeVisible();
  expect(heroRequests).toBe(0);
  await context.setOffline(false);
  await expect(dialog.getByText("Waiting for connection", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("table", { name: "Detailed hero performance", exact: true })).toBeVisible();
  expect(heroRequests).toBe(1);
});

test("preloads only adjacent matches after current details load and reuses their cache", async ({ page }) => {
  const requested: number[] = [];
  let releaseCurrent!: () => void;
  const currentGate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id != null) {
      requested.push(id);
      if (id === CURRENT_MATCH) await currentGate;
    }
    await route.continue();
  });

  await page.goto(TRACKER_URL);
  await expect.poll(() => requested).toEqual([CURRENT_MATCH]);
  await expect(page.getByRole("button", { name: "Next match in list", exact: true })).toBeEnabled();
  // Exercise the controls while the response is held, allowing pending render/idle work to run.
  await page.getByRole("button", { name: "Show oldest matches first", exact: true }).click();
  await expect(page).toHaveURL(/dir=asc/);
  await page.getByRole("button", { name: "Show newest matches first", exact: true }).click();
  await expect(page).not.toHaveURL(/dir=asc/);
  expect(requested).toEqual([CURRENT_MATCH]);

  releaseCurrent();
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  await expect.poll(() => [...requested].sort()).toEqual([2997, 2998, 2999]);
  await page.getByRole("button", { name: "Next match in list", exact: true }).click();
  await expect(page).toHaveURL(/match=2997/);
  await expect.poll(() => [...requested].sort()).toEqual([2996, 2997, 2998, 2999]);
  expect(requested.filter((id) => id === 2997)).toHaveLength(1);
});

test("changing matches cancels adjacent requests that have not started", async ({ page }) => {
  await page.addInitScript(() => {
    const queued = new Map<number, IdleRequestCallback>();
    let nextId = 0;
    window.requestIdleCallback = (callback) => {
      const id = nextId;
      nextId += 1;
      queued.set(id, callback);
      return id;
    };
    window.cancelIdleCallback = (id) => {
      queued.delete(id);
    };
    window.addEventListener("test:flush-idle", () => {
      const callbacks = [...queued.values()];
      queued.clear();
      for (const callback of callbacks) callback({ didTimeout: false, timeRemaining: () => 50 });
    });
  });
  const requested: number[] = [];
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id != null) requested.push(id);
    await route.continue();
  });

  await page.goto(TRACKER_URL);
  const picker = page.getByRole("combobox", { name: "Player shown on match timeline" });
  await expect(picker).toBeVisible();
  expect(requested).toEqual([CURRENT_MATCH]);
  await page.getByRole("button", { name: "Next match in list", exact: true }).click();
  await expect(page).toHaveURL(/match=2997/);
  await expect(picker).toBeVisible();
  expect(requested).toEqual([CURRENT_MATCH, 2997]);
  await page.evaluate(() => window.dispatchEvent(new Event("test:flush-idle")));
  await expect.poll(() => [...requested].sort()).toEqual([2996, 2997, 2998]);
});

for (const missing of ["no record", "no players"]) {
  test(`an unavailable match with ${missing} waits for a successful retry before preloading neighbors`, async ({
    page,
  }) => {
    const requested: number[] = [];
    let available = false;
    await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
      const id = requestedMatchId(route.request().postDataJSON());
      if (id == null) return route.continue();
      requested.push(id);
      const unavailable = missing === "no players" ? [{ ...metadata, players: [] }] : [];
      await route.fulfill({ json: { data: { matches: available ? [metadata] : unavailable } } });
    });
    await page.route(`${API_ORIGIN}/v1/matches/*/metadata`, (route) =>
      route.fulfill({ json: missing === "no players" ? { match_info: { players: [] } } : {} }),
    );
    await page.goto(TRACKER_URL);
    await expect(page.getByText("Match details unavailable", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show oldest matches first", exact: true }).click();
    await expect(page).toHaveURL(/dir=asc/);
    expect(requested).toEqual([CURRENT_MATCH]);
    available = true;
    await page.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
    await expect.poll(() => [...requested].sort()).toEqual([2997, 2998, 2998, 2999]);
  });
}

test("the first match preloads only its available neighbor", async ({ page }) => {
  const requested: number[] = [];
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id != null) requested.push(id);
    await route.continue();
  });
  await page.goto(TRACKER_URL.replace(`match=${CURRENT_MATCH}`, "match=3000"));
  await expect(page.getByRole("button", { name: "Previous match in list", exact: true })).toBeDisabled();
  await expect.poll(() => [...requested].sort()).toEqual([2999, 3000]);
});

test("saved markers persist across reload and clear when a saved match is removed", async ({ page }) => {
  await page.goto(TRACKER_URL);
  await page.getByRole("button", { name: "Save match for later", exact: true }).click();
  const historyRow = page.locator(`[data-match-id="${CURRENT_MATCH}"]`);
  await expect(historyRow.getByLabel("Saved match", { exact: true })).toBeVisible();
  await expect(historyRow.getByLabel("Saved match", { exact: true })).toHaveAttribute("fill", "currentColor");

  await page.reload();
  await expect(historyRow.getByLabel("Saved match", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove match from saved matches", exact: true }).click();
  await expect(historyRow.getByLabel("Saved match", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save match for later", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("saved markers synchronize when another tab removes the bookmark", async ({ page, context }) => {
  await page.goto(TRACKER_URL);
  await page.getByRole("button", { name: "Save match for later", exact: true }).click();
  const secondTab = await context.newPage();
  await secondTab.goto(TRACKER_URL);
  await secondTab.getByRole("button", { name: "Remove match from saved matches", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save match for later", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    page.locator(`[data-match-id="${CURRENT_MATCH}"]`).getByLabel("Saved match", { exact: true }),
  ).toHaveCount(0);
});

test("a failed browser-storage write does not show a match as saved", async ({ page }) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage is full", "QuotaExceededError");
      return setItem.call(this, name, value);
    };
  }, `tracker:saved-matches:${ACCOUNT_ID}`);
  await page.goto(TRACKER_URL);
  const save = page.getByRole("button", { name: "Save match for later", exact: true });
  await save.click();
  await expect(
    page.getByText("Could not update saved matches. Browser storage is unavailable or full.", { exact: true }),
  ).toBeVisible();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.locator(`[data-match-id="${CURRENT_MATCH}"]`).getByLabel("Saved match", { exact: true }),
  ).toHaveCount(0);
});

test("scoreboard shows the final build and the compact timeline fits wide and small screens", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1319 });
  await page.goto(TRACKER_URL);
  await expect(page.getByRole("button", { name: "Final Item 11 details", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sold Item 1 details", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "View Tracker Tester's build timeline", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Build timeline" });
  await expect(dialog.locator("[data-build-event]")).toHaveCount(33);
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const first = element.querySelector('[data-build-event="0"]')!.getBoundingClientRect();
        const second = element.querySelector('[data-build-event="1"]')!.getBoundingClientRect();
        return second.x > first.x && Math.abs(second.y - first.y) < 1;
      }),
    )
    .toBe(true);

  /* oxlint-disable eslint/no-await-in-loop -- Each resize must settle before measuring the same page. */
  for (const viewport of [
    { width: 2560, height: 1319 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(dialog.locator("[data-build-event]")).toHaveCount(33);
    await expect
      .poll(() =>
        dialog.evaluate((element) => ({
          fits: element.getBoundingClientRect().height <= window.innerHeight - 24,
          scrolls: element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1,
        })),
      )
      .toEqual({ fits: true, scrolls: false });
  }
  /* oxlint-enable eslint/no-await-in-loop */
  await dialog.locator('[data-build-event="0"]').focus();
  await page.keyboard.press("End");
  await expect(dialog.locator('[data-build-event="32"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /CSV|JSON/ })).toHaveCount(0);
});

test("timeline player picker updates the scoreboard and works with keyboard navigation", async ({ page }) => {
  await page.goto(TRACKER_URL);
  const picker = page.getByRole("combobox", { name: "Player shown on match timeline" });
  await picker.click();
  await page.getByRole("option", { name: /Test Opponent$/ }).click();
  await expect(picker).toHaveText("Test Opponent");
  await expect(page.getByRole("button", { name: "Test Opponent", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(picker).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(page.getByRole("option", { name: /Tracker Tester$/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker).toHaveText("Tracker Tester");
  await expect(page.getByRole("button", { name: "Tracker Tester", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("narrow scoreboards can sort statistics whose columns are hidden", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    if (requestedMatchId(route.request().postDataJSON()) == null) return route.continue();
    await route.fulfill({
      json: {
        data: {
          matches: [
            {
              ...metadata,
              players: [
                ...metadata.players,
                {
                  ...metadata.players[0],
                  account_id: 43,
                  player_slot: 3,
                  steam: { personaname: "Test Teammate" },
                  max_player_damage: 50000,
                  items: [],
                },
              ],
            },
          ],
        },
      },
    });
  });
  await page.goto(TRACKER_URL);
  const table = page.getByRole("table", { name: "The Hidden King scoreboard", exact: true });
  const names = table.locator("tbody button[aria-pressed]");
  const sort = page.getByRole("combobox", { name: "Sort The Hidden King scoreboard", exact: true });
  await expect(names).toHaveText(["Tracker Tester", "Test Teammate"]);
  await expect(
    table.getByRole("button", { name: "Sort scoreboard by hero damage, highest first", exact: true }),
  ).toBeHidden();
  await sort.click();
  await page.getByRole("option", { name: "Hero damage", exact: true }).click();
  await expect(names).toHaveText(["Test Teammate", "Tracker Tester"]);
  await page.getByRole("button", { name: "Sort The Hidden King scoreboard lowest first", exact: true }).click();
  await expect(names).toHaveText(["Tracker Tester", "Test Teammate"]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await sort.click();
  await page.getByRole("option", { name: "Lane order", exact: true }).click();
  await expect(names).toHaveText(["Tracker Tester", "Test Teammate"]);
  await expect(sort).toHaveText("Player");
});

test("companion pagination resets for filter changes while preserving search and sort", async ({ page }) => {
  await page.clock.install();
  const sharedMatches = history.map((match) => match.match_id);
  await page.route(`${API_ORIGIN}/v1/players/*/mate-stats**`, (route) =>
    route.fulfill({
      json: Array.from({ length: 24 }, (_, index) => ({ mate_id: 1000 + index, matches: sharedMatches })),
    }),
  );
  await page.route(`${API_ORIGIN}/v1/players/*/enemy-stats**`, (route) =>
    route.fulfill({
      json: Array.from({ length: 24 }, (_, index) => ({ enemy_id: 2000 + index, matches: sharedMatches })),
    }),
  );
  await page.goto(`/tracker/players/${ACCOUNT_ID}?date_range=_&tab=mates`);
  const mates = page.getByRole("table", { name: "Detailed teammate stats", exact: true });
  const enemies = page.getByRole("table", { name: "Detailed opponent stats", exact: true });
  await expect(mates.getByRole("row")).toHaveCount(11);
  await expect(enemies.getByRole("row")).toHaveCount(11);
  await page.getByRole("searchbox", { name: "Search player", exact: true }).first().fill("Player");
  await mates.getByRole("button", { name: "Sort by win rate, descending", exact: true }).click();
  const matePage = page.getByRole("spinbutton", { name: "Page number", exact: true }).first();
  const enemyPage = page.getByRole("spinbutton", { name: "Page number", exact: true }).last();
  await matePage.fill("3");
  await enemyPage.fill("2");
  await page.getByRole("radio", { name: "Wins", exact: true }).click();
  await expect(matePage).toHaveValue("1");
  await expect(enemyPage).toHaveValue("1");
  await expect(page.getByRole("searchbox", { name: "Search player", exact: true }).first()).toHaveValue("Player");
  await expect(mates.getByRole("columnheader", { name: "Sort by win rate, ascending", exact: true })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await expect(mates.getByRole("button", { name: "View 25 matches with Player 1000", exact: true })).toBeVisible();
  await matePage.fill("3");
  await page.clock.fastForward(61_000);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: /Refreshing/ })).toHaveCount(0);
  await expect(matePage).toHaveValue("3");
  await page.getByRole("radio", { name: "Losses", exact: true }).click();
  await expect(matePage).toHaveValue("1");
  await matePage.fill("2");
  await page.goBack();
  await expect(matePage).toHaveValue("1");
  // A cleared field stays empty while it is being edited and shows the current page again once it is left.
  await matePage.fill("");
  await expect(matePage).toHaveValue("");
  await matePage.press("Tab");
  await expect(matePage).toHaveValue("1");
});

test("shared-match history opens older matches and returns focus to their details", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/players/*/mate-stats**`, (route) =>
    route.fulfill({ json: [{ mate_id: 1000, matches: history.map((match) => match.match_id) }] }),
  );
  await page.goto(`/tracker/players/${ACCOUNT_ID}?date_range=_`);
  await page.getByRole("button", { name: "View 50 matches with Player 1000", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Matches with Player 1000", exact: true });
  const shared = dialog.getByRole("navigation", { name: "Shared match history", exact: true });
  await expect(shared.getByRole("button")).toHaveCount(20);
  await shared.getByRole("button").first().focus();
  await page.keyboard.press("End");
  await expect(shared.locator('[data-match-id="2981"]')).toBeFocused();
  await dialog.getByRole("button", { name: "Show 20 more matches", exact: true }).click();
  await expect(shared.getByRole("button")).toHaveCount(40);
  await expect(shared.locator('[data-match-id="2980"]')).toBeFocused();
  await page.keyboard.press("End");
  await expect(shared.locator('[data-match-id="2961"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/match=2961/);
  await expect(page.locator('[data-match-details="2961"]')).toBeFocused();
  await expect(page.locator('[data-match-id="2961"]')).toHaveAttribute("aria-current", "true");
});

test("timeline legend toggles chart overlays without losing the readable event list", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    if (!requestedMatchId(route.request().postDataJSON())) return route.continue();
    await route.fulfill({
      json: {
        data: {
          matches: [{ ...metadata, objectives: [{ team: "Team1", team_objective: "Tier1", destroyed_time_s: 600 }] }],
        },
      },
    });
  });
  await page.goto(TRACKER_URL);
  const chart = page.locator('svg[aria-label="Team soul lead and match events over time"]');
  const chips = chart.locator("foreignObject img");
  const deadWindows = chart.locator(".recharts-reference-area");
  const objectiveMarkers = chart.locator('foreignObject [style*="mask:"]');
  await expect(chips).toHaveCount(2);
  await expect(deadWindows).toHaveCount(1);
  await expect(objectiveMarkers).toHaveCount(1);
  const kills = page.getByRole("button", { name: "Show kills on timeline", exact: true });
  const deaths = page.getByRole("button", { name: "Show deaths on timeline", exact: true });
  const dead = page.getByRole("button", { name: "Show time dead on timeline", exact: true });
  const objectives = page.getByRole("button", { name: "Show objectives on timeline", exact: true });
  await objectives.click();
  await expect(objectives).toHaveAttribute("aria-pressed", "false");
  await expect(objectiveMarkers).toHaveCount(0);
  await kills.click();
  await expect(kills).toHaveAttribute("aria-pressed", "false");
  await expect(chips).toHaveCount(1);
  await deaths.click();
  await expect(chips).toHaveCount(0);
  await dead.click();
  await expect(deadWindows).toHaveCount(0);
  await page.getByRole("button", { name: "Event list 3", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Chronological match events", exact: true }).getByRole("listitem"),
  ).toHaveCount(3);
  await kills.focus();
  await page.keyboard.press("ArrowRight");
  await expect(deaths).toBeFocused();
  await page.keyboard.press("Space");
  await expect(deaths).toHaveAttribute("aria-pressed", "true");
  await expect(chips).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole("toolbar", { name: "Match timeline layers", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("undoing a saved-match removal preserves newer bookmarks from another tab", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(
    (key) => localStorage.setItem(key, "[3000,2998,2996]"),
    `tracker:saved-matches:${ACCOUNT_ID}`,
  );
  await page.goto(TRACKER_URL);
  const secondTab = await context.newPage();
  await secondTab.goto(TRACKER_URL.replace(`match=${CURRENT_MATCH}`, "match=2997"));
  await expect(secondTab.getByRole("button", { name: "Save match for later", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove match from saved matches", exact: true }).click();
  await secondTab.getByRole("button", { name: "Save match for later", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.locator(`[data-match-id="${CURRENT_MATCH}"]`).getByLabel("Saved match", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), `tracker:saved-matches:${ACCOUNT_ID}`),
  ).toEqual([2997, 3000, 2998, 2996]);
});

test("team totals aggregate every teammate and fit a narrow scoreboard", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    if (!requestedMatchId(route.request().postDataJSON())) return route.continue();
    const teammate = {
      ...metadata.players[0],
      account_id: 43,
      player_slot: 3,
      steam: { personaname: "Test Teammate" },
      kills: 7,
      deaths: 3,
      assists: 9,
      net_worth: 23000,
      max_player_damage: 15000,
      items: [],
      stats: metadata.players[0].stats.map(({ time_stamp_s, net_worth }) => ({
        time_stamp_s,
        net_worth,
        player_healing: 200,
      })),
    };
    await route.fulfill({ json: { data: { matches: [{ ...metadata, players: [...metadata.players, teammate] }] } } });
  });
  await page.goto(TRACKER_URL);
  const trigger = page.getByRole("button", { name: "The Hidden King team totals details", exact: true });
  await trigger.click();
  const details = page.getByRole("dialog", { name: "The Hidden King team totals details", exact: true });
  await expect(details.getByText("2 players · % of match totals", { exact: true })).toBeVisible();
  await expect(details.getByText("12 / 5 / 17", { exact: true })).toBeVisible();
  await expect(details.getByText("41,000 · 71%", { exact: true })).toBeVisible();
  await expect(details.getByText("25,000 · 71%", { exact: true })).toBeVisible();
  await expect(details.getByText("300 · 75%", { exact: true })).toBeVisible();
  expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("saved matches and undo remain scoped to their player after account navigation", async ({ page }) => {
  await page.addInitScript((accountId) => {
    localStorage.setItem(`tracker:saved-matches:${accountId}`, "[2998]");
    localStorage.setItem("tracker:saved-matches:42", "[3000]");
  }, ACCOUNT_ID);
  await page.goto(TRACKER_URL);
  await page.getByRole("button", { name: "Remove match from saved matches", exact: true }).click();
  await page.getByRole("link", { name: "Open player tracker", exact: true }).click();
  await expect(page).toHaveURL(/\/players\/42(?:\?|$)/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(
    await page.evaluate(
      (accountId) => ({
        original: JSON.parse(localStorage.getItem(`tracker:saved-matches:${accountId}`) ?? "[]"),
        current: JSON.parse(localStorage.getItem("tracker:saved-matches:42") ?? "[]"),
      }),
      ACCOUNT_ID,
    ),
  ).toEqual({ original: [2998], current: [3000] });
});

test("match navigation keeps the selected history row visible without stealing button focus", async ({ page }) => {
  await page.goto(TRACKER_URL);
  const list = page.getByRole("navigation", { name: "Match history", exact: true });
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const next = page.getByRole("button", { name: "Next match in list", exact: true });
  await next.click();
  await expect(page).toHaveURL(/match=2997/);
  await expect(next).toBeFocused();
  await expect
    .poll(() =>
      page.locator('[data-match-id="2997"]').evaluate((row) => {
        const viewport = row.closest("nav")!.getBoundingClientRect();
        const item = row.getBoundingClientRect();
        return item.top >= viewport.top && item.bottom <= viewport.bottom;
      }),
    )
    .toBe(true);
});

test("large histories open deep links and support keyboard jumps with bounded rendered rows", async ({ page }) => {
  const entries = Array.from({ length: 5000 }, (_, index) => ({
    ...history[index % history.length],
    match_id: 10000 - index,
    start_time: history[0].start_time - index * 7200,
  }));
  await page.route(`${API_ORIGIN}/v1/players/${ACCOUNT_ID}/match-history*`, (route) =>
    route.fulfill({ json: entries }),
  );
  const requested: number[] = [];
  await page.route(`${API_ORIGIN}/v1/graphql`, (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id != null) requested.push(id);
    return route.continue();
  });
  await page.goto(TRACKER_URL.replace(`match=${CURRENT_MATCH}`, "match=5001"));
  await expect(page.getByRole("region", { name: "Match 5001 details", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  const list = page.getByRole("navigation", { name: "Match history", exact: true });
  await expect.poll(() => list.locator("[data-match-id]").count()).toBeLessThan(100);
  await expect.poll(() => [...requested].sort()).toEqual([5001, 5002]);
  const oldest = list.locator('[data-match-id="5001"]');
  await oldest.focus();
  await page.keyboard.press("Home");
  await expect(page).toHaveURL(/match=10000/);
  const newest = list.locator('[data-match-id="10000"]');
  await expect(newest).toBeFocused();
  await expect(newest).toHaveAttribute("aria-current", "true");
  await expect.poll(() => requested.length).toBe(4);
  expect([...requested].sort((a, b) => a - b)).toEqual([5001, 5002, 9999, 10000]);
  await expect.poll(() => list.locator("[data-match-id]").count()).toBeLessThan(100);
  await page.keyboard.press("End");
  await expect(page).toHaveURL(/match=5001/);
  await expect(oldest).toBeFocused();
  await expect(oldest).toHaveAttribute("aria-current", "true");
  expect(requested).toHaveLength(4);
});

test("opening a scoreboard profile in another tab preserves the current timeline player", async ({ page, context }) => {
  await page.goto(TRACKER_URL);
  const trackedPlayer = page.getByRole("button", { name: "Tracker Tester", exact: true });
  await expect(trackedPlayer).toHaveAttribute("aria-pressed", "true");
  const opened = context.waitForEvent("page");
  await page.getByRole("link", { name: "Open player tracker", exact: true }).click({ modifiers: ["ControlOrMeta"] });
  const newTab = await opened;
  await expect(newTab).toHaveURL(/\/players\/42(?:\?|$)/);
  await expect(page).toHaveURL(new RegExp(`match=${CURRENT_MATCH}`));
  await expect(trackedPlayer).toHaveAttribute("aria-pressed", "true");
  await newTab.close();
});

test("selecting a player from below the chart brings keyboard focus to the timeline", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(TRACKER_URL);
  const opponent = page.getByRole("button", { name: "Test Opponent", exact: true });
  await opponent.scrollIntoViewIfNeeded();
  await opponent.focus();
  const timeline = page.getByRole("region", { name: "Match timeline", exact: true });
  expect(await timeline.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(0);
  await page.keyboard.press("Enter");
  await expect(timeline).toBeFocused();
  expect(await timeline.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Tab");
  const picker = page.getByRole("combobox", { name: "Player shown on match timeline" });
  await expect(picker).toBeFocused();
  await expect(picker).toContainText("Test Opponent");
});

test("an offline match stays usable and loads automatically after reconnecting", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const requested: number[] = [];
  await page.route(`${API_ORIGIN}/v1/graphql`, (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id != null) requested.push(id);
    return route.continue();
  });
  await page.goto(TRACKER_URL);
  await expect.poll(() => [...requested].sort()).toEqual([2997, 2998, 2999]);
  await context.setOffline(true);
  await page.locator('[data-match-id="2990"]').click();
  await expect(page).toHaveURL(/match=2990/);
  await expect(page.getByText("Waiting for connection", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Match details will load automatically when you're back online.", { exact: true }),
  ).toBeVisible();
  expect(await page.locator('[data-match-details="2990"]').evaluate((element) => element.clientHeight)).toBeLessThan(
    400,
  );
  expect(requested).not.toContain(2990);
  await page.getByRole("button", { name: "Save match for later", exact: true }).click();
  await expect(page.locator('[data-match-id="2990"]').getByLabel("Saved match", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  await expect(page.getByText("Waiting for connection", { exact: true })).toHaveCount(0);
  await expect.poll(() => [...requested].sort()).toEqual([2989, 2990, 2991, 2997, 2998, 2999]);
});

test("a paused refresh retains loaded history and resumes when the connection returns", async ({ page, context }) => {
  await page.clock.install();
  let requests = 0;
  await page.route(`${API_ORIGIN}/v1/players/${ACCOUNT_ID}/match-history*`, (route) => {
    requests += 1;
    const updated = [{ ...history[0], match_id: 3001, start_time: history[0].start_time + 7200 }, ...history];
    return route.fulfill({ json: requests === 1 ? history : updated });
  });
  await page.goto(TRACKER_URL);
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  await page.clock.fastForward(61_000);
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  await expect(refresh).toBeEnabled();
  await context.setOffline(true);
  await refresh.click();
  await expect(
    page.getByText("Showing loaded match history. Refresh resumes when you're back online.", { exact: true }),
  ).toBeVisible();
  await expect(refresh).toBeDisabled();
  const summary = page.getByRole("region", { name: "Across all loaded match history", exact: true });
  await expect(summary).toContainText("50 recorded matches");
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  expect(requests).toBe(1);
  await context.setOffline(false);
  await expect(summary).toContainText("51 recorded matches");
  await expect(page.getByText("Waiting for connection", { exact: true })).toHaveCount(0);
  expect(requests).toBe(2);
});

test("a rate-limited ability catalog falls back without hiding final builds", async ({ page }) => {
  let abilityRequests = 0;
  let restRequests = 0;
  await page.route(`${API_ORIGIN}/v1/graphql`, (route) => {
    if (requestedMatchId(route.request().postDataJSON()) != null) return route.continue();
    abilityRequests += 1;
    return route.fulfill({ status: 429, body: "Rate limited" });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/v1/assets/items/by-type/ability") restRequests += 1;
  });
  await page.goto(TRACKER_URL);
  await expect(page.getByRole("button", { name: "Final Item 11 details", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View Tracker Tester's build timeline", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Build timeline", exact: true })).toContainText("33 events");
  expect(abilityRequests).toBe(1);
  expect(restRequests).toBe(1);
});

test("client HTTP errors allow a manual retry without repeating failed requests", async ({ page }) => {
  let available = false;
  const requested: number[] = [];
  await page.route(`${API_ORIGIN}/v1/graphql`, (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id == null) return route.continue();
    requested.push(id);
    return available ? route.continue() : route.fulfill({ status: 400, body: "Bad request" });
  });
  await page.goto(TRACKER_URL);
  await expect(page.getByText("Match details are still being processed", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  expect(requested).toEqual([CURRENT_MATCH]);
  available = true;
  await page.getByRole("button", { name: "Check again", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Player shown on match timeline" })).toBeVisible();
  await expect.poll(() => [...requested].sort()).toEqual([2997, 2998, 2998, 2999]);
});

test("failed build assets can be retried while scoreboard stats remain available", async ({ page }) => {
  let available = false;
  let requests = 0;
  await page.route(`${API_ORIGIN}/v1/graphql`, (route) => {
    if (requestedMatchId(route.request().postDataJSON()) != null) return route.continue();
    requests += 1;
    return available ? route.continue() : route.fulfill({ status: 400, body: "Invalid catalog response" });
  });
  await page.goto(TRACKER_URL);
  await expect(page.getByRole("button", { name: "Tracker Tester", exact: true })).toBeVisible();
  await expect(page.getByText("Could not load build details", { exact: true })).toBeVisible();
  expect(requests).toBe(1);
  available = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Final Item 11 details", exact: true })).toBeVisible();
  await expect(page.getByText("Could not load build details", { exact: true })).toHaveCount(0);
  expect(requests).toBe(2);
});

const patronStatus = {
  tier_id: "tier",
  pledge_amount_cents: 500,
  total_slots: 2,
  is_active: true,
  last_verified_at: "2026-09-16T00:00:00Z",
  steam_accounts_summary: { active_count: 1, cooldown_count: 0, available_slots: 1 },
};
const steamAccount = (steam_id3: number, deleted_at: string | null = null) => ({
  id: String(steam_id3),
  steam_id3,
  created_at: "2026-09-16T00:00:00Z",
  deleted_at,
  is_in_cooldown: false,
});

test("the tracker landing page opens the profile of a patron's only account", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/patron/status`, (route) => route.fulfill({ json: patronStatus }));
  await page.route(`${API_ORIGIN}/v1/patron/steam-accounts`, (route) =>
    route.fulfill({
      json: {
        accounts: [steamAccount(ACCOUNT_ID), steamAccount(ACCOUNT_ID + 1, "2026-09-15T00:00:00Z")],
        summary: { total_slots: 2, used_slots: 1, available_slots: 1, slots_in_cooldown: 0 },
      },
    }),
  );
  await page.goto("/tracker");
  await expect(page).toHaveURL(new RegExp(`/tracker/players/${ACCOUNT_ID}(\\?|$)`));
  await expect(page.getByRole("heading", { level: 1, name: "Tracker Tester" })).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/tracker$/);
});

test("the tracker landing page lists accounts when a patron has more than one", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/patron/status`, (route) => route.fulfill({ json: patronStatus }));
  await page.route(`${API_ORIGIN}/v1/patron/steam-accounts`, (route) =>
    route.fulfill({
      json: {
        accounts: [steamAccount(ACCOUNT_ID), steamAccount(ACCOUNT_ID + 1)],
        summary: { total_slots: 2, used_slots: 2, available_slots: 0, slots_in_cooldown: 0 },
      },
    }),
  );
  await page.goto("/tracker");
  const accounts = page.getByRole("list", { name: "Linked tracker accounts" });
  await expect(accounts.getByRole("link", { name: "Tracker Tester" })).toBeVisible();
  await expect(accounts.getByRole("link", { name: `Player ${ACCOUNT_ID + 1}` })).toBeVisible();
  await expect(page).toHaveURL(/\/tracker$/);
});

test("a Patreon status outage offers a retry instead of treating the patron as signed out", async ({ page }) => {
  let available = false;
  await page.route(`${API_ORIGIN}/v1/patron/status`, (route) =>
    available ? route.fulfill({ status: 401, json: {} }) : route.fulfill({ status: 503, body: "down" }),
  );
  await page.goto("/tracker");
  await expect(page.getByText("Could not check your sign-in", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/tracker$/);
  available = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/tracker\/demo/);
});

test("replacing a removed account keeps the dialog open with the API's reason when it is refused", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/patron/status`, (route) => route.fulfill({ json: patronStatus }));
  await page.route(`${API_ORIGIN}/v1/patron/steam-accounts`, (route) =>
    route.fulfill({
      json: {
        accounts: [steamAccount(ACCOUNT_ID), steamAccount(ACCOUNT_ID + 1, "2026-09-01T00:00:00Z")],
        summary: { total_slots: 2, used_slots: 1, available_slots: 1, slots_in_cooldown: 0 },
      },
    }),
  );
  let replaced = false;
  await page.route(`${API_ORIGIN}/v1/patron/steam-accounts/${ACCOUNT_ID + 1}`, (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    if (replaced) return route.fulfill({ json: steamAccount(22202) });
    replaced = true;
    return route.fulfill({ status: 409, json: { message: "This Steam account is already linked" } });
  });
  await page.goto("/patron");
  await page.getByRole("button", { name: "Replace account", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("https://steamcommunity.com/profiles/76561197960287930/");
  await dialog.getByRole("button", { name: "Replace Account", exact: true }).click();
  await expect(dialog.getByText("This Steam account is already linked")).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveValue("https://steamcommunity.com/profiles/76561197960287930/");
  await dialog.getByRole("textbox").fill("[U:1:22202]");
  await dialog.getByRole("button", { name: "Replace Account", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("a refused sign-out keeps the patron signed in and says so", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/patron/status`, (route) => route.fulfill({ json: patronStatus }));
  await page.route(`${API_ORIGIN}/v1/patron/steam-accounts`, (route) =>
    route.fulfill({
      json: { accounts: [steamAccount(ACCOUNT_ID)], summary: { total_slots: 2, used_slots: 1, available_slots: 1 } },
    }),
  );
  await page.route(`${API_ORIGIN}/v1/auth/patreon/logout`, (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto("/patron");
  await page.getByRole("button", { name: /log ?out|sign out/i }).click();
  await expect(page.getByText("Could not sign out", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /log ?out|sign out/i })).toBeEnabled();
});
