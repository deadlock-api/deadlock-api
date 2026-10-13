import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, retryDelay, shouldRetry } from "./api-error";

/** An Axios-shaped error for `status` with the given response headers. */
function axiosError(status: number, headers: Record<string, string> = {}) {
  return { isAxiosError: true, response: { status, headers } };
}

/** Runs `fn` as if in the browser. */
function inBrowser<T>(fn: () => T): T {
  const global = globalThis as { window?: unknown };
  global.window = {};
  try {
    return fn();
  } finally {
    delete global.window;
  }
}

test("a busy API is retried in the browser but not on the server", () => {
  const busy = axiosError(503, { "retry-after": "5" });
  assert.equal(shouldRetry(0, busy), false);
  assert.equal(
    inBrowser(() => shouldRetry(0, busy)),
    true,
  );
  assert.equal(
    inBrowser(() => shouldRetry(3, busy)),
    false,
  );
});

test("other server errors are retried everywhere, client errors nowhere", () => {
  assert.equal(shouldRetry(0, axiosError(500)), true);
  assert.equal(shouldRetry(0, new ApiError(504, "timeout")), true);
  assert.equal(shouldRetry(0, axiosError(404)), false);
  assert.equal(
    inBrowser(() => shouldRetry(0, axiosError(429, { "retry-after": "10" }))),
    false,
  );
});

test("retries wait at least the API's Retry-After", () => {
  const busy = axiosError(503, { "retry-after": "5" });
  assert.equal(retryDelay(0, busy), 5_000);
  assert.equal(retryDelay(3, busy), 8_000);
  assert.equal(retryDelay(0, axiosError(500)), 1_000);
  assert.equal(retryDelay(10, axiosError(500)), 30_000);
  assert.equal(retryDelay(0, new Error("network")), 1_000);
});
