import assert from "node:assert/strict";
import { test } from "node:test";

import { QueryClient } from "@tanstack/react-query";

import { ensureCached } from "~/lib/prefetch-safe";

test("ensureCached uses any cached answer but refetches a seed", async () => {
  const queryClient = new QueryClient();
  let fetches = 0;
  const options = {
    queryKey: ["catalog"],
    queryFn: async () => {
      fetches += 1;
      return ["a", "b", "c"];
    },
  };
  queryClient.setQueryData(["catalog"], ["old"], { updatedAt: 0 });
  assert.deepEqual(await ensureCached(queryClient, options), ["old"]);
  assert.equal(fetches, 0);

  // What prefetchSeed leaves behind: part of the answer, marked invalidated.
  queryClient.setQueryData(["catalog"], ["a"]);
  await queryClient.invalidateQueries({ queryKey: ["catalog"], exact: true, refetchType: "none" });
  assert.deepEqual(await ensureCached(queryClient, options), ["a", "b", "c"]);
  assert.equal(fetches, 1);
});
