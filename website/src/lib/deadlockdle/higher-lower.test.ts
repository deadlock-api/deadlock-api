import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnalyticsHeroStats, HeroCounterStats } from "deadlock_api_client";

import {
  bestStreak,
  buildRounds,
  correctGuess,
  currentStreak,
  type Guess,
  type HigherLowerData,
  type HigherLowerRound,
  pickAbilityHeroes,
  possessive,
  resultGrid,
  revealSentence,
  ROUND_COUNT,
  shareGrid,
  statsDateRange,
  statsWindow,
  statsWindowLabel,
} from "./higher-lower";

const HERO_IDS = Array.from({ length: 12 }, (_, i) => i + 1);

function heroRow(id: number): AnalyticsHeroStats {
  const matches = 10_000 + id * 700;
  return {
    bucket: 0,
    hero_id: id,
    matches,
    matches_per_bucket: 50_000,
    wins: Math.round(matches * (0.42 + id * 0.013)),
    losses: 0,
    total_kills: matches * (5 + id * 0.3),
    total_deaths: matches * (8 - id * 0.2),
    total_assists: 0,
    total_player_damage: matches * (20_000 + id * 1500),
    total_net_worth: matches * (38_000 + id * 900),
    total_last_hits: matches * (150 + id * 6),
    total_denies: matches * (2 + id * 0.25),
    total_boss_damage: 0,
    total_creep_damage: 0,
    total_max_health: 0,
    total_neutral_damage: 0,
    total_player_damage_taken: 0,
    total_shots_hit: 0,
    total_shots_missed: 0,
    permanent_buff_matches: matches,
    permanent_buff_timing_matches: 0,
    total_first_permanent_buff_time_s: 0,
    total_permanent_buffs: 0,
  };
}

function counterRow(hero: number, enemy: number): HeroCounterStats {
  const matches = 2000;
  return {
    hero_id: hero,
    enemy_hero_id: enemy,
    matches_played: matches,
    wins: Math.round(matches * (0.5 + (hero - enemy) * 0.012)),
  } as HeroCounterStats;
}

function data(date: string): HigherLowerData {
  const abilityHeroes = pickAbilityHeroes(HERO_IDS, date);
  const abilities = new Map<number, { name: string; hero: number }>();
  for (const hero of HERO_IDS) {
    for (let slot = 1; slot <= 4; slot++) abilities.set(hero * 10 + slot, { name: `Ability ${hero}-${slot}`, hero });
  }
  return {
    heroes: HERO_IDS.map((id) => ({ id, name: `Hero ${id}` })),
    abilities,
    heroStats: HERO_IDS.map(heroRow),
    counters: HERO_IDS.flatMap((hero) => HERO_IDS.filter((enemy) => enemy !== hero).map((e) => counterRow(hero, e))),
    gameStats: {
      avg_gold_player: 6000,
      avg_gold_player_orbs: 2000,
      avg_gold_lane_creep: 15_000,
      avg_gold_lane_creep_orbs: 4000,
      avg_gold_neutral_creep: 5000,
      avg_gold_neutral_creep_orbs: 700,
      avg_gold_boss: 3000,
      avg_gold_boss_orb: 400,
      avg_gold_treasure: 2100,
      avg_gold_breakable: 1800,
      avg_gold_team_bonus: 1300,
    } as HigherLowerData["gameStats"],
    abilityOrders: abilityHeroes.map((heroId) => {
      const [a, b, c, d] = [1, 2, 3, 4].map((slot) => heroId * 10 + slot);
      return {
        heroId,
        rows: [
          { abilities: [a, a, b, b, c, a, d, a, c, b, c, c, b, d, d], matches: 900, wins: 0, losses: 0, players: 0 },
          { abilities: [b, b, a, a, c, b, d, b, c, a, a, c, c, d, d], matches: 300, wins: 0, losses: 0, players: 0 },
        ].map((row) => ({ ...row, total_kills: 0, total_deaths: 0, total_assists: 0 })),
      };
    }),
  };
}

test("a day always gets the same ten rounds", () => {
  const first = buildRounds(data("2026-09-28"), "2026-09-28");
  const second = buildRounds(data("2026-09-28"), "2026-09-28");
  assert.equal(first.length, ROUND_COUNT);
  assert.deepEqual(first, second);
});

test("the run mixes all four categories in their planned counts", () => {
  const rounds = buildRounds(data("2026-09-28"), "2026-09-28");
  const count = (category: string) => rounds.filter((round) => round.category === category).length;
  assert.deepEqual([count("heroes"), count("matchups"), count("economy"), count("abilities")], [3, 3, 2, 2]);
});

test("different days get different runs", () => {
  const a = buildRounds(data("2026-09-28"), "2026-09-28").map((round) => round.question);
  const b = buildRounds(data("2026-09-29"), "2026-09-29").map((round) => round.question);
  assert.notDeepEqual(a, b);
});

test("no round is a tie, and no question is asked twice", () => {
  for (const date of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]) {
    const rounds = buildRounds(data(date), date);
    for (const round of rounds) assert.notEqual(round.left.value, round.right.value);
    assert.equal(new Set(rounds.map((round) => round.question)).size, rounds.length);
  }
});

test("a category without data falls back to a hero meta round", () => {
  const rounds = buildRounds({ ...data("2026-09-28"), counters: [], abilityOrders: [] }, "2026-09-28");
  assert.equal(rounds.length, ROUND_COUNT);
  assert.equal(rounds.filter((round) => round.category === "heroes").length, 8);
});

test("the stats window is seven full UTC days ending two days before the puzzle", () => {
  const { minUnixTimestamp, maxUnixTimestamp } = statsWindow("2026-09-28");
  assert.equal(minUnixTimestamp, Date.UTC(2026, 8, 20) / 1000);
  assert.equal(maxUnixTimestamp, Date.UTC(2026, 8, 26, 23, 59, 59) / 1000);
  assert.equal(statsDateRange("2026-09-28"), "2026-09-20T00:00:00.000Z_2026-09-26T23:59:59.999Z");
});

test("the share grid marks each round", () => {
  const rounds = buildRounds(data("2026-09-28"), "2026-09-28");
  const answers = rounds.map((round, i) =>
    i === 0 ? (correctGuess(round) === "higher" ? "lower" : "higher") : correctGuess(round),
  );
  assert.equal(resultGrid(rounds, answers), `🟥${"🟩".repeat(ROUND_COUNT - 1)}`);
});

test("only significant gaps are asked about", () => {
  for (const date of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]) {
    for (const { kind, left, right } of buildRounds(data(date), date)) {
      const gap = Math.abs(left.value - right.value) / ((left.value + right.value) / 2);
      assert.ok(gap >= 0.03, `${left.name} vs ${right.name}: gap ${gap}`);
      if (!left.sample || !right.sample) continue;
      const z =
        kind === "head-to-head"
          ? Math.abs(left.value - 0.5) / Math.sqrt(0.25 / left.sample)
          : Math.abs(left.value - right.value) /
            Math.sqrt(
              ((left.value + right.value) / 2) *
                (1 - (left.value + right.value) / 2) *
                (1 / left.sample + 1 / right.sample),
            );
      assert.ok(z >= 3, `${left.name} vs ${right.name}: z ${z}`);
    }
  }
});

test("a matchup is two heroes head to head, their win rates adding up to 100%", () => {
  const matchups = buildRounds(data("2026-09-28"), "2026-09-28").filter((round) => round.category === "matchups");
  assert.equal(matchups.length, 3);
  for (const round of matchups) {
    assert.equal(round.kind, "head-to-head");
    assert.equal(round.subject, undefined);
    assert.ok(Math.abs(round.left.value + round.right.value - 1) < 1e-9);
  }
});

test("possessive adds an apostrophe, and an s unless the name ends in one", () => {
  assert.equal(possessive("Jungle neutrals"), "Jungle neutrals'");
  assert.equal(possessive("Mo & Krill"), "Mo & Krill's");
  assert.equal(possessive("Abrams"), "Abrams'");
  assert.equal(possessive("Haze"), "Haze's");
});

test("every higher-lower question names the hidden right side and says higher or lower", () => {
  for (const date of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]) {
    for (const round of buildRounds(data(date), date)) {
      if (round.kind === "head-to-head") continue;
      assert.match(round.question, /higher or lower/);
      // A soul source goes by its phrase in a sentence, "jungle camps" for Jungle neutrals.
      if (round.right.kind === "source") assert.match(round.question, /^Are the souls from /);
      else
        assert.ok(
          round.question.includes(possessive(round.right.name)) ||
            round.question.includes(` max ${round.right.name} first`),
          round.question,
        );
    }
  }
});

test("ability rounds only ask about maxing first, and only about abilities someone maxes first", () => {
  for (const date of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]) {
    for (const round of buildRounds(data(date), date)) {
      assert.doesNotMatch(round.stat, /by the end/i);
      if (round.category !== "abilities") continue;
      assert.equal(round.stat, "Share of players who max it first");
      assert.ok(round.left.value >= 0.03 && round.right.value >= 0.03);
    }
  }
});

const hero = (name: string, value: number) => ({ kind: "hero" as const, heroId: 1, name, value });

test("the reveal states the gap, one phrasing per kind", () => {
  const base = { category: "heroes", source: { page: "hero-stats" }, stat: "Win rate", question: "" } as const;
  const rate: HigherLowerRound = {
    ...base,
    kind: "higher-lower",
    format: "percent",
    left: hero("Mirage", 0.534),
    right: hero("Abrams", 0.521),
  };
  assert.equal(revealSentence(rate), "Abrams: 52.1%, 1.3 points below Mirage's 53.4%.");
  // The gap is taken between the shown values, not the raw ones (26.5% - 13.3%, not 26.54% - 13.26%).
  const shown = { ...rate, left: hero("Mirage", 0.2654), right: hero("Abrams", 0.1326) };
  assert.equal(revealSentence(shown), "Abrams: 13.3%, 13.2 points below Mirage's 26.5%.");

  const average: HigherLowerRound = {
    ...base,
    kind: "higher-lower",
    format: "number",
    left: hero("Mirage", 44_906),
    right: hero("Abrams", 42_443),
  };
  assert.equal(revealSentence(average), "Abrams: 42,443, 5% below Mirage's 44,906.");

  const souls: HigherLowerRound = {
    ...base,
    category: "economy",
    kind: "higher-lower",
    format: "number",
    left: { kind: "source", name: "Objectives", value: 8143 },
    right: { kind: "source", name: "Jungle neutrals", value: 9120 },
  };
  // A soul source keeps the question's wording ("jungle camps"), not the card's name.
  assert.equal(revealSentence(souls), "Souls from jungle camps: 9,120, 12% above those from objectives (8,143).");

  const ability: HigherLowerRound = {
    ...base,
    category: "abilities",
    kind: "higher-lower",
    format: "percent",
    subject: { heroId: 1, name: "Calico" },
    left: { kind: "ability", abilityId: 1, name: "Return to Shadows", value: 0.879 },
    right: { kind: "ability", abilityId: 2, name: "Gloom Bombs", value: 0.057 },
  };
  assert.equal(
    revealSentence(ability),
    "Calico players max Gloom Bombs first 5.7% of the time, 82.2 points below Return to Shadows (87.9%).",
  );

  const matchup: HigherLowerRound = {
    ...base,
    category: "matchups",
    kind: "head-to-head",
    format: "percent",
    left: hero("Haze", 0.542),
    right: hero("Vindicta", 0.458),
  };
  assert.equal(revealSentence(matchup), "Haze wins 54.2% of the matches where Haze and Vindicta face each other.");
});

test("the stats window label names its days, and both months across a month boundary", () => {
  assert.equal(statsWindowLabel("2026-09-28"), "Sep 20–26");
  assert.equal(statsWindowLabel("2026-09-05"), "Aug 28–Sep 3");
});

/** The answers to `rounds`, wrong at `wrong`. */
function answersFor(rounds: readonly HigherLowerRound[], wrong: number[]): Guess[] {
  return rounds.map((round, i) => {
    const correct = correctGuess(round);
    if (!wrong.includes(i)) return correct;
    return correct === "higher" ? "lower" : "higher";
  });
}

test("the share grid groups the squares by difficulty, three, four and three", () => {
  const rounds = buildRounds(data("2026-09-28"), "2026-09-28");
  assert.equal(shareGrid(rounds, answersFor(rounds, [1, 7])), "🟩🟥🟩 🟩🟩🟩🟩 🟥🟩🟩");
  assert.equal(shareGrid(rounds.slice(0, 2), answersFor(rounds, [])), "🟩🟩");
});

test("streaks count correct answers in a row", () => {
  const rounds = buildRounds(data("2026-09-28"), "2026-09-28");
  const answers = answersFor(rounds, [2, 8]);
  assert.equal(bestStreak(rounds, answers), 5);
  assert.equal(currentStreak(rounds, answers, 1), 2);
  assert.equal(currentStreak(rounds, answers, 2), 0);
  assert.equal(currentStreak(rounds, answers, 6), 4);
  const partial: (Guess | null)[] = [...answers.slice(0, 2), ...rounds.slice(2).map(() => null)];
  assert.equal(bestStreak(rounds, partial), 2);
  assert.equal(bestStreak(rounds, answersFor(rounds, [])), ROUND_COUNT);
});
