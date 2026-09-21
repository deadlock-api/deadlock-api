import assert from "node:assert/strict";
import { test } from "node:test";

import type { SlimHero } from "~/queries/asset-queries";

import { DEMO_ACCOUNT_ID, isDemoAccount, isDemoMatch } from "./demo";
import { demoEnemyStats, demoHeroStats, demoMatchHistory, demoMatchMetadata, demoMateStats } from "./demo-data";

const HERO_IDS = Array.from({ length: 20 }, (_, i) => i + 1);
const NOW_S = 1_790_000_000;
const heroes = HERO_IDS.map((id) => ({ id, player_selectable: true, disabled: false, items: {} }) as SlimHero);
const assets = { heroes, items: [], abilities: [] };

test("the demo history is deterministic, newest first and made of demo ids only", () => {
  const history = demoMatchHistory(HERO_IDS, NOW_S);
  assert.deepEqual(history, demoMatchHistory(HERO_IDS, NOW_S + 60));
  assert.ok(history.length > 100);
  assert.ok(history.every((entry) => isDemoMatch(entry.match_id) && isDemoAccount(entry.account_id)));
  assert.ok(history.every((entry, i) => i === 0 || entry.start_time < history[i - 1].start_time));
  assert.ok(history[0].start_time < NOW_S && history[0].start_time > NOW_S - 7 * 86_400);
});

test("hero and companion stats cover exactly the matches the filter lets through", () => {
  const history = demoMatchHistory(HERO_IDS, NOW_S);
  const filter = { gameMode: "normal", matchMode: "ranked", minUnixTimestamp: NOW_S - 30 * 86_400 };
  const expected = history.filter(
    (entry) => entry.game_mode === 1 && entry.match_mode === 4 && entry.start_time >= filter.minUnixTimestamp,
  );
  const heroStats = demoHeroStats(history, filter);
  assert.equal(
    heroStats.reduce((sum, hero) => sum + hero.matches_played, 0),
    expected.length,
  );
  const expectedIds = new Set(expected.map((entry) => entry.match_id));
  for (const row of [...demoMateStats(history, filter), ...demoEnemyStats(history, filter)]) {
    assert.ok(row.matches.every((matchId) => expectedIds.has(matchId)));
    assert.ok(row.wins <= row.matches_played);
  }
});

test("match details agree with the history row and with the companion stats", () => {
  const history = demoMatchHistory(HERO_IDS, NOW_S);
  const mates = demoMateStats(history, {});
  for (const entry of history.slice(0, 25)) {
    const match = demoMatchMetadata(entry.match_id, history, assets);
    assert.ok(match);
    assert.equal(match.players.length, 12);
    assert.equal(new Set(match.players.map((player) => player.hero_id)).size, 12);

    const tracked = match.players[0];
    assert.equal(tracked.account_id, DEMO_ACCOUNT_ID);
    assert.equal(tracked.kills, entry.player_kills);
    assert.equal(tracked.deaths, entry.player_deaths);
    assert.equal(tracked.net_worth, entry.net_worth);
    assert.equal(match.winning_team === tracked.team, entry.match_result === entry.player_team);

    for (const player of match.players) {
      const died: number | undefined = match.deaths.find((deaths) => deaths.account_id === player.account_id)
        ?.death_details.length;
      assert.equal(died, player.deaths);
      if (player !== tracked && player.team === tracked.team) {
        assert.ok(mates.find((mate) => mate.mate_id === player.account_id)?.matches.includes(entry.match_id));
      }
    }
    for (const team of ["Team0", "Team1"]) {
      const kills: number = match.players.filter((p) => p.team === team).reduce((sum, p) => sum + p.kills, 0);
      const deaths: number = match.players.filter((p) => p.team !== team).reduce((sum, p) => sum + p.deaths, 0);
      assert.equal(kills, deaths);
    }
  }
  assert.equal(demoMatchMetadata(1, history, assets), null);
});
