import { day } from "~/dayjs";

export const BUCKET_URL = "https://s3-cache.deadlock-api.com/db-snapshot";
export const BUCKET_BASE = "https://s3-cache.deadlock-api.com";
export const BUCKET_NAME = "db-snapshot";
export const ROOT_PREFIX = "public/";

const SHARD_RE = /^(.+)_(\d+)\.parquet$/;

export function parseShardName(filename: string): { base: string; index: number } | null {
  const m = filename.match(SHARD_RE);
  return m ? { base: m[1], index: Number(m[2]) } : null;
}

export type FileExt = "parquet" | "sql" | "other";

export function getExt(key: string): FileExt {
  if (key.endsWith(".parquet")) return "parquet";
  if (key.endsWith(".sql")) return "sql";
  return "other";
}

export function formatS3Timestamp(s: string | null | undefined): string {
  return s ? day.utc(s).local().format("YYYY-MM-DD HH:mm") : "—";
}

export function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = n;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  const decimals = i === 0 ? 0 : val >= 100 ? 0 : val >= 10 ? 1 : 2;
  return `${val.toFixed(decimals)} ${units[i]}`;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function tableNameFromKey(key: string): string {
  const filename = key.replace(/\/$/, "").split("/").pop() ?? "";
  const base = filename.replace(/\.(sql|parquet)$/i, "");
  return base.replace(/_\d+$/, "");
}

export function formatCell(v: unknown, nullDisplay = "—"): string {
  if (v === null || v === undefined) return nullDisplay;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, (_, val) => (typeof val === "bigint" ? val.toString() : val));
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function escapeCsvField(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(columns: { name: string }[], rows: unknown[][]): string {
  const header = columns.map((c) => escapeCsvField(c.name)).join(",");
  const body = rows.map((r) => r.map((c) => escapeCsvField(formatCell(c, ""))).join(",")).join("\n");
  return body ? `${header}\n${body}` : header;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function deriveCsvFilename(urls: string[], fallback = "preview"): string {
  if (urls.length === 0) return `${fallback}.csv`;
  const first = urls[0].split("/").pop() ?? `${fallback}.parquet`;
  const base = first.replace(/\.parquet$/i, "");
  if (urls.length > 1) return `${base.replace(/_\d+$/, "")}.csv`;
  return `${base}.csv`;
}
