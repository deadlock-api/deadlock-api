import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSteamIdToId3, steamId64ToSteamId3 } from "./steam";

test("legacy Steam IDs combine the account number and auth-server bit", () => {
  assert.equal(parseSteamIdToId3("STEAM_0:0:123"), "246");
  assert.equal(parseSteamIdToId3("STEAM_0:1:123"), "247");
  assert.equal(parseSteamIdToId3("STEAM_1:1:123"), "247");
  assert.equal(parseSteamIdToId3("[STEAM_0:1:9186987]"), "18373975");
});

test("every supported spelling identifies the same player without losing 64-bit precision", () => {
  for (const input of [
    "18373975",
    "0018373975",
    "76561197978639703",
    "[U:1:18373975]",
    "U:1:18373975",
    "STEAM_1:1:9186987",
  ]) {
    assert.equal(parseSteamIdToId3(input), "18373975", input);
    assert.equal(parseSteamIdToId3(` \t${input}\n`), "18373975", `whitespace around ${input}`);
  }
  assert.equal(steamId64ToSteamId3("76561197978639703"), 18373975);
});

test("the full unsigned 32-bit account range is represented exactly", () => {
  assert.equal(parseSteamIdToId3("4294967295"), "4294967295");
  assert.equal(parseSteamIdToId3("76561202255233023"), "4294967295");
  assert.equal(parseSteamIdToId3("STEAM_1:1:2147483647"), "4294967295");
  assert.equal(parseSteamIdToId3("[U:1:4294967295]"), "4294967295");
  // The tracker separately rejects account zero, but conversion must not mistake the base for an account ID.
  assert.equal(parseSteamIdToId3("76561197960265728"), "0");
  assert.equal(parseSteamIdToId3("STEAM_0:0:0"), "0");
});

test("malformed inputs are never partially stripped into another player", () => {
  for (const input of [
    "",
    " ",
    "[123]",
    "[U:1:123",
    "U:1:123]",
    "[[U:1:123]]",
    "U:1:U:1:123",
    "prefix[U:1:123]",
    "[U:1:123]suffix",
    "STEAM_0:2:123",
    "STEAM_0:1:-123",
    "[STEAM_0:1:123",
    "STEAM_0:1:123]",
    "0x10",
    "0b10",
    "1e3",
    "+123",
    "-123",
    "123.0",
    "12 3",
  ])
    assert.equal(parseSteamIdToId3(input), input);
});

test("other universes, account types, and overflowing values remain unsupported", () => {
  for (const input of [
    "[U:2:123]",
    "[g:1:123]",
    "STEAM_2:1:123",
    "STEAM_1:1:2147483648",
    "[U:1:4294967296]",
    "[U:1:76561197978639703]",
    "76561202255233024",
    "103582791429521531",
    "999999999999999999999999999999999999999999999999",
  ])
    assert.equal(parseSteamIdToId3(input), input);
});
