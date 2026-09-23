import assert from "node:assert/strict";
import { test } from "node:test";

import { formatBlogDate } from "./blog-date";
import { isValidPuzzleDate } from "./deadlockdle/seed";
import { formatSignedPercent } from "./format";
import { parsePreferencesCookie } from "./preferences";
import { serializeJsonLd } from "./seo";
import { headersFor, parseHeadersFile } from "./static-headers";
import { parseSteamIdInput } from "./steam";
import { joinWidgetList, splitWidgetList, withoutEmptyVariables } from "./streamkit-list";
import { compactNumber } from "./team-builder/format";

test("inline JSON-LD cannot close its script tag", () => {
  const json = serializeJsonLd({ name: "</script><script>alert(1)//" });
  assert.ok(!json.includes("</script>"));
  assert.deepEqual(JSON.parse(json), { name: "</script><script>alert(1)//" });
});

test("the preferences cookie keeps known values and unknown fields, and rejects anything else", () => {
  const cookie = (value: string) => `a=1; preferences=${encodeURIComponent(value)}`;
  assert.deepEqual(parsePreferencesCookie(cookie('{"dateFilter":"patch","other":3}')), {
    other: 3,
    dateFilter: "patch",
  });
  assert.deepEqual(parsePreferencesCookie(cookie('{"dateFilter":"bogus","x":[1]}')), { x: [1] });
  assert.deepEqual(parsePreferencesCookie(cookie("[1,2]")), {});
  assert.deepEqual(parsePreferencesCookie(cookie("{broken")), {});
  assert.deepEqual(parsePreferencesCookie(""), {});
});

test("the Worker applies _headers rules in order, later rules replacing earlier ones", () => {
  const rules = parseHeadersFile(
    "/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n\n/streamkit/widgets/*\n  X-Frame-Options: ALLOWALL\n\n/*.woff2\n  Cache-Control: immutable\n",
  );
  assert.deepEqual(Object.fromEntries(headersFor(rules, "/analytics/heroes")), {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
  });
  assert.equal(headersFor(rules, "/streamkit/widgets/eu/1/box").get("x-frame-options"), "ALLOWALL");
  assert.equal(headersFor(rules, "/fonts/inter.woff2").get("cache-control"), "immutable");
  assert.equal(headersFor(rules, "/analytics/heroes").get("cache-control"), undefined);
});

test("signed percentages use the minus sign Delta uses and never print -0.0", () => {
  assert.equal(formatSignedPercent(0.123), "+12.3%");
  assert.equal(formatSignedPercent(-0.123), "−12.3%");
  assert.equal(formatSignedPercent(-0.0004), "0.0%");
});

test("compact numbers round and switch units", () => {
  assert.deepEqual([999, 1000, 1234, 9999, 1_000_000, 2_500_000].map(compactNumber), [
    "999",
    "1k",
    "1.2k",
    "10k",
    "1M",
    "2.5M",
  ]);
});

test("puzzle dates must be real calendar days", () => {
  assert.equal(isValidPuzzleDate("2026-04-30"), true);
  assert.equal(isValidPuzzleDate("2026-04-31"), false);
  assert.equal(isValidPuzzleDate("2026-02-30"), false);
  assert.equal(isValidPuzzleDate("abc"), false);
});

test("blog dates are calendar days, the same in every timezone", () => {
  assert.equal(formatBlogDate("2026-03-22"), "March 22, 2026");
  assert.equal(formatBlogDate("2026-01-01"), "January 1, 2026");
});

test("the add-account form reads every common Steam ID form", () => {
  for (const input of [
    "76561197960287930",
    "22202",
    "[U:1:22202]",
    "STEAM_0:0:11101",
    "https://steamcommunity.com/profiles/76561197960287930/",
  ]) {
    assert.deepEqual(parseSteamIdInput(input), { steamId3: 22202 }, input);
  }
  for (const input of ["0", "abc", "99999999999", "https://steamcommunity.com/id/gabelogannewell"]) {
    assert.ok("error" in parseSteamIdInput(input), input);
  }
});

test("widget lists keep commas inside an entry and read URLs from before the escaping", () => {
  const labels = ["Place, EU", "W-L", "a\\b", ""];
  assert.deepEqual(splitWidgetList(joinWidgetList(labels)), labels);
  assert.deepEqual(splitWidgetList("Rank,Daily W-L,K/D"), ["Rank", "Daily W-L", "K/D"]);
  assert.deepEqual(
    withoutEmptyVariables({ variables: ["wins", "", "kd"], labels: ["W", "?", "KD"], subtexts: ["a"] }),
    { variables: ["wins", "kd"], labels: ["W", "KD"], subtexts: ["a"] },
  );
});
