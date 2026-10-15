import assert from "node:assert/strict";
import { test } from "node:test";

import type { Upgrade } from "deadlock_api_client";

import { itemStatQuestion } from "./item-stat";
import { seededRandom } from "./seed";

function item(properties: Upgrade["properties"], keys: { important?: string[]; rest?: string[] }): Upgrade {
  return {
    properties,
    tooltip_sections: [{ section_attributes: [{ properties: keys.rest, important_properties: keys.important }] }],
  } as Upgrade;
}

test("the headline stat is asked, with three wrong values written like it", () => {
  const question = itemStatQuestion(
    item(
      {
        RicochetTargets: { label: "Ricochet Targets", value: "2" },
        RicochetDamagePercent: { label: "Ricochet Damage", value: "65", postfix: "%" },
      },
      { important: ["RicochetDamagePercent"], rest: ["RicochetTargets"] },
    ),
    seededRandom(1),
  );
  assert.equal(question?.label, "Ricochet Damage");
  assert.equal(question?.answer, "65%");
  assert.equal(question?.options.length, 4);
  assert.ok(question?.options.includes("65%"));
  const numbers = question!.options.map((option) => Number.parseFloat(option));
  assert.deepEqual(
    numbers,
    numbers.toSorted((a, b) => a - b),
  );
  for (const number of numbers) assert.equal(number % 5, 0, String(number));
});

test("a unit inside the value and a decimal value keep their form", () => {
  const question = itemStatQuestion(
    item({ MoveSpeed: { label: "Move Speed", value: "1.5m", postfix: " m/s" } }, { rest: ["MoveSpeed"] }),
    seededRandom(2),
  );
  assert.equal(question?.answer, "1.5m/s");
  assert.equal(new Set(question?.options).size, 4);
  for (const option of question!.options) assert.match(option, /^\d+\.\dm\/s$/);
});

test("an item whose tooltip shows no positive number has no question", () => {
  const question = itemStatQuestion(
    item(
      { ChargeDelay: { label: "Charge Delay", value: "-1.0" }, Hidden: { value: "5" } },
      { rest: ["ChargeDelay", "Hidden"] },
    ),
    seededRandom(3),
  );
  assert.equal(question, undefined);
});
