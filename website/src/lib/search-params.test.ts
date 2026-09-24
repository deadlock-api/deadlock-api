import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSearch, stringifySearch } from "./search-params";

test("a SteamID64 survives parsing and writing back", () => {
  const search = parseSearch("?steamid=76561198035228949&region=Europe");
  assert.deepEqual({ ...search }, { steamid: "76561198035228949", region: "Europe" });
  assert.equal(stringifySearch(search), "?steamid=76561198035228949&region=Europe");
});

test("everything else parses as the router's default did", () => {
  assert.deepEqual(
    { ...parseSearch("?page=5&ally=%5B1%2C2%5D&flag=true&name=kills&neg=-3") },
    {
      page: 5,
      ally: [1, 2],
      flag: true,
      name: "kills",
      neg: -3,
    },
  );
  assert.equal(stringifySearch({ page: 5, name: "kills", q: "123" }), "?page=5&name=kills&q=%22123%22");
});
