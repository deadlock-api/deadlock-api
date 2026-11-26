import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import {
  type PlayerSouls,
  permanentBuffCount,
  permanentBuffs,
  permanentBuffsByStat,
  restSouls,
  soulContexts,
  soulFieldOf,
  soulsFrom,
} from "./match-souls";

const souls = (treasure: number): PlayerSouls => ({ ...soulsFrom(() => 0)!, gold_treasure: treasure });
const ZERO = soulsFrom(() => 0);

function player(accountId: number, team: string, treasure: number, unspent: number | null): TrackerMatchPlayer {
  return {
    account_id: accountId,
    team,
    souls: souls(treasure),
    unspent_soul_minutes: unspent,
  } as TrackerMatchPlayer;
}

test("soulsFrom is null only when no field has a reading", () => {
  assert.equal(
    soulsFrom(() => null),
    null,
  );
  assert.equal(ZERO?.gold_lane_creep, 0);
  assert.equal(soulsFrom((field) => (field === "gold_boss" ? 12 : undefined))?.gold_boss, 12);
});

test("soulFieldOf maps the game stats keys and nothing else", () => {
  assert.equal(soulFieldOf("avg_gold_lane_creep_orbs"), "gold_lane_creep_orbs");
  assert.equal(soulFieldOf("avg_gold_denied"), undefined);
});

test("restSouls reads the latest sample, gold_sources for the sources without a field", () => {
  // Match 143509249, player slot 5: assists come only through gold_sources (EGoldSource 6).
  const read = restSouls([
    { time_stamp_s: 600, gold_lane_creep: 1, gold_sources: [{ source: 6, gold: 1 }] },
    {
      time_stamp_s: 1635,
      gold_player: 6110,
      gold_lane_creep: 6714,
      gold_lane_creep_orbs: 5878,
      gold_treasure: 469,
      gold_sources: [
        { source: 6, gold: 4201 },
        { source: 8, gold: 1801 },
        { source: 12, gold: 0 },
      ],
    },
  ]);
  assert.equal(read?.gold_player, 6110);
  assert.equal(read?.gold_lane_creep, 6714);
  assert.equal(read?.gold_assists, 4201);
  assert.equal(read?.gold_team_bonus, 1801);
  assert.equal(read?.gold_breakable, 0);
  assert.equal(restSouls([]), null);
});

test("permanentBuffs keeps the permanent pickups and counts them", () => {
  const buffs = permanentBuffs([
    { is_permanent: true, type: "hp_permanent_pickup_lv2", value: 2, pickup_times_s: [773, 957] },
    { is_permanent: true, type: "hp_permanent_pickup", value: 1, pickup_times_s: [367] },
    { is_permanent: true, type: "wp_permanent_pickup", value: 1 },
    { is_permanent: false, type: "survival_powerup_pickup", value: 1, pickup_times_s: [] },
    "junk",
  ]);
  assert.equal(buffs.length, 3);
  assert.equal(permanentBuffCount(buffs), 4);
  assert.deepEqual(permanentBuffsByStat(buffs), [
    { stat: "Health", count: 3 },
    { stat: "Weapon damage", count: 1 },
  ]);
  assert.deepEqual(permanentBuffs(null), []);
});

test("soulContexts splits the urn at the team's common reading and ranks unspent souls", () => {
  // Match 143509249 (27:15): team 0 shares 469 urn souls and slot 3 delivered the rest; slot 12 held 63,928
  // soul-minutes, 2,346 a minute and the 10th most of the lobby.
  const unspent = [73946, 82638, 101595, 65276, 65935, 66642, 51652, 63928, 67512, 33912, 88646, 71963];
  const players = [
    player(5, "Team0", 469, unspent[0]),
    player(2, "Team0", 469, unspent[1]),
    player(6, "Team0", 469, unspent[2]),
    player(1, "Team0", 469, unspent[3]),
    player(4, "Team0", 469, unspent[4]),
    player(3, "Team0", 4119, unspent[5]),
    player(11, "Team1", 309, unspent[6]),
    player(12, "Team1", 1259, unspent[7]),
    player(7, "Team1", 266, unspent[8]),
    player(10, "Team1", 309, unspent[9]),
    player(8, "Team1", 309, unspent[10]),
    player(9, "Team1", 309, null),
  ];
  const contexts = soulContexts(players, 1635);
  assert.deepEqual(
    { delivered: contexts.get(3)?.urnDelivered, shared: contexts.get(3)?.urnShared },
    { delivered: 3650, shared: 469 },
  );
  // Slot 7 missed a payout (266 against the team's 309): it delivered nothing, and the others' share is still 309.
  assert.equal(contexts.get(12)?.urnDelivered, 1259 - 309);
  assert.deepEqual([contexts.get(7)?.urnDelivered, contexts.get(7)?.urnShared], [0, 266]);
  assert.equal(contexts.get(10)?.urnDelivered, 0);
  assert.equal(Math.round(contexts.get(12)?.unspentPerMin ?? 0), 2346);
  assert.equal(contexts.get(12)?.unspentRank, 9);
  assert.equal(contexts.get(12)?.unspentOf, 11);
  assert.equal(contexts.get(6)?.unspentRank, 1);
  assert.equal(contexts.get(9)?.unspentPerMin, null);
  assert.equal(contexts.get(9)?.unspentRank, null);
});
