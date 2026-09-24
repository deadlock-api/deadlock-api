import assert from "node:assert/strict";
import { test } from "node:test";

import { ANALYTICS_TABS, ANALYTICS_VIEWS, analyticsView } from "./analytics-tabs";
import { pageTitle } from "./seo";

const views = Object.values(ANALYTICS_VIEWS).flatMap((section) => Object.values(section));

test("every analytics view has copy of its own", () => {
  for (const [section, tabs] of Object.entries(ANALYTICS_TABS)) {
    assert.deepEqual(Object.keys(ANALYTICS_VIEWS[section as keyof typeof ANALYTICS_TABS]), Object.keys(tabs));
  }
  for (const key of ["title", "heading", "description"] as const) {
    const values = views.map((view) => view[key]);
    assert.equal(new Set(values).size, values.length, `duplicate ${key}`);
  }
});

test("analytics titles and descriptions fit a search result", () => {
  for (const view of views) {
    // Short enough that the site suffix fits after it.
    assert.ok(pageTitle(view.title).endsWith(" | Deadlock API"), view.title);
    // Room for the data-driven sentence the heroes and items views append.
    assert.ok(view.description.length <= 115, view.description);
  }
});

test("a view path resolves to its copy, an unknown one to the section's first view", () => {
  assert.equal(analyticsView("heroes", "/analytics/heroes/matchups/"), ANALYTICS_VIEWS.heroes.matchups);
  assert.equal(analyticsView("items", "/analytics/items"), ANALYTICS_VIEWS.items["item-stats"]);
  assert.equal(analyticsView("games", "/analytics/games/nope"), ANALYTICS_VIEWS.games.overview);
});

test("page titles carry the site suffix only when it fits", () => {
  assert.equal(pageTitle("Deadlock Hero Matchups"), "Deadlock Hero Matchups | Deadlock API");
  const long = "Four months of Valve balancing Deadlock, told in 2.9 million matches";
  assert.equal(pageTitle(long), long);
});
