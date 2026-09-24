import assert from "node:assert/strict";
import { test } from "node:test";

import type { WidgetConfig } from "~/components/features/streamkit/widget-builder/widget-config";
import { widgetSearchParams } from "~/components/features/streamkit/widget-builder/widget-url";

import { splitWidgetList } from "./streamkit-list";
import { readWidgetFlag, readWidgetInt, readWidgetSearch } from "./streamkit-widget-search";

const base: WidgetConfig = {
  widgetType: "raw",
  theme: "dark",
  variables: [],
  variable: "wins_losses_today",
  prefix: "",
  suffix: "",
  fontColor: "#ffffff",
  labels: [],
  subtexts: [],
  extraArgs: {},
  showHeader: true,
  showBranding: true,
  showOutline: true,
  showMatchHistory: true,
  matchHistoryShowsToday: false,
  numMatches: 10,
  opacity: 100,
  previewBackgroundImage: true,
  previewBackgroundColor: "#f3f4f6",
};

function roundTrip(config: WidgetConfig): Record<string, string> {
  const params = widgetSearchParams(config);
  assert.ok(params);
  return readWidgetSearch(`?${params.toString()}`);
}

test("a raw widget's prefix and suffix come back exactly as typed", () => {
  for (const [prefix, suffix] of [
    ["1.50 ", " null"],
    ['"KD" ', " true"],
    ["Score: ", "  "],
    ["[1,2]", "{}"],
    ["100%", "&x=1"],
  ]) {
    const search = roundTrip({ ...base, prefix, suffix, extraArgs: { hero_name: "123" } });
    assert.equal(search.prefix, prefix);
    assert.equal(search.suffix, suffix);
    assert.equal(search.hero_name, "123");
  }
});

test("a box widget's labels and second lines come back exactly as typed", () => {
  const search = roundTrip({
    ...base,
    widgetType: "box",
    variables: ["total_kd", "", "wins_today"],
    labels: ['"KD" ', "dropped", "1.50"],
    subtexts: ["null", "", " {rank_progress}"],
  });
  assert.deepEqual(splitWidgetList(search.vars), ["total_kd", "wins_today"]);
  assert.deepEqual(splitWidgetList(search.labels), ['"KD" ', "1.50"]);
  assert.deepEqual(splitWidgetList(search.subtexts), ["null", " {rank_progress}"]);
  assert.equal(readWidgetInt(search.numMatches, 1, 1, 20), 10);
  assert.equal(readWidgetFlag(search.matchHistoryShowsToday, true), false);
});

test("a box widget with every stat removed says so instead of leaving vars out", () => {
  const search = roundTrip({ ...base, widgetType: "box", variables: [""], labels: ["Rank"] });
  assert.equal(search.vars, "");
  assert.equal(search.labels, undefined);
});

test("flags and numbers fall back when missing or malformed", () => {
  assert.equal(readWidgetFlag(undefined, true), true);
  assert.equal(readWidgetFlag("false", true), false);
  assert.equal(readWidgetFlag("true", false), true);
  assert.equal(readWidgetInt(undefined, 10, 1, 20), 10);
  assert.equal(readWidgetInt("abc", 10, 1, 20), 10);
  assert.equal(readWidgetInt("50", 10, 1, 20), 20);
});

test("the first of a repeated key wins", () => {
  assert.deepEqual(readWidgetSearch("?prefix=a&prefix=b"), { prefix: "a" });
});
