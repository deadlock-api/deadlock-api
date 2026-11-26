import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

import { type CellType, type IntervalValue, OTHER_CELL, type TimeUnit } from "~/lib/duckdb-format";

export interface DuckDbHandle {
  db: AsyncDuckDB;
}

/** Per database, each view's name and the file list it was created from. */
const registeredViews = new WeakMap<DuckDbHandle, Map<string, string>>();

/**
 * `create` run once, its promise shared by every caller while it is pending or after it resolved. A rejection is
 * forgotten, so the next call starts over instead of failing forever on a cached error.
 */
export function sharedUntilRejected<T>(create: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    const attempt = create();
    pending = attempt;
    attempt.catch(() => {
      if (pending === attempt) pending = null;
    });
    return attempt;
  };
}

export function prewarmDuckDb(): void {
  // A failed prewarm is retried by the next `initDuckDb` call; nothing waits on this one.
  initDuckDb().catch(() => undefined);
}

export function initDuckDb(): Promise<DuckDbHandle> {
  return loadDuckDb();
}

const loadDuckDb = sharedUntilRejected(async (): Promise<DuckDbHandle> => {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerScript = `importScripts("${bundle.mainWorker}");`;
  const workerBlob = new Blob([workerScript], { type: "text/javascript" });
  const workerUrl = URL.createObjectURL(workerBlob);
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  try {
    try {
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    } finally {
      URL.revokeObjectURL(workerUrl);
    }
    const conn = await db.connect();
    try {
      await conn.query(
        // icu provides the TIMESTAMP WITH TIME ZONE arithmetic (`now() - INTERVAL 20 DAY`) that the lake's
        // timestamps need, as on the API's DuckDB.
        "INSTALL httpfs; LOAD httpfs; INSTALL icu; LOAD icu; SET enable_http_metadata_cache=true; SET enable_object_cache=true;",
      );
    } finally {
      await conn.close();
    }
  } catch (e) {
    // The next call starts a fresh worker; this one would otherwise linger.
    await db.terminate().catch(() => undefined);
    throw e;
  }
  const handle: DuckDbHandle = { db };
  registeredViews.set(handle, new Map());
  return handle;
});

/**
 * The known tables a query mentions anywhere, not only right after FROM or JOIN: `FROM a, b`, subqueries and CTEs
 * all count. Identifiers are case-insensitive as in DuckDB. A table named in a string or a comment is registered
 * too, which costs one view and does no harm. A known name with a schema (`assets.heroes`) is found written out
 * with it; a dotted word also counts with each of its parts (`match_player.account_id`).
 */
export function findTableNames(query: string, known: Iterable<string>): string[] {
  const byLowerName = new Map<string, string>();
  for (const name of known) byLowerName.set(name.toLowerCase(), name);
  const found = new Set<string>();
  for (const [token] of query.matchAll(/\w+(?:\.\w+)*/g)) {
    const parts = token.toLowerCase().split(".");
    const candidates = [...parts, ...parts.map((_, i) => parts.slice(0, i + 1).join("."))];
    for (const candidate of candidates) {
      const name = byLowerName.get(candidate);
      if (name) found.add(name);
    }
  }
  return [...found];
}

/**
 * `names` with everything their views read, each after what it reads: a view is created over existing tables and
 * views. Names that are neither a table nor a view are dropped.
 */
export function viewCreationOrder(
  names: string[],
  tableMap: Map<string, string[]>,
  viewMap: Map<string, string>,
): string[] {
  const known = [...tableMap.keys(), ...viewMap.keys()];
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const sql = viewMap.get(name);
    if (sql === undefined && !tableMap.has(name)) return;
    if (sql !== undefined) for (const dep of findTableNames(sql, known)) visit(dep);
    ordered.push(name);
  };
  for (const name of names) visit(name);
  return ordered;
}

/** `assets.heroes` as `"assets"."heroes"`. */
function quoteQualifiedName(name: string): string {
  return name
    .split(".")
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(".");
}

export interface QueryColumn {
  name: string;
  type: string;
  /** How the column's values were read and are to be printed (`formatDuckDbValue`). */
  cell: CellType;
}

/** The parts of an Arrow type and vector this reader relies on; `apache-arrow` is not a direct dependency. */
interface ArrowType {
  typeId: number;
  unit?: number;
  scale?: number;
  timezone?: string | null;
  children?: { name: string; type: ArrowType }[];
}

interface ArrowData {
  offset: number;
  length: number;
  values: ArrayLike<number | bigint>;
}

interface ArrowVector {
  type: ArrowType;
  length: number;
  data: ArrowData[];
  isValid(index: number): boolean;
  get(index: number): unknown;
  getChildAt(index: number): ArrowVector | null;
}

// Arrow's `Type`, `TimeUnit`, `DateUnit` and `IntervalUnit` enums.
const ARROW_BINARY = 4;
const ARROW_DECIMAL = 7;
const ARROW_DATE = 8;
const ARROW_TIME = 9;
const ARROW_TIMESTAMP = 10;
const ARROW_INTERVAL = 11;
const ARROW_LIST = 12;
const ARROW_STRUCT = 13;
const ARROW_FIXED_SIZE_BINARY = 15;
const ARROW_FIXED_SIZE_LIST = 16;
const ARROW_LARGE_BINARY = 19;
const TIME_UNITS: TimeUnit[] = ["s", "ms", "us", "ns"];
const DATE_UNIT_DAY = 0;
const INTERVAL_YEAR_MONTH = 0;
const INTERVAL_DAY_TIME = 1;

export function cellTypeOf(type: ArrowType): CellType {
  switch (type.typeId) {
    case ARROW_TIMESTAMP:
      return { kind: "timestamp", unit: TIME_UNITS[type.unit ?? 1] ?? "ms", utc: Boolean(type.timezone) };
    case ARROW_DATE:
      return { kind: "date" };
    case ARROW_TIME:
      return { kind: "time", unit: TIME_UNITS[type.unit ?? 1] ?? "ms" };
    case ARROW_DECIMAL:
      return { kind: "decimal", scale: type.scale ?? 0 };
    case ARROW_INTERVAL:
      return { kind: "interval" };
    case ARROW_BINARY:
    case ARROW_LARGE_BINARY:
    case ARROW_FIXED_SIZE_BINARY:
      return { kind: "binary" };
    case ARROW_LIST:
    case ARROW_FIXED_SIZE_LIST: {
      const item = type.children?.[0]?.type;
      return { kind: "list", item: item ? cellTypeOf(item) : OTHER_CELL };
    }
    case ARROW_STRUCT:
      return {
        kind: "struct",
        fields: (type.children ?? []).map((f) => ({ name: f.name, type: cellTypeOf(f.type) })),
      };
    default:
      return OTHER_CELL;
  }
}

/** The raw stored value of row `index`: Arrow's getters overflow on some of them (an infinite timestamp throws). */
function rawValue(vector: ArrowVector, index: number, stride = 1, lane = 0): number | bigint {
  let i = index;
  for (const chunk of vector.data) {
    if (i < chunk.length) return chunk.values[(chunk.offset + i) * stride + lane];
    i -= chunk.length;
  }
  throw new RangeError(`Row ${index} is out of range`);
}

function readInterval(vector: ArrowVector, index: number): IntervalValue {
  const unit = vector.type.unit;
  if (unit === INTERVAL_YEAR_MONTH) return { months: Number(rawValue(vector, index)), days: 0, nanos: 0n };
  if (unit === INTERVAL_DAY_TIME) {
    const ms = Number(rawValue(vector, index, 2, 1));
    return { months: 0, days: Number(rawValue(vector, index, 2, 0)), nanos: BigInt(ms) * 1_000_000n };
  }
  // MONTH_DAY_NANO: two int32 and an int64, read as four int32 lanes (Arrow 17's getter reads the wrong stride).
  const low = BigInt(Number(rawValue(vector, index, 4, 2)) >>> 0);
  const high = BigInt(Number(rawValue(vector, index, 4, 3)));
  return {
    months: Number(rawValue(vector, index, 4, 0)),
    days: Number(rawValue(vector, index, 4, 1)),
    nanos: BigInt.asIntN(64, (high << 32n) | low),
  };
}

function readCellValue(vector: ArrowVector, index: number, cell: CellType): unknown {
  if (!vector.isValid(index)) return null;
  switch (cell.kind) {
    case "timestamp":
    case "time":
      return BigInt(rawValue(vector, index));
    case "date":
      return vector.type.unit === DATE_UNIT_DAY
        ? Number(rawValue(vector, index))
        : Math.floor(Number(vector.get(index)) / 86_400_000);
    case "decimal":
      // Arrow's decimal value prints as its unscaled integer, sign included.
      return BigInt(String(vector.get(index)));
    case "interval":
      return readInterval(vector, index);
    case "list": {
      const items = vector.get(index) as ArrowVector;
      return Array.from({ length: items.length }, (_, k) => readCell(items, k, cell.item));
    }
    case "struct":
      return cell.fields.map((f, k) => {
        const child = vector.getChildAt(k);
        return child ? readCell(child, index, f.type) : null;
      });
    default:
      return vector.get(index);
  }
}

/** One cell as `formatDuckDbValue` expects it for `cell`. A value Arrow cannot decode reads as a marker, not NULL. */
function readCell(vector: ArrowVector, index: number, cell: CellType): unknown {
  try {
    return readCellValue(vector, index, cell);
  } catch {
    return "<unreadable>";
  }
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
    const columns: QueryColumn[] = fields.map((f) => ({
      name: f.name,
      type: String(f.type ?? "unknown"),
      cell: cellTypeOf(f.type as unknown as ArrowType),
    }));
    const rows: unknown[][] = [];
    let truncated = false;
    batches: for await (const batch of reader) {
      if (signal?.aborted) throw new QueryCancelledError();
      const vectors = fields.map((_, j) => batch.getChildAt(j) as unknown as ArrowVector | null);
      for (let i = 0; i < batch.numRows; i++) {
        if (rows.length >= maxRows) {
          truncated = true;
          break batches;
        }
        rows.push(vectors.map((v, j) => (v ? readCell(v, i, columns[j].cell) : null)));
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

/**
 * Creates the views `names` need: one over the files of each table, and the manifest's own views (`viewMap`, name to
 * SELECT) after the tables and views they read. Returns the names it created.
 */
export async function ensureViews(
  handle: DuckDbHandle,
  tableMap: Map<string, string[]>,
  names: string[],
  viewMap: Map<string, string> = new Map(),
): Promise<string[]> {
  const registered = registeredViews.get(handle) ?? new Map<string, string>();
  // The lake is re-exported hourly and the manifest refetched; a view over last hour's files would miss new rows or
  // point at removed ones, so it is recreated whenever its file list (or a manifest view's SQL) changes.
  const definition = (n: string) => {
    const urls = tableMap.get(n);
    if (urls) return urls.length > 0 ? `SELECT * FROM ${readParquetExpr(urls)}` : undefined;
    return viewMap.get(n);
  };
  const toCreate = viewCreationOrder(names, tableMap, viewMap).filter((n) => {
    const sql = definition(n);
    return sql !== undefined && registered.get(n) !== sql;
  });
  if (toCreate.length === 0) return [];
  const conn = await handle.db.connect();
  try {
    const create = async (n: string) => {
      const sql = definition(n);
      if (sql === undefined) return;
      const schema = n.includes(".") ? n.slice(0, n.lastIndexOf(".")) : null;
      if (schema) await conn.query(`CREATE SCHEMA IF NOT EXISTS ${quoteQualifiedName(schema)}`);
      await conn.query(`CREATE OR REPLACE VIEW ${quoteQualifiedName(n)} AS ${sql}`);
      registered.set(n, sql);
    };
    // Tables read only files, so they go in parallel; manifest views in order, each after what it reads.
    await Promise.all(toCreate.filter((n) => tableMap.has(n)).map(create));
    for (const n of toCreate.filter((name) => !tableMap.has(name))) {
      // oxlint-disable-next-line no-await-in-loop -- a view is created after the views it reads
      await create(n);
    }
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
