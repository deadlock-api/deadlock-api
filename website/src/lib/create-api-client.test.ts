import assert from "node:assert/strict";
import { test } from "node:test";

import { createApiClient } from "./create-api-client";

test("server fetch requests preserve runtime cache defaults and JSON responses", async () => {
  const client = createApiClient(1_000);
  const response = await client.get("https://assets.example.test/heroes", {
    adapter: "fetch",
    params: { language: "english" },
    env: {
      fetch: async (input, init) => {
        assert.equal(input, "https://assets.example.test/heroes?language=english");
        assert.equal(init?.cache, undefined);
        assert.equal(init?.method, "GET");
        assert.equal(new Headers(init?.headers).get("Accept"), "application/json");
        assert.ok(init?.signal instanceof AbortSignal);
        return Response.json([{ id: 1, name: "Infernus" }]);
      },
    },
  });

  assert.deepEqual(response.data, [{ id: 1, name: "Infernus" }]);
});

test("server fetch requests retain JSON bodies and request headers", async () => {
  const client = createApiClient(1_000);
  await client.post(
    "https://api.example.test/query",
    { account_id: 123 },
    {
      adapter: "fetch",
      headers: { "X-Request-Id": "tracker-test" },
      env: {
        fetch: async (input, init) => {
          assert.equal(input, "https://api.example.test/query");
          assert.equal(init?.method, "POST");
          assert.equal(init?.body, '{"account_id":123}');
          const headers = new Headers(init?.headers);
          assert.equal(headers.get("Content-Type"), "application/json");
          assert.equal(headers.get("X-Request-Id"), "tracker-test");
          return Response.json({ ok: true });
        },
      },
    },
  );
});

test("server fetch requests continue to reject unsuccessful HTTP responses", async () => {
  const client = createApiClient(1_000);
  await assert.rejects(
    client.get("https://api.example.test/unavailable", {
      adapter: "fetch",
      env: { fetch: async () => Response.json({ error: "unavailable" }, { status: 503 }) },
    }),
    { name: "AxiosError", status: 503 },
  );
});
