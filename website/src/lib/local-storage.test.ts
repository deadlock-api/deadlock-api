import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { readLocalStorage, writeLocalStorage } from "./local-storage";

function mockWindow(context: TestContext, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

test("optional preferences work during SSR without accessing window", () => {
  assert.equal(readLocalStorage("preference"), null);
  assert.equal(writeLocalStorage("preference", "true"), false);
});

test("optional preferences retain normal storage behavior", (context) => {
  const saved = new Map<string, string>();
  mockWindow(context, {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  });
  assert.equal(readLocalStorage("preference"), null);
  assert.equal(writeLocalStorage("preference", "true"), true);
  assert.equal(readLocalStorage("preference"), "true");
});

test("blocked access and quota errors never interrupt the caller", (context) => {
  const fail = () => {
    throw new DOMException("Storage unavailable", "SecurityError");
  };
  mockWindow(context, {
    get localStorage() {
      return fail();
    },
  });
  assert.equal(readLocalStorage("preference"), null);
  assert.equal(writeLocalStorage("preference", "true"), false);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: fail, setItem: fail } },
  });
  assert.equal(readLocalStorage("preference"), null);
  assert.equal(writeLocalStorage("preference", "true"), false);
});
