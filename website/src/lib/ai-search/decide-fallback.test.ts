import assert from "node:assert/strict";
import { test } from "node:test";

import { decideRequestBody, decideWithFallback } from "./decide";

const body = decideRequestBody("haze build", { heroes: ["Haze"], enemies: [], items: [] }, ["Phantom"]);
const answers = { page: { choice: "build_flow", probabilities: { build_flow: 0.9 } } };

/** A fetch that answers each provider's URL with the given status, and records what it was sent. */
function fakeFetch(statuses: Record<string, number | "throw">) {
  const calls: { host: string; model: string }[] = [];
  // `requestDecision` passes the URL as a string and the body as JSON text.
  const fetcher = (async (url: string, init: { body: string }) => {
    const host = new URL(url).host;
    calls.push({ host, model: (JSON.parse(init.body) as { model: string }).model });
    const status = statuses[host];
    if (status === "throw") throw new Error("timeout");
    return new Response(status === 200 ? JSON.stringify({ answers }) : "nope", { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const keys = { INCEPTION_API_KEY: "a", OPENROUTER_API_KEY: "b" };

async function run(statuses: Record<string, number | "throw">, withKeys: Record<string, string | undefined> = keys) {
  const { fetcher, calls } = fakeFetch(statuses);
  const failures: string[] = [];
  const got = await decideWithFallback(body, withKeys, {
    timeoutMs: 1000,
    fetcher,
    onFailure: (provider, why) => failures.push(`${provider}: ${why}`),
  });
  return { got, calls, failures };
}

test("Inception answers, and OpenRouter is not asked", async () => {
  const { got, calls, failures } = await run({ "api.inceptionlabs.ai": 200, "openrouter.ai": 200 });
  assert.deepEqual(got, answers);
  assert.deepEqual(calls, [{ host: "api.inceptionlabs.ai", model: "mercury-decide" }]);
  assert.deepEqual(failures, []);
});

test("an empty Inception balance falls back to OpenRouter's free model", async () => {
  const { got, calls, failures } = await run({ "api.inceptionlabs.ai": 402, "openrouter.ai": 200 });
  assert.deepEqual(got, answers);
  assert.deepEqual(
    calls.map((c) => c.model),
    ["mercury-decide", "inception/mercury-decide:free"],
  );
  assert.match(failures[0], /^Inception: answered 402/);
});

test("a missing key or a request that never answers moves on too", async () => {
  const missing = await run({ "openrouter.ai": 200 }, { OPENROUTER_API_KEY: "b" });
  assert.deepEqual(missing.got, answers);
  assert.match(missing.failures[0], /INCEPTION_API_KEY is not set/);
  const timedOut = await run({ "api.inceptionlabs.ai": "throw", "openrouter.ai": 200 });
  assert.deepEqual(timedOut.got, answers);
});

test("when every provider fails there is no answer", async () => {
  const { got, failures } = await run({ "api.inceptionlabs.ai": 503, "openrouter.ai": 429 });
  assert.equal(got, undefined);
  assert.equal(failures.length, 2);
});
