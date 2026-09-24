/**
 * How a DuckDB result value is shown. Arrow hands most types over in a machine form (a timestamp as epoch
 * microseconds, a DECIMAL as its unscaled integer), so each column carries the type it came from and the value is
 * formatted by that type, the way DuckDB's own shell would print it.
 */

export type TimeUnit = "s" | "ms" | "us" | "ns";

export interface IntervalValue {
  months: number;
  days: number;
  nanos: bigint;
}

/** The shape of a column's values after reading, and how to print them. */
export type CellType =
  /** A bigint count of `unit` since the epoch. */
  | { kind: "timestamp"; unit: TimeUnit; utc: boolean }
  /** A number of days since the epoch. */
  | { kind: "date" }
  /** A bigint count of `unit` since midnight. */
  | { kind: "time"; unit: TimeUnit }
  /** The unscaled bigint: 31416n at scale 4 is 3.1416. */
  | { kind: "decimal"; scale: number }
  | { kind: "interval" }
  /** A Uint8Array. */
  | { kind: "binary" }
  /** An array of values of `item`. */
  | { kind: "list"; item: CellType }
  /** An array of the field values, in field order. */
  | { kind: "struct"; fields: { name: string; type: CellType }[] }
  | { kind: "other" };

export const OTHER_CELL: CellType = { kind: "other" };

const PER_SECOND: Record<TimeUnit, bigint> = { s: 1n, ms: 1_000n, us: 1_000_000n, ns: 1_000_000_000n };
const FRACTION_DIGITS: Record<TimeUnit, number> = { s: 0, ms: 3, us: 6, ns: 9 };
/** DuckDB's infinite timestamps and dates, stored as the largest magnitudes of their integer types. */
const INFINITE_TIMESTAMP = 9_223_372_036_854_775_807n;
const INFINITE_DATE = 2_147_483_647;
/** The range a JS Date can hold, in seconds. */
const MAX_DATE_SECONDS = 8_640_000_000_000n;

function toBigInt(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
  return null;
}

/** ".5" for 500 ms, "" for a whole second: trailing zeros go, as in DuckDB. */
function fraction(remainder: bigint, unit: TimeUnit): string {
  if (remainder === 0n) return "";
  return `.${remainder.toString().padStart(FRACTION_DIGITS[unit], "0").replace(/0+$/, "")}`;
}

function pad2(n: bigint | number): string {
  return n.toString().padStart(2, "0");
}

export function formatTimestamp(raw: bigint, unit: TimeUnit, utc: boolean): string {
  if (raw === INFINITE_TIMESTAMP) return "infinity";
  if (raw === -INFINITE_TIMESTAMP) return "-infinity";
  const per = PER_SECOND[unit];
  let seconds = raw / per;
  let remainder = raw % per;
  if (remainder < 0n) {
    seconds -= 1n;
    remainder += per;
  }
  if (seconds > MAX_DATE_SECONDS || seconds < -MAX_DATE_SECONDS) return raw.toString();
  const whole = new Date(Number(seconds) * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  return `${whole}${fraction(remainder, unit)}${utc ? "Z" : ""}`;
}

export function formatDate(days: number): string {
  if (days === INFINITE_DATE) return "infinity";
  if (days === -INFINITE_DATE) return "-infinity";
  if (Math.abs(days) > 100_000_000) return String(days);
  return new Date(days * 86_400_000).toISOString().split("T")[0];
}

export function formatTime(raw: bigint, unit: TimeUnit): string {
  const per = PER_SECOND[unit];
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const total = abs / per;
  const clock = `${pad2(total / 3600n)}:${pad2((total / 60n) % 60n)}:${pad2(total % 60n)}`;
  return `${negative ? "-" : ""}${clock}${fraction(abs % per, unit)}`;
}

export function formatDecimal(unscaled: bigint, scale: number): string {
  if (scale <= 0) return unscaled.toString();
  const negative = unscaled < 0n;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;
}

/** "1 year 2 months 3 days 04:05:06.5", as DuckDB prints an INTERVAL. */
export function formatInterval({ months, days, nanos }: IntervalValue): string {
  const parts: string[] = [];
  const years = Math.trunc(months / 12);
  const restMonths = months % 12;
  if (years !== 0) parts.push(plural(years, "year"));
  if (restMonths !== 0) parts.push(plural(restMonths, "month"));
  if (days !== 0) parts.push(plural(days, "day"));
  if (nanos !== 0n || parts.length === 0) parts.push(formatTime(nanos, "ns"));
  return parts.join(" ");
}

/** Printable ASCII as is, every other byte as \xHH, as DuckDB prints a BLOB. */
export function formatBinary(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out +=
      b >= 0x20 && b <= 0x7e && b !== 0x5c
        ? String.fromCodePoint(b)
        : `\\x${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

function formatOther(v: unknown): string {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null) {
    try {
      return JSON.stringify(v, (_, val) => (typeof val === "bigint" ? val.toString() : val));
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** A value inside a LIST or STRUCT: strings quoted, NULL spelled out. */
function formatNested(v: unknown, type: CellType): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "string" && type.kind === "other") return `'${v}'`;
  return formatValue(v, type);
}

function formatValue(v: unknown, type: CellType): string {
  switch (type.kind) {
    case "timestamp": {
      const raw = toBigInt(v);
      return raw === null ? formatOther(v) : formatTimestamp(raw, type.unit, type.utc);
    }
    case "date":
      return typeof v === "number" ? formatDate(v) : formatOther(v);
    case "time": {
      const raw = toBigInt(v);
      return raw === null ? formatOther(v) : formatTime(raw, type.unit);
    }
    case "decimal": {
      const raw = toBigInt(v);
      return raw === null ? formatOther(v) : formatDecimal(raw, type.scale);
    }
    case "interval":
      return typeof v === "object" && v !== null && "months" in v ? formatInterval(v as IntervalValue) : formatOther(v);
    case "binary":
      return v instanceof Uint8Array ? formatBinary(v) : formatOther(v);
    case "list":
      return Array.isArray(v) ? `[${v.map((item) => formatNested(item, type.item)).join(", ")}]` : formatOther(v);
    case "struct":
      return Array.isArray(v)
        ? `{${type.fields.map((f, i) => `'${f.name}': ${formatNested(v[i], f.type)}`).join(", ")}}`
        : formatOther(v);
    default:
      return formatOther(v);
  }
}

/** The text of one result cell. `nullDisplay` stands in for SQL NULL. */
export function formatDuckDbValue(v: unknown, type: CellType = OTHER_CELL, nullDisplay = "—"): string {
  if (v === null || v === undefined) return nullDisplay;
  return formatValue(v, type);
}
