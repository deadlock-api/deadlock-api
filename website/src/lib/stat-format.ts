export type StatFormat = "integer" | "duration" | "percent" | "decimal1" | "decimal2";

const BASE_DECIMALS: Record<Exclude<StatFormat, "duration">, number> = {
  integer: 0,
  percent: 1,
  decimal1: 1,
  decimal2: 2,
};

export function valueSpan(data: { value: number | null }[]): number {
  const values = data.map((d) => d.value).filter((v): v is number => Number.isFinite(v));
  return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
}

/**
 * Formats an axis tick with enough decimals that neighbouring ticks stay
 * distinct. `span` is the plotted data range; recharts places roughly four
 * intervals across it, so the estimated step decides the precision.
 */
export function formatAxisTick(value: number, format: StatFormat, span: number): string {
  if (format === "duration") return formatStatValue(value, format);
  const scale = format === "percent" ? 100 : 1;
  const step = (span * scale) / 4;
  const decimals = Math.min(4, Math.max(BASE_DECIMALS[format], step > 0 ? Math.ceil(-Math.log10(step)) : 0));
  const text = decimals === 0 ? Math.round(value * scale).toLocaleString("en-US") : (value * scale).toFixed(decimals);
  return format === "percent" ? `${text}%` : text;
}

export function formatStatValue(value: number | undefined | null, format: StatFormat): string {
  if (value == null || Number.isNaN(value)) return "-";
  switch (format) {
    case "integer":
      return Math.round(value).toLocaleString("en-US");
    case "duration": {
      const whole = Math.round(value);
      const minutes = Math.floor(whole / 60);
      const seconds = whole % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "decimal1":
      return value.toFixed(1);
    case "decimal2":
      return value.toFixed(2);
  }
}

/** One bucket of a stat trend: the bucket's start as a unix timestamp and the value, `null` where data is missing. */
export interface StatTrendPoint {
  date: number;
  value: number | null;
  matches?: number;
}
