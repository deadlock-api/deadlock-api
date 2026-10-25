import assert from "node:assert/strict";
import { test } from "node:test";

import { currentName, heroPoolOn, itemPoolOn } from "./roster";
import { getModeSeed, seededPick, seededRandom } from "./seed";

// The full hero list of build 6819, plus a hero the roster does not know yet, in an order the asset list never had.
const HEROES = [
  [88, "Baba"],
  [1, "Infernus"],
  [2, "Seven"],
  [3, "Vindicta"],
  [4, "Lady Geist"],
  [6, "Abrams"],
  [7, "Wraith"],
  [8, "McGinnis"],
  [10, "Paradox"],
  [11, "Dynamo"],
  [12, "Kelvin"],
  [13, "Haze"],
  [14, "Holliday"],
  [15, "Bebop"],
  [16, "Calico"],
  [17, "Grey Talon"],
  [18, "Mo & Krill"],
  [19, "Shiv"],
  [20, "Ivy"],
  [25, "Warden"],
  [27, "Yamato"],
  [31, "Lash"],
  [35, "Viscous"],
  [50, "Pocket"],
  [52, "Mirage"],
  [58, "Vyper"],
  [60, "Sinclair"],
  [63, "Mina"],
  [64, "Drifter"],
  [65, "Venator"],
  [66, "Victor"],
  [67, "Paige"],
  [69, "The Doorman"],
  [72, "Billy"],
  [76, "Graves"],
  [77, "Apollo"],
  [78, "Deadman Danny"],
  [79, "Rem"],
  [80, "Silver"],
  [81, "Celeste"],
  [84, "Rat King"],
  [85, "Solomon"],
  [86, "Violet"],
  [87, "Nurse Harrow"],
  [99, "Unreleased"],
].map(([id, name]) => ({ id: id as number, name: name as string }));

function heroAnswer(date: string): string {
  return seededPick(heroPoolOn(HEROES, date), seededRandom(getModeSeed(date, "guess-hero"))).name;
}

test("past Guess the Hero days keep the answer they were played with", () => {
  // Each day as the live asset list had it then: 37 heroes until Rem and Rat King joined, 42 on 2026-10-16.
  assert.equal(heroAnswer("2026-03-22"), "Vyper");
  assert.equal(heroAnswer("2026-10-01"), "Drifter");
  assert.equal(heroAnswer("2026-10-10"), "Wraith");
  assert.equal(heroAnswer("2026-10-14"), "Solomon");
  // Release days keep the answer of the hours before the release build.
  assert.equal(heroAnswer("2026-10-16"), "Lady Geist");
  assert.equal(heroAnswer("2026-10-20"), "Mina");
});

test("a hero is in the pool from the day after its release build", () => {
  const ids = (date: string) => heroPoolOn(HEROES, date).map((hero) => hero.id);
  assert.equal(ids("2026-10-02").length, 37);
  assert.ok(!ids("2026-10-16").includes(86));
  assert.ok(ids("2026-10-17").includes(86));
  assert.equal(ids("2026-10-25").length, 44);
});

test("the pool keeps the roster's order and leaves out heroes it does not list", () => {
  const ids = heroPoolOn(HEROES, "2026-10-25").map((hero) => hero.id);
  assert.deepEqual(
    ids,
    HEROES.map((hero) => hero.id)
      .filter((id) => id !== 99)
      .toSorted((a, b) => a - b),
  );
});

test("an item is in the pool from the day after the build that added it", () => {
  const items = [
    { id: 1672893796, name: "Grit" },
    { id: 951866250, name: "Indomitable" },
    { id: 1548066885, name: "Extended Magazine" },
  ];
  const names = (date: string) => itemPoolOn(items, date).map((item) => item.name);
  assert.deepEqual(names("2026-04-30"), ["Extended Magazine"]);
  assert.deepEqual(names("2026-05-01"), ["Extended Magazine", "Indomitable"]);
  assert.deepEqual(names("2026-05-23"), ["Extended Magazine", "Grit", "Indomitable"]);
});

test("a guess saved under an item's old name reads as its current name", () => {
  assert.equal(currentName("Spirit Shredder Bullets"), "Spirit Shredder");
  assert.equal(currentName("Wraith"), "Wraith");
});
