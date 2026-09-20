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
type StatGroupSize = "sm" | "default";

// Each Stat resolves the group's variant and size into plain classes of its own. A child selector on the group
// (`*:data-[slot=stat]:px-4`) would outrank the one class a caller passes to a Stat.
const StatGroupContext = createContext<{ variant: StatGroupVariant; size: StatGroupSize }>({
  variant: "plain",
  size: "default",
});

const STAT_SURFACE: Record<StatGroupVariant, string> = {
  tiles: "rounded-lg border bg-card",
  joined: "bg-card",
  plain: "",
};
const STAT_PADDING: Record<StatGroupSize, string> = { sm: "px-3 py-2", default: "px-4 py-3" };

/** A group of headline numbers. Set the columns with grid classes: `className="grid-cols-2 @md:grid-cols-4"`. */
function StatGroup({
  variant = "tiles",
  size = "default",
  className,
  ...props
}: React.ComponentProps<"dl"> & VariantProps<typeof statGroupVariants> & { size?: StatGroupSize }) {
  const resolvedVariant = variant ?? "tiles";
  return (
    <StatGroupContext value={{ variant: resolvedVariant, size }}>
      <dl
        data-slot="stat-group"
        data-variant={resolvedVariant}
        data-size={size}
        className={cn(statGroupVariants({ variant: resolvedVariant }), className)}
        {...props}
      />
    </StatGroupContext>
  );
}

interface StatProps extends Omit<React.ComponentProps<"div">, "children"> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** A supporting line under the value: a sample size, a comparison, a Delta. */
  sub?: React.ReactNode;
  tone?: Tone;
  align?: "start" | "center";
}

/** One headline number with its label. Must sit inside a StatGroup, which supplies the `<dl>`. */
function Stat({ label, value, sub, tone = "neutral", align = "start", className, ...props }: StatProps) {
  const { variant, size } = use(StatGroupContext);
  return (
    <div
      data-slot="stat"
      className={cn(
        "flex min-w-0 flex-col gap-1",
        STAT_SURFACE[variant],
        variant !== "plain" && STAT_PADDING[size],
        align === "center" && "items-center text-center",
        className,
      )}
      {...props}
    >
      <dt className="max-w-full truncate eyebrow">{label}</dt>
      <dd
        className={cn(
          "max-w-full min-w-0 truncate",
          size === "sm" ? "type-value" : "type-value-lg",
          tone !== "neutral" && TONE_TEXT[tone],
        )}
      >
        {value ?? <NoValue />}
      </dd>
      {sub && <dd className="max-w-full min-w-0 text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

export { Stat, StatGroup };
