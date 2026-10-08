import assert from "node:assert/strict";
import { test } from "node:test";

import { nextSort } from "./use-sort";

type Key = "name" | "winRate";

test("pressing the active column flips its direction", () => {
  assert.deepEqual(nextSort<Key>({ key: "winRate", dir: "desc" }, "winRate"), { key: "winRate", dir: "asc" });
  assert.deepEqual(nextSort<Key>({ key: "winRate", dir: "asc" }, "winRate", "asc"), { key: "winRate", dir: "desc" });
});

test("another column starts in its first direction", () => {
  assert.deepEqual(nextSort<Key>({ key: "name", dir: "asc" }, "winRate"), { key: "winRate", dir: "desc" });
  assert.deepEqual(nextSort<Key>({ key: "winRate", dir: "asc" }, "name", "asc"), { key: "name", dir: "asc" });
  const namesUp = (key: Key) => (key === "name" ? "asc" : "desc");
  assert.deepEqual(nextSort<Key>({ key: "winRate", dir: "desc" }, "name", namesUp), { key: "name", dir: "asc" });
  assert.deepEqual(nextSort<Key>({ key: "name", dir: "desc" }, "winRate", namesUp), { key: "winRate", dir: "desc" });
});
