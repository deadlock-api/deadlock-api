import assert from "node:assert/strict";
import { test } from "node:test";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "~/queries/query-keys";

import { refreshTrackerAccount } from "./refresh";

test("account refresh invalidates history, rank and all of that account's breakdown filter variants", async () => {
  const client = new QueryClient();
  const matching = [
    queryKeys.players.matchHistory(1),
    queryKeys.players.rank(1),
    queryKeys.players.heroStats({ accountIds: [1], gameMode: "normal" }),
    queryKeys.players.heroStats({ accountIds: [2, 1], gameMode: "street_brawl" }),
    queryKeys.players.mateStats({ accountId: 1, minUnixTimestamp: 100 }),
    queryKeys.players.enemyStats({ accountId: 1, maxUnixTimestamp: 200 }),
  ];
  const unrelated = [
    queryKeys.players.matchHistory(2),
    queryKeys.players.rank(2),
    queryKeys.players.heroStats({ accountIds: [2] }),
    queryKeys.players.mateStats({ accountId: 2 }),
    queryKeys.players.enemyStats({ accountId: 2 }),
    queryKeys.players.matchMetadata(1),
    queryKeys.players.abilities(),
    queryKeys.analytics.heroStats({}),
  ];
  try {
    for (const key of [...matching, ...unrelated]) client.setQueryData(key, ["saved"]);
    await refreshTrackerAccount(client, 1);
    for (const key of matching) assert.equal(client.getQueryState(key)?.isInvalidated, true, JSON.stringify(key));
    for (const key of unrelated) assert.equal(client.getQueryState(key)?.isInvalidated, false, JSON.stringify(key));
  } finally {
    client.clear();
  }
});

test("account refresh fetches active breakdowns immediately and leaves inactive variants for their next visit", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const calls = { active: 0, inactive: 0, other: 0 };
  const active = new QueryObserver(client, {
    queryKey: queryKeys.players.heroStats({ accountIds: [1] }),
    initialData: ["saved"],
    queryFn: async () => {
      calls.active++;
      return ["fresh"];
    },
  });
  const other = new QueryObserver(client, {
    queryKey: queryKeys.players.mateStats({ accountId: 2 }),
    initialData: ["saved"],
    queryFn: async () => {
      calls.other++;
      return ["fresh"];
    },
  });
  const inactiveKey = queryKeys.players.enemyStats({ accountId: 1 });
  await client.query({
    queryKey: inactiveKey,
    queryFn: async () => {
      calls.inactive++;
      return ["saved"];
    },
  });
  calls.inactive = 0;
  const unsubscribeActive = active.subscribe(() => {});
  const unsubscribeOther = other.subscribe(() => {});
  try {
    await refreshTrackerAccount(client, 1);
    assert.deepEqual(calls, { active: 1, inactive: 0, other: 0 });
    assert.deepEqual(active.getCurrentResult().data, ["fresh"]);
    assert.equal(client.getQueryState(inactiveKey)?.isInvalidated, true);
  } finally {
    unsubscribeActive();
    unsubscribeOther();
    client.clear();
  }
});
