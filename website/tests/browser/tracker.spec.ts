import { expect, test } from "@playwright/test";

import { ACCOUNT_ID, API_ORIGIN, CURRENT_MATCH, history, requestedMatchId, TRACKER_URL } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tracker-feedback-notice-dismissed", "true"));
  // Keep analytics, avatars and other optional integrations outside the regression suite.
  await page.route("**/*", (route) => {
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

test("an unavailable current match does not preload its neighbors", async ({ page }) => {
  const requested: number[] = [];
  await page.route(`${API_ORIGIN}/v1/graphql`, async (route) => {
    const id = requestedMatchId(route.request().postDataJSON());
    if (id == null) return route.continue();
    requested.push(id);
    await route.fulfill({ json: { data: { matches: [] } } });
  });
  await page.route(`${API_ORIGIN}/v1/matches/*/metadata`, (route) => route.fulfill({ json: {} }));
  await page.goto(TRACKER_URL);
  await expect(page.getByText("Match details unavailable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show oldest matches first", exact: true }).click();
  await expect(page).toHaveURL(/dir=asc/);
  expect(requested).toEqual([CURRENT_MATCH]);
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
