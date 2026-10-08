import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { NoValue } from "~/components/ui/no-value";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";

// A fixed locale, so the server and the browser print the same digits; thousands are grouped ("1,234").
const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>();
function numberFormat(digits: number, fraction: "fixed" | "trim"): Intl.NumberFormat {
  const key = `${digits}:${fraction}`;
  let format = NUMBER_FORMATS.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: fraction === "trim" ? 0 : digits,
      maximumFractionDigits: digits,
    });
    NUMBER_FORMATS.set(key, format);
  }
  return format;
}

interface DeltaProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** The signed change. With `format="percent"` this is a fraction: 0.031 renders as +3.1%. */
  value: number | null | undefined;
  format?: "percent" | "number";
  digits?: number;
  /** Replaces the `%` of the percent format, or follows a number: `" pp"`, `" ranks"`. */
  unit?: string;
  /**
   * What a rise means: good news (the default), bad news (deaths, time to first item), or neither, for a figure that
   * only describes (a game-wide average of kills); a neutral change keeps its arrow and loses its color.
   */
  polarity?: "higher-is-better" | "lower-is-better" | "neutral";
  /** `arrow` draws an arrow instead of the plus or minus glyph, which reads faster in dense rows. */
  sign?: "glyph" | "arrow";
  /** `badge` draws it as a square Badge in the tone's color, for table cells and stat rows. */
  display?: "text" | "badge";
  /** `fixed` always prints `digits` decimals (+3.0%); `trim` drops trailing zeros (+1,234, +12.5). */
  fraction?: "fixed" | "trim";
  /** The badge's size, with `display="badge"`. */
  size?: "sm" | "default";
}

/** A signed change, colored by direction. Zero at the displayed precision renders nothing. */
export function Delta({
  value,
  format = "percent",
  digits = 1,
  unit,
  polarity = "higher-is-better",
  sign = "glyph",
  display = "text",
  fraction = "fixed",
  size = "default",
  className,
  ...props
}: DeltaProps) {
  if (value == null || !Number.isFinite(value)) return <NoValue className={className} {...props} />;
  const arrow = sign === "arrow";
  const scale = 10 ** digits;
  // Round first so a change too small to display is hidden rather than shown as "-0.0%".
  const rounded = Math.round((format === "percent" ? value * 100 : value) * scale) / scale;
  if (rounded === 0) return null;
  const tone = polarity === "neutral" ? "muted" : toneOf(polarity === "lower-is-better" ? -rounded : rounded);
  const Arrow = rounded > 0 ? ArrowUp : ArrowDown;
  const content = (
    <>
      {arrow ? <Arrow aria-hidden="true" className="size-3 shrink-0" /> : rounded > 0 ? "+" : "\u2212"}
      {arrow && <span className="sr-only">{rounded > 0 ? "up" : "down"} </span>}
      {numberFormat(digits, fraction).format(Math.abs(rounded))}
      {unit ?? (format === "percent" ? "%" : "")}
    </>
  );
  if (display === "badge") {
    return (
      <Badge data-slot="delta" variant={tone} shape="square" size={size} className={className} {...props}>
        {content}
      </Badge>
    );
  }
  return (
    <span
      data-slot="delta"
      className={cn(
        "inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums",
        TONE_TEXT[tone],
        className,
      )}
      {...props}
    >
      {content}
    </span>
  );
}
