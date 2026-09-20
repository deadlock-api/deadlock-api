import { cva, type VariantProps } from "class-variance-authority";
import { PinIcon } from "lucide-react";

import { RateBar } from "~/components/ui/rate-bar";
import { FOCUS_RING } from "~/components/ui/recipes";
import { Tooltip } from "~/components/ui/tooltip";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";

const graphNodeCardVariants = cva(
  [
    FOCUS_RING,
    "relative flex flex-col justify-center gap-1.5 rounded-lg border border-s-2 border-border bg-card/90 p-2 text-start backdrop-blur-sm transition duration-normal ease-standard",
  ],
  {
    variants: {
      /** The category on the left edge: an item's shop slot, or which of the hero's four abilities this is. */
      accent: {
        none: "border-s-muted-foreground",
        weapon: "border-s-item-weapon",
        vitality: "border-s-item-vitality",
        spirit: "border-s-item-spirit",
        "ability-1": "border-s-chart-4",
        "ability-2": "border-s-chart-2",
        "ability-3": "border-s-chart-6",
        "ability-4": "border-s-chart-5",
      },
      dimmed: { true: "opacity-30", false: "" },
    },
    defaultVariants: { accent: "none", dimmed: false },
  },
);

type Accent = NonNullable<VariantProps<typeof graphNodeCardVariants>["accent"]>;

/** Opacity steps for `emphasis`, faintest first. */
const EMPHASIS = ["opacity-60", "opacity-70", "opacity-80", "opacity-90", "opacity-100"] as const;

const ACCENT_TINT: Record<Accent, string> = {
  none: "",
  weapon: "bg-item-weapon/10",
  vitality: "bg-item-vitality/10",
  spirit: "bg-item-spirit/10",
  "ability-1": "bg-chart-4/10",
  "ability-2": "bg-chart-2/10",
  "ability-3": "bg-chart-6/10",
  "ability-4": "bg-chart-5/10",
};

function RateRow({
  label,
  rate,
  fill,
  color,
  className,
}: {
  label: string;
  rate: number;
  fill: number;
  color: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-3xs">
      <span className="w-4 shrink-0 font-medium text-muted-foreground">{label}</span>
      <RateBar rate={fill} color={color} className="flex-1" />
      <span className={cn("w-9 shrink-0 text-end font-semibold tabular-nums", className)}>
        {(rate * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/**
 * One node of a build graph (item flow, ability order): image, name, a meta line and the win and pick rate as
 * mini-bars. With `onClick` it is a button (lock, focus); without, a plain block. The graph owns the placement:
 * position and size arrive through `className` and `style`.
 */
export function GraphNodeCard({
  media,
  name,
  meta,
  status,
  winRate,
  pickRate,
  winRateFill = winRate,
  pickRateFill = pickRate,
  accent,
  fill = "card",
  selected = false,
  dimmed,
  emphasis = 1,
  tooltip,
  tooltipSide = "top",
  className,
  onClick,
  ...props
}: Omit<React.ComponentProps<"button">, "children" | "name" | "type" | "disabled"> &
  VariantProps<typeof graphNodeCardVariants> & {
    /** The entity's image; a muted block when the node has none (a root). */
    media?: React.ReactNode;
    name: React.ReactNode;
    /** Under the name: tier badge, cost, points. */
    meta?: React.ReactNode;
    /** Pinned to the top end corner, beside the pin of a selected node: a confidence mark. */
    status?: React.ReactNode;
    /** 0 to 1. The label is colored against 50%. */
    winRate: number;
    /** 0 to 1. */
    pickRate: number;
    /** Bar length when it is scaled to the graph rather than to 100%. */
    winRateFill?: number;
    pickRateFill?: number;
    /** `accent` fills the card faintly in the accent color. */
    fill?: "card" | "accent";
    /** Locked or focused by the user: primary frame, a pin in the corner, `aria-pressed`. */
    selected?: boolean;
    /** 0 to 1, how much the node matters (its pick rate share); a weak node fades. `dimmed` is the hover version. */
    emphasis?: number;
    /** Body of the hover card. */
    tooltip?: React.ReactNode;
    tooltipSide?: React.ComponentProps<typeof Tooltip>["side"];
  }) {
  // Typed as the button it usually is; the static variant only drops `type` and the pressed state.
  const Comp = (onClick ? "button" : "div") as "button";
  const card = (
    <Comp
      data-slot="graph-node-card"
      data-selected={selected ? "" : undefined}
      type={onClick ? "button" : undefined}
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
      className={cn(
        EMPHASIS[Math.round(Math.max(0, Math.min(1, emphasis)) * (EMPHASIS.length - 1))],
        graphNodeCardVariants({ accent, dimmed }),
        fill === "accent" && ACCENT_TINT[accent ?? "none"],
        onClick && "cursor-pointer hover:border-y-muted-foreground hover:border-e-muted-foreground",
        selected && "border-primary bg-primary/10 hover:border-y-primary hover:border-e-primary",
        className,
      )}
      {...props}
    >
      {(status || selected) && (
        <div className="absolute end-1.5 top-1.5 flex items-center gap-1">
          {selected && <PinIcon aria-hidden="true" className="size-3 text-primary" />}
          {status}
        </div>
      )}
      <div className={cn("flex items-center gap-2", (status || selected) && "pe-9")}>
        {media ?? <div className="size-10 shrink-0 rounded-lg bg-muted" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs leading-tight font-semibold">
          {name}
          {meta && (
            <span className="inline-flex items-center gap-1 text-3xs font-normal text-muted-foreground">{meta}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <RateRow
          label="WR"
          rate={winRate}
          fill={winRateFill}
          color="var(--primary)"
          className={TONE_TEXT[toneOf(winRate, 0.5)]}
        />
        <RateRow label="PR" rate={pickRate} fill={pickRateFill} color="var(--chart-4)" className="text-chart-4" />
      </div>
    </Comp>
  );

  if (!tooltip) return card;

  return (
    <Tooltip side={tooltipSide} content={tooltip}>
      {card}
    </Tooltip>
  );
}
