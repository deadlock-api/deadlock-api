import { HeroName } from "~/components/HeroName";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate } from "~/lib/team-builder/format";
import { cn } from "~/lib/utils";

import { HeroPortrait } from "./HeroPortrait";

export interface TooltipRow {
  label: string;
  value: string;
  className?: string;
}

/** The one hover surface every Team Builder number uses, so they all read the same way. */
export function StatTooltip({
  title,
  rows,
  children,
}: {
  title: React.ReactNode;
  rows: TooltipRow[];
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        // To the right: rows are scanned vertically, so a card above or below sits in the way.
        side="right"
        sideOffset={6}
        collisionPadding={12}
        className="max-w-64 space-y-1.5 border border-border bg-popover px-3 py-2 text-popover-foreground [&>svg]:bg-popover [&>svg]:fill-popover"
      >
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="space-y-0.5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 text-[11px]">
              <span className="opacity-70">{row.label}</span>
              <span className={cn("font-medium tabular-nums", row.className)}>{row.value}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Portrait hover: who this is and how the hero does on its own. */
export function HeroTooltip({
  heroId,
  index,
  children,
}: {
  heroId: number;
  index: StatsIndex;
  children: React.ReactNode;
}) {
  const sample = index.heroSample(heroId);
  return (
    <StatTooltip
      // A name element rather than a string: the card renders on hover, so a grid full of portraits
      // does not each hold a hero-asset subscription just to label a tooltip nobody opened.
      title={
        <span className="flex items-center gap-2">
          <HeroPortrait heroId={heroId} size="size-5" />
          <HeroName heroId={heroId} />
        </span>
      }
      rows={[
        { label: "Baseline win rate", value: formatRate(index.heroWinRate(heroId)) },
        {
          label: "vs. even",
          value: formatPoints(index.soloEdge(heroId)),
          className: deltaClass(index.soloEdge(heroId)),
        },
        { label: "Matches", value: formatCount(sample?.matches ?? 0) },
      ]}
    >
      {children}
    </StatTooltip>
  );
}
