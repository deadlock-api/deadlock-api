import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { PanelTooltipContent, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import type { StatsIndex } from "~/lib/team-builder/analysis";
import { deltaClass, formatCount, formatPoints, formatRate } from "~/lib/team-builder/format";

export interface TooltipRow {
  label: string;
  value: string;
  className?: string;
}

/** The one hover surface every Team Builder number uses, so they all read the same way. */
export function StatTooltip({
  lead,
  title,
  rows,
  children,
}: {
  lead?: React.ReactNode;
  title: React.ReactNode;
  rows: TooltipRow[];
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <PanelTooltipContent
        // To the right: rows are scanned vertically, so a card above or below sits in the way.
        side="right"
        sideOffset={6}
        collisionPadding={12}
      >
        <TooltipHeader lead={lead} title={title} />
        <TooltipStats>
          {rows.map((row) => (
            <TooltipStat key={row.label} label={row.label} value={row.value} className={row.className} />
          ))}
        </TooltipStats>
      </PanelTooltipContent>
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
      lead={<HeroImage heroId={heroId} shape="circle" className="size-5 shrink-0" />}
      title={<HeroName heroId={heroId} />}
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
      {/* A real element for Radix to hold: `AssetImage` forwards neither ref nor pointer handlers,
          so a portrait passed straight to the trigger drops them silently. */}
      <span className="inline-flex">{children}</span>
    </StatTooltip>
  );
}
