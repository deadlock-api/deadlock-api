import assert from "node:assert/strict";
import { test } from "node:test";

import type { CorruptedPenalty, GenericData, ItemProperty } from "deadlock_api_client";

import {
  corruptedStats,
  humanizeName,
  parseNumber,
  penaltiesForTier,
  penaltyLabel,
  toCorruptionData,
} from "./corrupted-items";

// Ricochet as the API sends it at build 6712.
const RICOCHET: Record<string, ItemProperty> = {
  BonusFireRate: { value: "18", prefix: "{s:sign}", label: "Fire Rate", postfix: "%" },
  RicochetRadius: { value: "13m", label: "Ricochet Range", postfix: "m" },
  RicochetDamagePercent: { value: "65", label: "Ricochet Damage", postfix: "%" },
  RicochetTargets: { value: "2", label: "Ricochet Targets" },
};

const PENALTIES: CorruptedPenalty[] = [
  {
    name: "TechCooldown",
    roll_weight: 1,
    effects: [
      {
        modifier_value: "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE",
        bonus_per_tier: [0, 0, 0, -13, -17, 0],
        label: "Ability Cooldown Reduction",
        postfix: "%",
        display: true,
      },
    ],
  },
  {
    name: "TechRange",
    roll_weight: 1,
    effects: [
      {
        modifier_value: "MODIFIER_VALUE_TECH_RANGE_PERCENT",
        bonus_per_tier: [0, 0, 0, -20, -25, 0],
        label: "Ability Range",
        postfix: "%",
        display: true,
      },
      {
        modifier_value: "MODIFIER_VALUE_TECH_RADIUS_PERCENT",
        bonus_per_tier: [0, 0, 0, -20, -25, 0],
        label: "Radius",
        postfix: "%",
        display: false,
      },
    ],
  },
  {
    name: "Health",
    roll_weight: 1,
    effects: [
      {
        modifier_value: "MODIFIER_VALUE_HEALTH_MAX",
        bonus_per_tier: [0, 0, 0, -350, -550, 0],
        label: "Max Health",
        display: true,
      },
    ],
  },
];

test("numbers parse from values with units", () => {
  assert.equal(parseNumber("13m"), 13);
  assert.equal(parseNumber("-40"), -40);
  assert.equal(parseNumber("0.27m"), 0.27);
  assert.equal(parseNumber(30), 30);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber(undefined), null);
});

test("corrupted stats add the bonus to the normal value, in its unit and sign", () => {
  const rows = corruptedStats(RICOCHET, [
    { name: "BonusFireRate", bonus: "22" },
    { name: "RicochetRadius", bonus: "5m" },
    { name: "RicochetDamagePercent", bonus: "15" },
    { name: "RicochetTargets", bonus: "1", fixed_corrupted_bonus: true },
  ]);
  assert.deepEqual(
    rows.map(({ label, normal, corrupted }) => [label, normal, corrupted]),
    [
      ["Fire Rate", "+18%", "+40%"],
      ["Ricochet Range", "13m", "18m"],
      ["Ricochet Damage", "65%", "80%"],
      ["Ricochet Targets", "2", "3"],
    ],
  );
});

test("corrupted stats keep a fixed prefix and negative values, round where the game rounds", () => {
  const rows = corruptedStats(
    {
      SlowPercent: { value: "24", prefix: "-", label: "Move Speed", postfix: "%" },
      HealAmp: { value: "-40", prefix: "", label: "Incoming Healing", postfix: "%" },
      Radius: { value: "1m", label: "Radius", postfix: "m" },
      MaxStacks: { value: "10.0", label: "Max Stacks" },
      LifeThreshold: { value: "65", postfix: "%" },
    },
    [
      { name: "SlowPercent", bonus: "12" },
      { name: "HealAmp", bonus: "-15" },
      { name: "Radius", bonus: "0.27m" },
      { name: "MaxStacks", bonus: "2.6", round_corrupted_bonus: true },
      { name: "LifeThreshold", bonus: "-15" },
    ],
  );
  assert.deepEqual(
    rows.map(({ label, normal, corrupted }) => [label, normal, corrupted]),
    [
      ["Move Speed", "-24%", "-36%"],
      ["Incoming Healing", "-40%", "-55%"],
      ["Radius", "1m", "1.27m"],
      ["Max Stacks", "10", "13"],
      ["Life Threshold", "65%", "50%"],
    ],
  );
});

test("a bonus without a normal value shows on its own, a zero bonus not at all", () => {
  const rows = corruptedStats({}, [
    { name: "BonusAbilityCharges", bonus: "1" },
    { name: "Nothing", bonus: "0" },
  ]);
  assert.deepEqual(rows, [
    { name: "BonusAbilityCharges", label: "Bonus Ability Charges", normal: null, corrupted: "+1" },
  ]);
});

test("penalties take the item tier's value, drop hidden effects and list excluded ones last", () => {
  const rows = penaltiesForTier(PENALTIES, 3, ["TechRange"]);
  assert.deepEqual(rows, [
    { name: "TechCooldown", effects: [{ label: "Ability Cooldown Reduction", value: "−13%" }], excluded: false },
    { name: "Health", effects: [{ label: "Max Health", value: "−350" }], excluded: false },
    { name: "TechRange", effects: [{ label: "Ability Range", value: "−20%" }], excluded: true },
  ]);
  assert.equal(penaltiesForTier(PENALTIES, 4)[0].effects[0].value, "−17%");
  // No values below tier 3: nothing to show.
  assert.deepEqual(penaltiesForTier(PENALTIES, 1), []);
});

test("penalty names resolve to their label", () => {
  assert.equal(penaltyLabel(PENALTIES, "TechRange"), "Ability Range");
  assert.equal(penaltyLabel(PENALTIES, "BulletResist"), "Bullet Resist");
  assert.equal(humanizeName("HealAmpReceivePenaltyPercent"), "Heal Amp Receive Penalty Percent");
});

test("the generic data slice falls back to round 5 and empty lists", () => {
  const empty = toCorruptionData({} as GenericData);
  assert.deepEqual(empty, { penalties: [], images: null, pricePerTier: [], streetBrawlRound: 5 });
  const withRound = toCorruptionData({ street_brawl: { corrupt_item_round: 6 } } as unknown as GenericData);
  assert.equal(withRound.streetBrawlRound, 6);
});
