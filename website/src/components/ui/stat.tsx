import { cva, type VariantProps } from "class-variance-authority";
import { createContext, use } from "react";

import { NoValue } from "~/components/ui/no-value";
import { TONE_TEXT, type Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";

const statGroupVariants = cva("grid min-w-0", {
  variants: {
    variant: {
      /** Separate bordered tiles. */
      tiles: "gap-3",
      /** One bordered block, the cells divided by hairlines. */
      joined: "gap-px overflow-hidden rounded-lg border bg-border",
      /** No chrome, for use inside a Card. */
      plain: "gap-3",
    },
  },
  defaultVariants: { variant: "tiles" },
});

type StatGroupVariant = NonNullable<VariantProps<typeof statGroupVariants>["variant"]>;
type StatGroupSize = "xs" | "sm" | "default";
/** `truncate` keeps every tile one line (a dense header); `wrap` lets a long label or value (a name, a date) take more lines. */
type StatGroupOverflow = "truncate" | "wrap";

// Each Stat resolves the group's variant and size into plain classes of its own. A child selector on the group
// (`*:data-[slot=stat]:px-4`) would outrank the one class a caller passes to a Stat.
const StatGroupContext = createContext<{ variant: StatGroupVariant; size: StatGroupSize; overflow: StatGroupOverflow }>(
  {
    variant: "plain",
    size: "default",
    overflow: "truncate",
  },
);

const STAT_SURFACE: Record<StatGroupVariant, string> = {
  tiles: "rounded-lg border bg-card",
  joined: "bg-card",
  plain: "",
};
const STAT_PADDING: Record<StatGroupSize, string> = { xs: "px-2 py-1.5", sm: "px-3 py-2", default: "px-4 py-3" };
const STAT_VALUE: Record<StatGroupSize, string> = { xs: "type-value-sm", sm: "type-value", default: "type-value-lg" };
const STAT_OVERFLOW: Record<StatGroupOverflow, string> = { truncate: "truncate", wrap: "text-balance break-words" };
const STAT_ALIGN = { start: "", center: "items-center text-center", end: "items-end text-end" };

/**
 * A group of headline numbers. Set the columns with grid classes: `className="grid-cols-2 @md:grid-cols-4"`. `size`:
 * default for a page's headline, sm for a panel, xs for a dense header or a small panel (values at body size).
 * `overflow`: truncate (default) keeps each label and value on one line; wrap lets them break onto more lines, for
 * values that are words (a hero, a rank, a date) in tiles that may be narrow.
 */
function StatGroup({
  variant = "tiles",
  size = "default",
  overflow = "truncate",
  className,
  ...props
}: React.ComponentProps<"dl"> &
  VariantProps<typeof statGroupVariants> & { size?: StatGroupSize; overflow?: StatGroupOverflow }) {
  const resolvedVariant = variant ?? "tiles";
  return (
    <StatGroupContext value={{ variant: resolvedVariant, size, overflow }}>
      <dl
        data-slot="stat-group"
        data-variant={resolvedVariant}
        data-size={size}
        data-overflow={overflow}
        className={cn(statGroupVariants({ variant: resolvedVariant }), className)}
        {...props}
      />
    </StatGroupContext>
  );
}

// No `title`: a native tooltip is hint text a touch screen never shows. A Stat says what it is through its label.
interface StatProps extends Omit<React.ComponentProps<"div">, "children" | "title"> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** A supporting line under the value: a sample size, a comparison, a Delta. */
  sub?: React.ReactNode;
  tone?: Tone;
  /** `end` for a stat at the end of a header row, its value lined up with the edge. */
  align?: keyof typeof STAT_ALIGN;
  /** A small glyph before the label (a `GameIcon`, a lucide icon). Decorative: the label names the number. */
  icon?: React.ReactNode;
}

/** One headline number with its label. Must sit inside a StatGroup, which supplies the `<dl>`. */
function Stat({ label, value, sub, tone, align = "start", icon, className, ...props }: StatProps) {
  const { variant, size, overflow } = use(StatGroupContext);
  return (
    <div
      data-slot="stat"
      className={cn(
        "flex min-w-0 flex-col gap-1",
        STAT_SURFACE[variant],
        variant !== "plain" && STAT_PADDING[size],
        STAT_ALIGN[align],
        className,
      )}
      {...props}
    >
      <dt className={cn("max-w-full type-caption font-medium text-muted-foreground", STAT_OVERFLOW[overflow])}>
        {/* Inline, so the label's own alignment (start, centred) and truncation carry the glyph with it. */}
        {icon != null && (
          <span data-slot="stat-icon" aria-hidden="true" className="inline-flex pe-1.5 align-middle [&_svg]:size-4">
            {icon}
          </span>
        )}
        {label}
      </dt>
      <dd className={cn("max-w-full min-w-0", STAT_OVERFLOW[overflow], STAT_VALUE[size], tone && TONE_TEXT[tone])}>
        {value ?? <NoValue />}
      </dd>
      {sub && <dd className="max-w-full min-w-0 text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

export { Stat, StatGroup };
