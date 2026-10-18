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

interface DeltaBaseProps extends Omit<React.ComponentProps<"span">, "children"> {
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
  /** `fixed` always prints `digits` decimals (+3.0%); `trim` drops trailing zeros (+1,234, +12.5). */
  fraction?: "fixed" | "trim";
  /**
   * The smallest change, in `value`'s units, that counts as a difference: a smaller one is printed muted, so only the
   * changes that stand out of the noise take a color.
   */
  threshold?: number;
  /**
   * Whether the change stands out of the noise, where the caller has a better test than a threshold (a confidence
   * interval that lies wholly on one side). Overrides `threshold`.
   */
  significant?: boolean;
  /**
   * A change that rounds to zero renders nothing by default; `visible` prints it unsigned and muted ("0.0 pp"), for a
   * column where a blank would read as missing data.
   */
  zero?: "hidden" | "visible";
}

/** `badge` draws it as a square Badge in the tone's color, for table cells and stat rows; only a badge has a `size`. */
type DeltaProps = DeltaBaseProps & ({ display?: "text"; size?: never } | { display: "badge"; size?: "sm" | "default" });

/**
 * Whether a change stands out of the noise. `clear` and `noise` are told apart by more than color (WCAG 1.4.1): a
 * clear change is set semibold, a change within the noise regular weight and muted, with "within noise" for screen
 * readers. `none`: no test was given.
 */
export type DeltaSignificance = "clear" | "noise" | "none";

const SIGNIFICANCE_WEIGHT: Record<DeltaSignificance, string> = {
  clear: "font-semibold",
  noise: "font-normal",
  none: "font-medium",
};

/**
 * A signed change, colored by direction. Zero at the displayed precision renders nothing unless `zero="visible"`.
 * With a `threshold` or `significant`, a change within the noise is muted and set lighter than a clear one.
 */
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
  threshold = 0,
  significant,
  zero = "hidden",
  className,
  ...props
}: DeltaProps) {
  if (value == null || !Number.isFinite(value)) return <NoValue className={className} {...props} />;
  const arrow = sign === "arrow";
  const scale = 10 ** digits;
  // Round first so a change too small to display is hidden rather than shown as "-0.0%".
  const rounded = Math.round((format === "percent" ? value * 100 : value) * scale) / scale;
  if (rounded === 0 && zero === "hidden") return null;
  const significance: DeltaSignificance =
    significant !== undefined
      ? significant
        ? "clear"
        : "noise"
      : threshold > 0
        ? Math.abs(value) < threshold
          ? "noise"
          : "clear"
        : "none";
  const tone =
    rounded === 0 || polarity === "neutral" || significance === "noise"
      ? "muted"
      : toneOf(polarity === "lower-is-better" ? -rounded : rounded);
  const Arrow = rounded > 0 ? ArrowUp : ArrowDown;
  // What the tone says, in words for screen readers: the color alone would leave "up" without its meaning.
  const verdict = tone === "positive" ? "better" : tone === "negative" ? "worse" : undefined;
  const content = (
    <>
      {rounded === 0 ? null : arrow ? (
        <Arrow aria-hidden="true" className="size-3 shrink-0" />
      ) : rounded > 0 ? (
        "+"
      ) : (
        "\u2212"
      )}
      {arrow && rounded !== 0 && <span className="sr-only">{rounded > 0 ? "up" : "down"} </span>}
      {numberFormat(digits, fraction).format(Math.abs(rounded))}
      {unit ?? (format === "percent" ? "%" : "")}
      {verdict && <span className="sr-only">, {verdict}</span>}
      {significance === "noise" && rounded !== 0 && <span className="sr-only">, within noise</span>}
    </>
  );
  if (display === "badge") {
    return (
      <Badge
        data-slot="delta"
        data-significance={significance}
        data-verdict={verdict}
        variant={tone}
        shape="square"
        size={size}
        className={className}
        {...props}
      >
        {content}
      </Badge>
    );
  }
  return (
    <span
      data-slot="delta"
      data-significance={significance}
      data-verdict={verdict}
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums",
        SIGNIFICANCE_WEIGHT[significance],
        TONE_TEXT[tone],
        className,
      )}
      {...props}
    >
      {content}
    </span>
  );
}
