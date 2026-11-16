const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** A big count in a few characters: 1.2M, 340K. */
export function formatCompact(value: number): string {
  return value < 1000 ? Math.round(value).toLocaleString("en-US") : COMPACT.format(value);
}

/** A duration of a request: 14 ms, 2.3 s. */
export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Bytes in the largest unit that keeps it above 1: 820 MB, 1.4 GB. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Three latency percentiles in one line: "23 / 123 / 645 ms", each with its own unit once one passes a second. */
export function formatLatency({ p50, p90, p99 }: { p50: number; p90: number; p99: number }): string {
  if (p99 < 1000) return `${Math.round(p50)} / ${Math.round(p90)} / ${Math.round(p99)} ms`;
  return [p50, p90, p99].map(formatMs).join(" / ");
}
