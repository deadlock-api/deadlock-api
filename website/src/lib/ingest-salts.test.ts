import assert from "node:assert/strict";
import { test } from "node:test";

import type { Salts } from "./ingest-cache-scanner";
import { dedupeSalts, MAX_SALTS_PER_REQUEST, toBatches, uploadInBatches } from "./ingest-salts";

function meta(match_id: number, salt: number, cluster_id = 1): Salts {
  return { match_id, cluster_id, metadata_salt: salt, replay_salt: null };
}

function replay(match_id: number, salt: number, cluster_id = 1): Salts {
  return { match_id, cluster_id, metadata_salt: null, replay_salt: salt };
}

test("dedupeSalts keeps one entry for a match found in several cache files", () => {
  const result = dedupeSalts([meta(10, 111), meta(10, 111), meta(10, 111), meta(20, 222)]);
  assert.deepEqual(result, [meta(10, 111), meta(20, 222)]);
});

test("dedupeSalts merges the metadata and replay salts of one match", () => {
  const result = dedupeSalts([meta(10, 111), replay(10, 999)]);
  assert.deepEqual(result, [{ match_id: 10, cluster_id: 1, metadata_salt: 111, replay_salt: 999 }]);
});

test("dedupeSalts keeps the first salt of a kind and fills in the other", () => {
  const result = dedupeSalts([replay(10, 999), meta(10, 111), meta(10, 112)]);
  assert.deepEqual(result, [{ match_id: 10, cluster_id: 1, metadata_salt: 111, replay_salt: 999 }]);
});

test("dedupeSalts keeps a match served from two clusters apart", () => {
  assert.equal(dedupeSalts([meta(10, 111, 1), meta(10, 111, 2)]).length, 2);
});

test("dedupeSalts does not change the entries it was given", () => {
  const first = meta(10, 111);
  dedupeSalts([first, replay(10, 999)]);
  assert.equal(first.replay_salt, null);
});

test("dedupeSalts of nothing is nothing", () => {
  assert.deepEqual(dedupeSalts([]), []);
});

test("toBatches splits at the API's limit of 1000", () => {
  const items = Array.from({ length: 2345 }, (_, i) => i);
  const batches = toBatches(items);
  assert.equal(MAX_SALTS_PER_REQUEST, 1000);
  assert.deepEqual(
    batches.map((b) => b.length),
    [1000, 1000, 345],
  );
  assert.deepEqual(batches.flat(), items);
});

test("toBatches gives exactly one full batch at the limit and none for nothing", () => {
  assert.equal(toBatches(Array.from({ length: 1000 }, (_, i) => i)).length, 1);
  assert.deepEqual(toBatches([]), []);
  assert.throws(() => toBatches([1], 0), RangeError);
});

const many = (n: number) => Array.from({ length: n }, (_, i) => meta(i + 1, i + 1));

test("uploadInBatches sends every batch and sums what the API reports as new", async () => {
  const sizes: number[] = [];
  const progress: number[] = [];
  const summary = await uploadInBatches(
    many(2500),
    async (batch) => {
      sizes.push(batch.length);
      return { ok: true, ingested: 10 };
    },
    (handled) => progress.push(handled),
  );
  assert.deepEqual(sizes, [1000, 1000, 500]);
  assert.deepEqual(progress, [1000, 2000, 2500]);
  assert.deepEqual(summary, { sent: 2500, failed: 0, ingested: 30, error: null });
});

test("uploadInBatches keeps going after a failed batch and reports the first error", async () => {
  let call = 0;
  const summary = await uploadInBatches(many(2500), async () => {
    call += 1;
    if (call === 2) return { ok: false, error: "HTTP 500" };
    if (call === 3) throw new Error("network down");
    return { ok: true, ingested: null };
  });
  assert.deepEqual(summary, { sent: 1000, failed: 1500, ingested: 0, error: "HTTP 500" });
});

test("uploadInBatches sends nothing when there is nothing", async () => {
  let calls = 0;
  const summary = await uploadInBatches([], async () => {
    calls += 1;
    return { ok: true, ingested: 0 };
  });
  assert.equal(calls, 0);
  assert.deepEqual(summary, { sent: 0, failed: 0, ingested: 0, error: null });
});
