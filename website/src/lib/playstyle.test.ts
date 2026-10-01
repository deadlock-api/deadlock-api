import assert from "node:assert/strict";
import { test } from "node:test";

import type { HashMapValue } from "deadlock_api_client";

import { playstyleAxesFor, type PlaystylePercentiles, playstyleLabel, playstylePercentiles } from "./playstyle";

const flat = (value: number): PlaystylePercentiles => ({
  fighting: value,
  kills: value,
  accuracy: value,
  farming: value,
  objectives: value,
  survival: value,
  healing: value,
  teamplay: value,
});

test("playstyleLabel: too few axes says nothing", () => {
  assert.equal(playstyleLabel({}), null);
  assert.equal(playstyleLabel({ farming: 99, kills: 20, deaths: 10 } as PlaystylePercentiles), null);
});

test("playstyleLabel: an even spread is an all-rounder, high or low", () => {
  assert.deepEqual(playstyleLabel(flat(80)), { id: "all-rounder", label: "All-rounder", strengths: [] });
  assert.equal(playstyleLabel(flat(30))?.id, "all-rounder");
});

test("playstyleLabel: a standout below the strength floor is not a style", () => {
  // Farming is well above the player's own average but still below most players.
  assert.equal(playstyleLabel({ ...flat(20), farming: 55 })?.id, "all-rounder");
});

test("playstyleLabel: the strongest axis names the style", () => {
  assert.deepEqual(playstyleLabel({ ...flat(50), farming: 90, objectives: 70 }), {
    id: "farmer",
    label: "Farmer",
    strengths: ["farming", "objectives"],
  });
  assert.equal(playstyleLabel({ ...flat(50), objectives: 85 })?.label, "Objective focused");
  assert.equal(playstyleLabel({ ...flat(50), survival: 85 })?.label, "Survivor");
  assert.equal(playstyleLabel({ ...flat(50), accuracy: 85 })?.label, "Sharpshooter");
});

test("playstyleLabel: damage and kills together make a brawler", () => {
  assert.deepEqual(playstyleLabel({ ...flat(45), kills: 88, fighting: 85 }), {
    id: "brawler",
    label: "Brawler",
    strengths: ["kills", "fighting"],
  });
  // Kills far ahead of damage is a slayer.
  assert.equal(playstyleLabel({ ...flat(45), kills: 95, fighting: 70 })?.id, "slayer");
});

test("playstyleLabel: healing and assists together make a support", () => {
  assert.equal(playstyleLabel({ ...flat(40), teamplay: 80, healing: 78 })?.id, "support");
  assert.equal(playstyleLabel({ ...flat(40), teamplay: 90 })?.id, "team-player");
});

test("playstyleLabel: ignores non-finite values", () => {
  assert.equal(playstyleLabel({ ...flat(50), farming: Number.NaN, kills: 90 })?.id, "slayer");
});

function summary(p50: number, spread: number): HashMapValue {
  const at = (p: number) => p50 + ((p - 50) / 50) * spread;
  return {
    avg: p50,
    std: spread,
    percentile1: at(1),
    percentile5: at(5),
    percentile10: at(10),
    percentile25: at(25),
    percentile50: at(50),
    percentile75: at(75),
    percentile90: at(90),
    percentile95: at(95),
    percentile99: at(99),
  };
}

test("playstylePercentiles: turns deaths around so fewer ranks higher", () => {
  const population = { kills: summary(6, 5), deaths: summary(6, 5) };
  const own = { kills: { ...summary(0, 0), avg: 8.5 }, deaths: { ...summary(0, 0), avg: 3.5 } };
  const result = playstylePercentiles(population, own);
  assert.equal(result.kills, 75);
  assert.equal(result.survival, 75);
  assert.equal(result.farming, undefined);
});

test("playstylePercentiles: nothing without data", () => {
  assert.deepEqual(playstylePercentiles(undefined, {}), {});
  assert.deepEqual(playstylePercentiles({ kills: summary(6, 5) }, undefined), {});
});

test("playstylePercentiles: Street Brawl has no farming axis", () => {
  const population = { kills: summary(6, 5), net_worth_per_min: summary(1000, 200) };
  const own = { kills: { ...summary(0, 0), avg: 8.5 }, net_worth_per_min: { ...summary(0, 0), avg: 1100 } };
  assert.equal(playstylePercentiles(population, own).farming, 75);
  const brawl = playstylePercentiles(population, own, "street_brawl");
  assert.equal(brawl.farming, undefined);
  assert.equal(brawl.kills, 75);
  assert.ok(!playstyleAxesFor("street_brawl").some(({ axis }) => axis === "farming"));
  assert.equal(playstyleAxesFor("normal").length, 8);
});
