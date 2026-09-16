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

test("an unavailable match waits for a successful retry before preloading neighbors", async ({ page }) => {
  const requested: number[] = [];
  let available = false;
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id == null) return route.continue();
    requested.push(id);
    await route.fulfill({ json: { data: { matches: available ? [metadata] : [] } } });
  });
  await page.route(`${API_ORIGIN}/v1/matches/*/metadata`, (route) => route.fulfill({ json: {} }));
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
  await page.getByRole("button", { name: "Saved matches (1)", exact: true }).click();
  await page.getByRole("button", { name: `Remove saved match ${CURRENT_MATCH}`, exact: true }).click();
  await expect(page.getByText("No saved matches yet", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(historyRow.getByLabel("Saved match", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save match for later", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("saved search includes matches beyond the first page and preserves removal focus", async ({ page }) => {
  await page.addInitScript(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
    key: `tracker:saved-matches:${ACCOUNT_ID}`,
    ids: history.map((entry) => entry.match_id),
  });
  await page.goto(TRACKER_URL);
  await page.getByRole("button", { name: "Saved matches (50)", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search saved matches by hero or match ID" });
  await search.fill("  DyNaMo  ");
  await expect(page.locator("[data-saved-row]")).toHaveCount(20);
  await page.getByRole("button", { name: "Show 5 more", exact: true }).click();
  await expect(page.locator("[data-saved-row]")).toHaveCount(25);
  await expect(page.getByRole("button", { name: "Open saved match 2960", exact: true })).toBeFocused();
  await search.fill("2952");
  await expect(page.locator("[data-saved-row]")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove saved match 2952", exact: true }).click();
  await expect(page.getByText("No matches found", { exact: true })).toBeVisible();
  await expect(search).toBeFocused();
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
  await expect(page.getByRole("button", { name: "Saved matches (0)", exact: true })).toBeVisible();
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
  await page.goto(`/players/${ACCOUNT_ID}?date_range=_&tab=mates`);
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
});

test("shared-match history opens older matches and returns focus to their details", async ({ page }) => {
  await page.route(`${API_ORIGIN}/v1/players/*/mate-stats**`, (route) =>
    route.fulfill({ json: [{ mate_id: 1000, matches: history.map((match) => match.match_id) }] }),
  );
  await page.goto(`/players/${ACCOUNT_ID}?date_range=_`);
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
  await page.goto(TRACKER_URL);
  const chart = page.locator('svg[aria-label="Team soul lead and match events over time"]');
  const chips = chart.locator("foreignObject img");
  const deadWindows = chart.locator(".recharts-reference-area");
  await expect(chips).toHaveCount(2);
  await expect(deadWindows).toHaveCount(1);
  const kills = page.getByRole("button", { name: "Show kills on timeline", exact: true });
  const deaths = page.getByRole("button", { name: "Show deaths on timeline", exact: true });
  const dead = page.getByRole("button", { name: "Show time dead on timeline", exact: true });
  await kills.click();
  await expect(kills).toHaveAttribute("aria-pressed", "false");
  await expect(chips).toHaveCount(1);
  await deaths.click();
  await expect(chips).toHaveCount(0);
  await dead.click();
  await expect(deadWindows).toHaveCount(0);
  await page.getByRole("button", { name: "Event list 2", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Chronological match events", exact: true }).getByRole("listitem"),
  ).toHaveCount(2);
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
  await page.getByRole("button", { name: "Saved matches (3)", exact: true }).click();
  await page.getByRole("button", { name: `Remove saved match ${CURRENT_MATCH}`, exact: true }).click();
  await secondTab.getByRole("button", { name: "Save match for later", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved matches (4)", exact: true })).toBeVisible();
  await expect(
    page.locator(`[data-match-id="${CURRENT_MATCH}"]`).getByLabel("Saved match", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), `tracker:saved-matches:${ACCOUNT_ID}`),
  ).toEqual([2997, 3000, 2998, 2996]);
  await expect(secondTab.getByRole("button", { name: "Saved matches (4)", exact: true })).toBeVisible();
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
