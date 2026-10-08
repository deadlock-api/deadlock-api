import assert from "node:assert/strict";
import { test } from "node:test";

import { setWorkerEnv } from "~/lib/worker-env";

import { QUESTIONS_PER_MINUTE } from "./limits";
import { allowQuestion } from "./rate-limit";

test("without the Worker's binding, a visitor gets ten questions a minute", async () => {
  setWorkerEnv({});
  const at = 1_000_000;
  for (let i = 0; i < QUESTIONS_PER_MINUTE; i++) assert.equal(await allowQuestion("1.2.3.4", at + i), true);
  assert.equal(await allowQuestion("1.2.3.4", at + 100), false);
  // Another visitor has a limit of its own, and the first gets questions back as the minute passes.
  assert.equal(await allowQuestion("5.6.7.8", at + 100), true);
  assert.equal(await allowQuestion("1.2.3.4", at + 60_001), true);
});

test("in the Worker, the binding decides", async () => {
  const keys: string[] = [];
  setWorkerEnv({
    AI_SEARCH_RATE_LIMITER: {
      limit: ({ key }) => {
        keys.push(key);
        return Promise.resolve({ success: false });
      },
    },
  });
  assert.equal(await allowQuestion("9.9.9.9"), false);
  assert.deepEqual(keys, ["9.9.9.9"]);
  setWorkerEnv({});
});
