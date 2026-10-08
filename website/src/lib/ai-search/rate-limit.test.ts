import assert from "node:assert/strict";
import { test } from "node:test";

import { QUESTIONS_PER_MINUTE } from "./limits";
import { allowQuestion } from "./rate-limit";

test("without the Worker's binding, a visitor gets ten questions a minute", async () => {
  const at = 1_000_000;
  for (let i = 0; i < QUESTIONS_PER_MINUTE; i++) assert.equal(await allowQuestion("1.2.3.4", undefined, at + i), true);
  assert.equal(await allowQuestion("1.2.3.4", undefined, at + 100), false);
  // Another visitor has a limit of its own, and the first gets questions back as the minute passes.
  assert.equal(await allowQuestion("5.6.7.8", undefined, at + 100), true);
  assert.equal(await allowQuestion("1.2.3.4", undefined, at + 60_001), true);
});

test("in the Worker, the binding decides", async () => {
  const keys: string[] = [];
  const limiter = {
    limit: ({ key }: { key: string }) => {
      keys.push(key);
      return Promise.resolve({ success: false });
    },
  };
  assert.equal(await allowQuestion("9.9.9.9", limiter), false);
  assert.deepEqual(keys, ["9.9.9.9"]);
});
