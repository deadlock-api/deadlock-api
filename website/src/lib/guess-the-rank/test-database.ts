import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { JsonCache } from "~/lib/edge-cache";
import type { D1Database, D1PreparedStatement } from "~/lib/worker-env";

// Test support: the Guess the Rank database as D1 over node:sqlite, with every migration applied.

const MIGRATIONS = path.join(import.meta.dirname, "../../../migrations/guess-the-rank");

interface Statement extends D1PreparedStatement {
  run(): Record<string, unknown>[];
}

/** D1 over node:sqlite: a batch runs its statements in order, in one transaction, like D1's. */
export function testDatabase(setup = ""): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    sqlite.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  sqlite.exec(setup);
  const prepare = (query: string, values: unknown[] = []): Statement => ({
    bind: (...next: unknown[]) => prepare(query, next),
    run: () => {
      const statement = sqlite.prepare(query);
      const params = values as (string | number)[];
      if (/^\s*select/i.test(query)) return statement.all(...params) as Record<string, unknown>[];
      statement.run(...params);
      return [];
    },
    all: async <T>() => ({ results: prepare(query, values).run() as T[] }),
  });
  return {
    prepare: (query) => prepare(query),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => ({ results: (statement as Statement).run() as T[] }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

/** An edge cache in memory, without expiry. */
export function memoryCache(): JsonCache {
  const entries = new Map<string, string>();
  return {
    get: async <T>(key: string) => {
      const entry = entries.get(key);
      return entry === undefined ? undefined : { value: JSON.parse(entry) as T };
    },
    set: async (key, value) => void entries.set(key, JSON.stringify(value)),
  };
}
