import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeChartTargetProps } from "./chart-target";

test("mergeChartTargetProps runs the second handler only when the first left the event alone", () => {
  let calls = 0;
  const merged = mergeChartTargetProps(
    {
      onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        if (event.key === "+") event.preventDefault();
      },
    },
    { onKeyDown: () => calls++ },
  );
  const press = (key: string) => {
    const event = { key, defaultPrevented: false, preventDefault: () => (event.defaultPrevented = true) };
    merged.onKeyDown(event);
  };
  press("+");
  assert.equal(calls, 0);
  press("ArrowLeft");
  assert.equal(calls, 1);
});

test("mergeChartTargetProps keeps the first's props and joins the classes", () => {
  const merged = mergeChartTargetProps(
    { "data-slot": "zoom", className: "a", tabIndex: 0 },
    { "data-slot": "probe", className: "b", tabIndex: 0 },
  );
  assert.equal(merged["data-slot"], "zoom");
  assert.equal(merged.className, "a b");
});
