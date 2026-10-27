import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { designerBuildFromGame, gameBuildFromDesigner } from "./build-designer-code";
import { ABILITY_POINTS, ABILITY_UNLOCK, heroBuildCodec } from "./wasm/hero-build";
import { loadWasmModule, WasmCallError } from "./wasm/module";

// Built by `pnpm build:wasm` (part of `pnpm test:unit`).
const wasm = readFileSync(new URL("../wasm/hero-build.wasm", import.meta.url));
// Copied in game from "Copy of [Default Nurse Harrow Build]", shared with the crate's own tests.
const NURSE_HARROW = readFileSync(
  new URL("../../wasm/hero-build/tests/fixtures/nurse-harrow.txt", import.meta.url),
  "utf8",
);
const STAGES = ["0–9m", "9–20m", "20–30m", "30m+"];
const codec = heroBuildCodec(await loadWasmModule(wasm, ["decode", "encode"]));

test("decodes a code copied in game", () => {
  const build = codec.decode(NURSE_HARROW);
  assert.equal(build.hero_id, 87);
  assert.equal(build.name, "Copy of [Default Nurse Harrow Build]");
  assert.deepEqual(
    build.details?.mod_categories.map((group) => [group.name, group.mods.length]),
    [
      ["#Citadel_HeroBuilds_EarlyGame", 10],
      ["#Citadel_HeroBuilds_MidGame", 8],
      ["#Citadel_HeroBuilds_LateGame", 7],
    ],
  );
});

test("text that is not a code fails with the module's message", () => {
  assert.throws(() => codec.decode("not a build"), WasmCallError);
  assert.throws(() => codec.decode(""), /not a build code/);
});

test("a game build opens in the designer by group, with its upgrades as the skill order", () => {
  const build = designerBuildFromGame(codec.decode(NURSE_HARROW), STAGES);
  assert.equal(build.heroId, 87);
  assert.equal(build.path.length, 25);
  assert.deepEqual(
    [0, 1, 2, 3].map((column) => build.path.filter((key) => key.startsWith(`${column}:`)).length),
    [10, 8, 7, 0],
  );
  assert.equal(build.path[0], "0:2829638276");
  // 12 upgrades; the 4 unlocks are not steps of the designer's order.
  assert.equal(build.skills.length, 12);
  assert.deepEqual(build.skills.slice(0, 3), [267712790, 267712790, 683490631]);
});

test("a designer build survives a trip through a game code", () => {
  const abilities = [267712790, 683490631, 3621314027, 3427093887];
  const designer = {
    heroId: 87,
    name: "Nurse build",
    path: ["0:2829638276", "0:968099481", "2:1548066885", "3:2356412290"],
    skills: [683490631, 683490631, 267712790, 683490631, 683490631],
  };
  const game = gameBuildFromDesigner({ ...designer, abilities, stageNames: STAGES, now: 1_800_000_000_000 });
  const changes = game.details?.ability_order?.currency_changes ?? [];
  // Every ability unlocked first, the upgraded ones in the order of their first upgrade; a fourth upgrade is dropped.
  assert.deepEqual(
    changes.filter((c) => c.currency_type === ABILITY_UNLOCK).map((c) => c.ability_id),
    [683490631, 267712790, 3621314027, 3427093887],
  );
  assert.deepEqual(
    changes.filter((c) => c.currency_type === ABILITY_POINTS).map((c) => c.delta),
    [-1, -2, -1, -5],
  );
  assert.deepEqual(
    game.details?.mod_categories.map((group) => group.name),
    ["0–9m", "20–30m", "30m+"],
  );

  const back = designerBuildFromGame(codec.decode(codec.encode(game)), STAGES);
  assert.deepEqual(back, { ...designer, skills: designer.skills.slice(0, 4) });
});
