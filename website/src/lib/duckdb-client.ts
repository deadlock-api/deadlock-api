import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

export interface DuckDbHandle {
  db: AsyncDuckDB;
}

/** Per database, each view's name and the file list it was created from. */
const registeredViews = new WeakMap<DuckDbHandle, Map<string, string>>();
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
    registeredViews.set(handle, new Map());
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
  /** More rows exist than `maxRows`; they were never read. */
  truncated: boolean;
}

export interface RunQueryOptions {
  /** Rows to read at most. The rest of the result is never materialized, so a 15M-row table costs one batch. */
  maxRows?: number;
  /** Aborting cancels the query inside DuckDB and rejects with `QueryCancelledError`. */
  signal?: AbortSignal;
}

export class QueryCancelledError extends Error {
  constructor() {
    super("Query cancelled");
    this.name = "QueryCancelledError";
  }
}

export async function runDuckDbQuery(
  handle: DuckDbHandle,
  sql: string,
  { maxRows = Number.POSITIVE_INFINITY, signal }: RunQueryOptions = {},
): Promise<QueryRows> {
  if (signal?.aborted) throw new QueryCancelledError();
  const conn = await handle.db.connect();
  // The worker polls a pending query in small steps, so a cancel queued between two polls stops it.
  const onAbort = () => {
    conn.cancelSent().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    // A streamed result is produced batch by batch as it is read: stopping after `maxRows` leaves the rest unread.
    const reader = await conn.send(sql, true);
    // Opening reads the schema message, so an empty result still has its columns.
    await reader.open();
    const fields = reader.schema.fields;
    const columns: QueryColumn[] = fields.map((f) => ({ name: f.name, type: String(f.type ?? "unknown") }));
    const rows: unknown[][] = [];
    let truncated = false;
    batches: for await (const batch of reader) {
      if (signal?.aborted) throw new QueryCancelledError();
      const vectors = fields.map((_, j) => batch.getChildAt(j));
      for (let i = 0; i < batch.numRows; i++) {
        if (rows.length >= maxRows) {
          truncated = true;
          break batches;
        }
        rows.push(vectors.map((v) => v?.get(i) ?? null));
      }
    }
    if (signal?.aborted) throw new QueryCancelledError();
    return { columns, rows, truncated };
  } catch (e) {
    if (signal?.aborted) throw new QueryCancelledError();
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await conn.close();
  }
}

export async function ensureViews(
  handle: DuckDbHandle,
  tableMap: Map<string, string[]>,
  names: string[],
): Promise<string[]> {
  const registered = registeredViews.get(handle) ?? new Map<string, string>();
  // The lake is re-exported hourly and the manifest refetched; a view over last hour's files would miss new rows or
  // point at removed ones, so it is recreated whenever its file list changes.
  const toCreate = names.filter((n) => {
    const urls = tableMap.get(n);
    return urls && urls.length > 0 && registered.get(n) !== urls.join("\n");
  });
  if (toCreate.length === 0) return [];
  const conn = await handle.db.connect();
  try {
    await Promise.all(
      toCreate.map(async (n) => {
        const urls = tableMap.get(n);
        if (!urls || urls.length === 0) return;
        await conn.query(`CREATE OR REPLACE VIEW "${n}" AS SELECT * FROM ${readParquetExpr(urls)}`);
        registered.set(n, urls.join("\n"));
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
