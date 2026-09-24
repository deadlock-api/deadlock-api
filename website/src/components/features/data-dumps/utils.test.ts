import assert from "node:assert/strict";
import { test } from "node:test";

import { toCsv } from "./utils";

test("toCsv formats cells by their column type, as the grid does", () => {
  const csv = toCsv(
    [
      { name: "ts", cell: { kind: "timestamp", unit: "us", utc: false } },
      { name: "price", cell: { kind: "decimal", scale: 4 } },
      { name: "note" },
    ],
    [
      [1_704_164_645_123_456n, 31_416n, 'say "hi", twice'],
      [null, null, null],
    ],
  );
  assert.equal(csv, 'ts,price,note\n2024-01-02T03:04:05.123456,3.1416,"say ""hi"", twice"\n,,');
});
