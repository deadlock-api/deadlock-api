import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ellipsize,
  fitFontSize,
  initialsOf,
  SHARE_FORMAT_IDS,
  SHARE_FORMATS,
  type Rect,
  shareCardAlt,
  shareCardData,
  shareCardLayout,
  shareFilename,
  shareFunLine,
  shareText,
  statCells,
  textBoxes,
  withAlpha,
} from "./share-card";
import type { ModeRecap, YearRecap } from "./types";

const sample = (): YearRecap =>
  ({
    account_id: 7,
    year: 2026,
    start_unix: 1_767_225_600,
    end_unix: 1_798_761_600,
    matches: [
      {
        match_id: 1,
        start_time: 1_767_300_000,
        duration_s: 1800,
        game_mode: "normal",
        match_mode: "ranked",
        hero_id: 2,
        won: true,
      },
      {
        match_id: 2,
        start_time: 1_767_400_000,
        duration_s: 1800,
        game_mode: "normal",
        match_mode: "ranked",
        hero_id: 7,
        won: false,
      },
    ],
    modes: [
      {
        game_mode: "normal",
        totals: {
          matches: 2400,
          wins: 1300,
          detailed_matches: 0,
          damage_matrix_matches: 0,
          seconds_played: 4_500_000,
          kills: 12_122,
          deaths: 6000,
          assists: 12_000,
          dm_bullet: 0,
          dm_ability: 0,
          dm_melee: 0,
        },
        by_match_mode: [],
        heroes: [{ hero_id: 2, matches: 1106, wins: 632, seconds: 0, kills: 0, deaths: 0, assists: 0 }],
        records: [{ stat: "kills", value: 31, match_id: 1, start_time: 0, hero_id: 2, won: true }],
        streaks: { longest_win: { length: 12, from: 0, to: 0 }, longest_loss: { length: 2, from: 0, to: 0 } },
        damage_sources: [],
        rank: { ranked_matches: 400, first_badge: 81, last_badge: 96, peak_badge: 104, peak_at: 0, points: [] },
      },
      {
        game_mode: "street_brawl",
        totals: { matches: 443, wins: 154, seconds_played: 760_000, kills: 1674, deaths: 1000, assists: 2000 },
      },
    ],
  }) as unknown as YearRecap;

const mainOf = (recap: YearRecap): ModeRecap => {
  const [main] = recap.modes;
  if (!main) throw new Error("no mode");
  return main;
};

test("the card adds every mode into matches, hours and win rate, and reads the rest from the main mode", () => {
  const recap = sample();
  const data = shareCardData({
    recap,
    main: mainOf(recap),
    name: "DSwizzle",
    heroName: "Seven",
    peakRank: "Ascendant 4",
  });
  assert.deepEqual(
    data.figures.map((figure) => [figure.label, figure.value]),
    [
      ["Matches", "2,843"],
      ["Hours", "1,461"],
    ],
  );
  assert.deepEqual(
    data.stats.map((stat) => [stat.key, stat.value]),
    [
      ["win-rate", "51.1%"],
      ["kda", "4.02"],
      ["kills", "12,122"],
      ["rank", "Ascendant 4"],
    ],
  );
  assert.deepEqual(data.hero, { name: "Seven", detail: "1,106 matches, 57% won" });
  assert.equal(data.initials, "DS");
});

test("without ranked matches the last tile counts the heroes played", () => {
  const recap = sample();
  const data = shareCardData({ recap, main: mainOf(recap), name: "x", heroName: null, peakRank: null });
  assert.deepEqual(data.stats.at(-1), { key: "heroes", label: "Heroes played", value: "2" });
  assert.equal(data.hero, null);
  assert.match(shareCardAlt(data), /2 heroes played/);
  assert.doesNotMatch(shareText(data), /peak rank/);
});

test("a player Steam does not know is named by account id", () => {
  const recap = sample();
  assert.equal(shareCardData({ recap, main: mainOf(recap), name: "  " }).name, "Player 7");
});

test("the fun line: play style first, then the best streak, then the best game", () => {
  const main = mainOf(sample());
  assert.deepEqual(shareFunLine(main), { label: "Best streak", value: "12 wins in a row" });
  main.streaks.longest_win.length = 2;
  assert.deepEqual(shareFunLine(main), { label: "Best game", value: "31 kills in one match" });
  main.totals.damage_matrix_matches = 50;
  main.totals.dm_bullet = 70;
  main.totals.dm_ability = 25;
  main.totals.dm_melee = 5;
  assert.deepEqual(shareFunLine(main), { label: "Gunslinger", value: "70% of hero damage from bullets" });
  assert.deepEqual(shareFunLine(main, "Haze's weapon"), { label: "Gunslinger", value: "Signature: Haze's weapon" });
  main.records = [];
  main.totals.damage_matrix_matches = 0;
  assert.equal(shareFunLine(main), null);
});

test("the post text and the alt text carry the numbers", () => {
  const recap = sample();
  const data = shareCardData({
    recap,
    main: mainOf(recap),
    name: "DSwizzle",
    heroName: "Seven",
    peakRank: "Ascendant 4",
  });
  assert.equal(
    shareText(data),
    [
      "My 2026 in Deadlock: 2,843 matches, 1,461 hours, 51.1% won.",
      "Main: Seven. KDA 4.02, 12,122 kills, peak rank Ascendant 4.",
      "#YearInDeadlock https://deadlock-api.com/year-in-deadlock",
    ].join("\n"),
  );
  assert.equal(
    shareCardAlt(data),
    "Share image of DSwizzle's 2026 in Deadlock: 2,843 matches, 1,461 hours, 51.1% won, main hero Seven, KDA 4.02, 12,122 kills, peak rank Ascendant 4. Best streak: 12 wins in a row.",
  );
  assert.equal(shareFilename(2026, "wide"), "year-in-deadlock-2026-wide.png");
});

const inside = (box: Rect, width: number, height: number) =>
  box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const format of SHARE_FORMAT_IDS) {
  test(`the ${format} layout keeps its text on the card and apart`, () => {
    const layout = shareCardLayout(format);
    const { width, height } = SHARE_FORMATS[format];
    assert.deepEqual([layout.width, layout.height], [width, height]);
    const boxes = Object.entries(textBoxes(layout));
    for (const [name, box] of boxes) assert.ok(inside(box, width, height), `${name} is off the card`);
    for (const [i, [a, boxA]] of boxes.entries()) {
      for (const [b, boxB] of boxes.slice(i + 1)) assert.ok(!overlap(boxA, boxB), `${a} overlaps ${b}`);
    }
    // Each row of tiles fills the stats box exactly, and no tile reaches into the next.
    const keys = [{ key: "win-rate" }, { key: "kda" }, { key: "kills" }, { key: "rank" }] as const;
    const cells = statCells(layout.stats, keys, layout.statRows, layout.gap);
    assert.equal(cells.length, 4);
    for (const cell of cells) assert.ok(inside(cell, width, height));
    for (const [i, a] of cells.entries()) for (const b of cells.slice(i + 1)) assert.ok(!overlap(a, b));
    const last = cells.at(-1);
    assert.ok(last && Math.abs(last.x + last.w - (layout.stats.x + layout.stats.w)) < 0.01);
  });
}

test("the rank tile is wider than its neighbours in a shared row, and full width alone", () => {
  const box = { x: 0, y: 0, w: 1000, h: 100 };
  const keys = [{ key: "win-rate" }, { key: "kda" }, { key: "kills" }, { key: "rank" }] as const;
  const [first, , , rank] = statCells(box, keys, [4], 10);
  assert.ok(first && rank && rank.w > first.w * 1.5);
  const alone = statCells(box, keys, [3, 1], 10).at(-1);
  assert.deepEqual(alone, { x: 0, y: 55, w: 1000, h: 45 });
});

test("fitFontSize keeps a size that fits and shrinks one that does not, down to the floor", () => {
  const measure = (size: number) => size * 10;
  assert.equal(fitFontSize(measure, 1000, 80, 40), 80);
  assert.equal(fitFontSize(measure, 500, 80, 40), 50);
  assert.equal(fitFontSize(measure, 100, 80, 40), 40);
});

test("ellipsize cuts long text to fit", () => {
  const measure = (text: string) => text.length;
  assert.equal(ellipsize(measure, "short", 10), "short");
  assert.equal(ellipsize(measure, "a long player name", 8), "a long…");
});

test("initials and alpha colors", () => {
  assert.equal(initialsOf("big tuna"), "BT");
  assert.equal(initialsOf("rd6m"), "RD");
  assert.equal(withAlpha("#fa4454", 0.5), "rgb(250 68 84 / 0.5)");
  assert.equal(withAlpha("#fff", 1), "rgb(255 255 255 / 1)");
  assert.equal(withAlpha("red", 0.5), "red");
});
