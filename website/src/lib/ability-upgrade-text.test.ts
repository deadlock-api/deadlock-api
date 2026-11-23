import assert from "node:assert/strict";
import { test } from "node:test";

import type { Ability } from "deadlock_api_client";

import { formatBonus, parseUpgradeHtml, upgradeLines } from "./ability-upgrade-text";

test("parseUpgradeHtml splits lines on <br> and keeps highlighted runs", () => {
  assert.deepEqual(
    parseUpgradeHtml(
      '<span class="highlight">+1.5s</span> Duration<br><span class="highlight">-32%</span> Move Speed &amp; Fire Rate',
    ),
    [
      [
        { text: "+1.5s", highlight: true },
        { text: " Duration", highlight: false },
      ],
      [
        { text: "-32%", highlight: true },
        { text: " Move Speed & Fire Rate", highlight: false },
      ],
    ],
  );
});

test("parseUpgradeHtml drops inline svg icons and empty lines", () => {
  assert.deepEqual(parseUpgradeHtml('Deal <svg width="1"><path d="M0"/></svg>damage<br> <br>'), [
    [{ text: "Deal damage", highlight: false }],
  ]);
});

test("formatBonus signs positive values and keeps one unit", () => {
  assert.equal(formatBonus(-10, { postfix: "s" }), "-10s");
  assert.equal(formatBonus("4m", { postfix: "m" }), "+4m");
  assert.equal(formatBonus("3m", { prefix: "{s:sign}", postfix: " m" }), "+3m");
  assert.equal(formatBonus("200", { prefix: "{s:sign}" }), "+200");
  assert.equal(formatBonus("40", { prefix: "-", postfix: "%" }), "-40%");
  assert.equal(formatBonus("13.33333", {}), "+13.33");
});

test("upgradeLines prefers the game's text and falls back to the changed properties", () => {
  const ability = {
    description: { t3_desc: '<span class="highlight">+4m</span> Radius' },
    properties: { AbilityCooldown: { label: "Cooldown", postfix: "s" } },
    upgrades: [
      { property_upgrades: [{ name: "AbilityCooldown", bonus: -5 }] },
      { property_upgrades: [{ name: "SpeedOnLand", bonus: "4" }] },
      { property_upgrades: [{ name: "Radius", bonus: "4m" }] },
    ],
  } as unknown as Ability;
  assert.deepEqual(upgradeLines(ability, 1), [
    [
      { text: "-5s", highlight: true },
      { text: " Cooldown", highlight: false },
    ],
  ]);
  assert.deepEqual(upgradeLines(ability, 2), [
    [
      { text: "+4", highlight: true },
      { text: " Speed On Land", highlight: false },
    ],
  ]);
  assert.deepEqual(upgradeLines(ability, 3), [
    [
      { text: "+4m", highlight: true },
      { text: " Radius", highlight: false },
    ],
  ]);
});
