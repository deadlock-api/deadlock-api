import assert from "node:assert/strict";
import { test } from "node:test";

import type { Variable } from "~/types/streamkit/command";

import {
  checkCommandTemplate,
  commandTemplateArgs,
  commandTemplateVariables,
  insertCommandVariable,
  isCommandTemplateValid,
} from "./streamkit-command";

const variables: Variable[] = [
  { name: "wins_today", description: "" },
  { name: "hero_kd", description: "", extra_args: ["hero_name"] },
  { name: "hero_wins", description: "", extra_args: ["hero_name"] },
];

test("a template's variables and arguments are listed once each", () => {
  assert.deepEqual(commandTemplateVariables("{hero_kd} {wins_today} {hero_kd}"), ["hero_kd", "wins_today"]);
  assert.deepEqual(commandTemplateArgs("{hero_kd} {hero_wins}", variables), ["hero_name"]);
});

test("an empty template is not valid", () => {
  const check = checkCommandTemplate("  ", variables, {});
  assert.equal(check.empty, true);
  assert.equal(isCommandTemplateValid(check), false);
});

test("unknown variables are reported once the list has loaded", () => {
  assert.deepEqual(checkCommandTemplate("{foo} {wins_today} {bar}", variables, {}).unknown, ["foo", "bar"]);
  assert.deepEqual(checkCommandTemplate("{foo}", undefined, {}).unknown, []);
});

test("a variable without its required argument is reported", () => {
  const check = checkCommandTemplate("{hero_kd} / {hero_wins}", variables, { hero_name: " " });
  assert.deepEqual(check.missing, [{ arg: "hero_name", variables: ["hero_kd", "hero_wins"] }]);
  assert.equal(isCommandTemplateValid(check), false);
  assert.equal(isCommandTemplateValid(checkCommandTemplate("{hero_kd}", variables, { hero_name: "Haze" })), true);
});

test("a variable goes in at the caret, replacing the selection", () => {
  assert.deepEqual(insertCommandVariable("W: ", "wins_today", 3), { template: "W: {wins_today}", caret: 15 });
  assert.deepEqual(insertCommandVariable("a  b", "x", 2), { template: "a {x} b", caret: 5 });
  assert.deepEqual(insertCommandVariable("a XX b", "x", 2, 4), { template: "a {x} b", caret: 5 });
  assert.deepEqual(insertCommandVariable("", "x", 0), { template: "{x}", caret: 3 });
});
