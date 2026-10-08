import assert from "node:assert/strict";
import { test } from "node:test";

import { lookupOf } from "./lookup";

test("a Steam ID in any format, a profile link or a player's name is a player lookup", () => {
  for (const question of [
    "280308116",
    "112483159",
    "76561198072573844",
    "[U:1:280308116]",
    "STEAM_0:0:140154058",
    "steam id 280308116",
    "player stats for 112483159",
    "https://steamcommunity.com/profiles/76561198072573844",
    "steamcommunity.com/id/somename",
    "CnuHHep_2340",
  ])
    assert.equal(lookupOf(question), "player", question);
});

test("a match ID is a match lookup", () => {
  for (const question of ["analyze match 107857788", "match 107857788", "match id 61234567"])
    assert.equal(lookupOf(question), "match", question);
});

test("short numbers, short tokens and stat questions are neither", () => {
  for (const question of [
    "7",
    "2024",
    "t3",
    "1v1",
    "match length",
    "longest matches this patch",
    "who counters abrams",
    "best heroes in eternus this patch",
    "t1 items as bebop against lady geist",
  ])
    assert.equal(lookupOf(question), undefined, question);
});
