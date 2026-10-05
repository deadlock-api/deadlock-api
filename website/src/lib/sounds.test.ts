import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildConversations,
  groupTopics,
  heroMentionFinder,
  groupTakes,
  humanizeSoundName,
  matchesSoundQuery,
  takeBase,
  voiceSections,
  type SoundTree,
} from "./sounds";

const url = (name: string) => `https://cdn.test/${name}.mp3`;
const files = (...names: string[]) => Object.fromEntries(names.map((name) => [name, url(name)]));

test("takeBase strips take numbers and alternates", () => {
  assert.equal(takeBase("astro_kill_trapper_03"), "astro_kill_trapper");
  assert.equal(takeBase("abrams_weapon_whizby_groupa-001"), "abrams_weapon_whizby_groupa");
  assert.equal(takeBase("newscaster_seasonal_forge_unlock_01_alt_01"), "newscaster_seasonal_forge_unlock");
  assert.equal(takeBase("cast"), "cast");
  assert.equal(takeBase("01"), "01");
});

test("humanizeSoundName names heroes by their display name", () => {
  const names = new Map([["hornet", "Vindicta"]]);
  assert.equal(humanizeSoundName("kill_hornet", names), "Kill Vindicta");
  assert.equal(humanizeSoundName("ping_see-garage"), "Ping see garage");
});

test("groupTakes groups takes per folder and drops the shared prefix", () => {
  const groups = groupTakes([
    { path: [], take: { name: "astro_kill_trapper_02", url: url("2") } },
    { path: [], take: { name: "astro_kill_trapper_01", url: url("1") } },
    { path: [], take: { name: "astro_happy_01", url: url("h") } },
    { path: ["ping"], take: { name: "astro_ping_go_01", url: url("p") } },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.id, g.label, g.takes.map((t) => t.name)]),
    [
      ["astro_happy", "Happy", ["astro_happy_01"]],
      ["astro_kill_trapper", "Kill trapper", ["astro_kill_trapper_01", "astro_kill_trapper_02"]],
      ["ping/astro_ping_go", "Astro ping go", ["astro_ping_go_01"]],
    ],
  );
});

test("groupTakes drops the speaker's codename or name from labels", () => {
  const take = (name: string) => ({ path: [], take: { name, url: url(name) } });
  const groups = groupTakes(
    [take("atlas_kill_haze_01"), take("abrams_ally_shiv_multikill_01"), take("guide_jump")],
    undefined,
    new Set(["atlas", "abrams"]),
  );
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Ally shiv multikill", "Kill haze", "Guide jump"],
  );
});

test("voiceSections leaves conversations out and puts the folder's own lines first", () => {
  const tree: SoundTree = {
    ...files("haze_happy_01", "haze_match_start_haze_viscous_convo01_01"),
    emote: files("haze_effort_01"),
  };
  const sections = voiceSections(tree);
  assert.deepEqual(
    sections.map((s) => [s.id, s.groups.map((g) => g.id)]),
    [
      ["lines", ["haze_happy"]],
      ["emote", ["emote/haze_effort"]],
    ],
  );
});

test("buildConversations stitches lines from every speaker in order", () => {
  const vo: SoundTree = {
    astro: files("astro_match_start_astro_chrono_convo01_02", "astro_match_start_astro_chrono_convo01_02_02"),
    chrono: files("chrono_match_start_astro_chrono_convo01_03", "chrono_match_start_astro_chrono_convo01_01"),
  };
  const [convo] = buildConversations(vo, new Map([["chrono", "Paradox"]]));
  assert.equal(convo.id, "match_start_astro_chrono_convo01");
  assert.equal(convo.label, "Astro Paradox");
  assert.equal(convo.context, "Match start");
  assert.equal(convo.part, 1);
  assert.deepEqual(convo.speakers, ["chrono", "astro"]);
  assert.deepEqual(
    convo.lines.map((l) => [l.order, l.speaker, l.takes.length]),
    [
      [1, "chrono", 1],
      [2, "astro", 2],
      [3, "chrono", 1],
    ],
  );
});

test("matchesSoundQuery needs every word", () => {
  const takes = [{ name: "astro_kill_trapper_01", url: "" }];
  assert.ok(matchesSoundQuery("kill trap", "Kill Trapper", takes));
  assert.ok(matchesSoundQuery("astro", "Kill Trapper", takes));
  assert.ok(!matchesSoundQuery("kill haze", "Kill Trapper", takes));
});

test("groupTopics groups lines that differ in one word, merging two mentions of a hero", () => {
  const heroes = [
    { codename: "vampirebat", name: "Mina" },
    { codename: "shiv", name: "Shiv" },
    { codename: "ratking", name: "Rat King" },
    { codename: "ghost", name: "Lady Geist" },
    { codename: "nano", name: "Calico" },
  ];
  const findHero = heroMentionFinder(heroes);
  const heroName = (codename: string) => heroes.find((h) => h.codename === codename)?.name ?? codename;
  const groups = groupTakes(
    [
      "ally_vampirebat_killed_in_lane",
      "ally_shiv_killed_in_lane",
      "ally_fairfax_killed_in_lane",
      "ally_nano_killed_in_lane",
      "ally_calico_killed_in_lane",
      "attack_rat_king",
      "attack_geist",
      "effort_dash",
      "effort_melee",
      "effort_general",
      "happy",
      "kill_mina",
    ].map((name) => ({ path: [], take: { name: `${name}_01`, url: url(name) } })),
  );
  const topics = groupTopics(groups, { findHero, heroName });
  assert.equal(topics[0].rows.find((r) => r.label === "Calico")?.group.takes.length, 2);
  assert.deepEqual(
    topics.map((t) => [t.label, t.rows.map((r) => r.label)]),
    [
      ["Ally … killed in lane", ["Calico", "Fairfax", "Mina", "Shiv"]],
      ["Attack …", ["Lady Geist", "Rat King"]],
      ["Effort …", ["Dash", "General", "Melee"]],
      ["Other", ["Happy", "Kill mina"]],
    ],
  );
});
