import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

export interface DuckDbHandle {
  db: AsyncDuckDB;
}

const registeredViews = new WeakMap<DuckDbHandle, Set<string>>();
let dbPromise: Promise<DuckDbHandle> | null = null;

export function prewarmDuckDb(): void {
  void initDuckDb();
}

export function initDuckDb(): Promise<DuckDbHandle> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const duckdb = await import("@duckdb/duckdb-wasm");
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const workerScript = `importScripts("${bundle.mainWorker}");`;
    const workerBlob = new Blob([workerScript], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    const conn = await db.connect();
    try {
      await conn.query(
        "INSTALL httpfs; LOAD httpfs; SET enable_http_metadata_cache=true; SET enable_object_cache=true;",
      );
    } finally {
      await conn.close();
    }
    const handle: DuckDbHandle = { db };
    registeredViews.set(handle, new Set());
    return handle;
  })();
  return dbPromise;
}

export function parseTableRefs(query: string): string[] {
  const seen = new Set<string>();
  const re = /\b(?:FROM|JOIN)\s+["`]?(\w+)["`]?/gi;
  let m: RegExpExecArray | null = re.exec(query);
  while (m !== null) {
    seen.add(m[1]);
    m = re.exec(query);
  }
  return [...seen];
}

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryRows {
  columns: QueryColumn[];
  rows: unknown[][];
}

export async function runDuckDbQuery(handle: DuckDbHandle, sql: string): Promise<QueryRows> {
  const conn = await handle.db.connect();
  try {
    const arrowResult = await conn.query(sql);
    const columns: QueryColumn[] = arrowResult.schema.fields.map((f) => ({
      name: f.name,
      type: String(f.type ?? "unknown"),
    }));
    const rowObjects = arrowResult.toArray() as Array<Record<string, unknown>>;
    const rows = rowObjects.map((r) => columns.map((c) => r[c.name]));
    return { columns, rows };
  } finally {
    await conn.close();
  }
}

export async function ensureViews(
  handle: DuckDbHandle,
  tableMap: Map<string, string[]>,
  names: string[],
): Promise<string[]> {
  const registered = registeredViews.get(handle) ?? new Set<string>();
  const toCreate = names.filter((n) => tableMap.has(n) && !registered.has(n));
  if (toCreate.length === 0) return [];
  const conn = await handle.db.connect();
  try {
    await Promise.all(
      toCreate.map(async (n) => {
        const urls = tableMap.get(n);
        if (!urls || urls.length === 0) return;
        await conn.query(`CREATE OR REPLACE VIEW "${n}" AS SELECT * FROM ${readParquetExpr(urls)}`);
        registered.add(n);
      }),
    );
  } finally {
    await conn.close();
  }
  registeredViews.set(handle, registered);
  return toCreate;
}

export function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

export function readParquetExpr(urls: string[]): string {
  const items = urls.map((u) => `'${escapeSqlString(u)}'`);
  const literal = items.length === 1 ? items[0] : `[${items.join(", ")}]`;
  return `read_parquet(${literal})`;
}
