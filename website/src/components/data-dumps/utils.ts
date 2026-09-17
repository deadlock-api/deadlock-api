import { day } from "~/dayjs";

export const LAKE_URL = "https://data.deadlock-api.com";
export const MANIFEST_URL = `${LAKE_URL}/v1/manifest.json`;
export const CATALOG_URL = `${LAKE_URL}/v1/catalog.ducklake`;

export function formatTimestamp(s: string | null | undefined): string {
  return s ? day.utc(s).local().format("YYYY-MM-DD HH:mm") : "—";
}

export function formatUnix(seconds: number | null | undefined): string {
  return seconds ? day.unix(seconds).local().format("YYYY-MM-DD HH:mm") : "—";
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

export function formatRows(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
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
