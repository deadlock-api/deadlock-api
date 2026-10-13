import assert from "node:assert/strict";
import { test } from "node:test";

import { createApiClient } from "./create-api-client";

const API_ORIGIN = "https://api.example.test";

test("server fetch requests preserve runtime cache defaults and JSON responses", async () => {
  const client = createApiClient(1_000, API_ORIGIN);
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
  const client = createApiClient(1_000, API_ORIGIN);
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
  const client = createApiClient(1_000, API_ORIGIN);
  await assert.rejects(
    client.get("https://api.example.test/unavailable", {
      adapter: "fetch",
      env: { fetch: async () => Response.json({ error: "unavailable" }, { status: 503 }) },
    }),
    { name: "AxiosError", status: 503 },
  );
});

test("server requests to the API carry the website's key, requests elsewhere do not", async () => {
  process.env.DEADLOCK_API_KEY = "website-key";
  try {
    const client = createApiClient(1_000, API_ORIGIN);
    const keyFor = async (url: string) => {
      let key: string | null = null;
      await client.get(url, {
        adapter: "fetch",
        env: {
          fetch: async (_input, init) => {
            key = new Headers(init?.headers).get("X-API-Key");
            return Response.json({});
          },
        },
      });
      return key;
    };
    assert.equal(await keyFor(`${API_ORIGIN}/v1/info`), "website-key");
    assert.equal(await keyFor("https://api.example.test.evil.test/v1/info"), null);
    assert.equal(await keyFor("https://assets.example.test/heroes"), null);
  } finally {
    delete process.env.DEADLOCK_API_KEY;
  }
});
