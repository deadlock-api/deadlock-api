/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The readings list is keyboard-scrollable when many series are selected. */
import type { ReactNode } from "react";

import { PanelTooltipCard, TooltipStat, TooltipStats } from "~/components/tracker-page/shared/PanelTooltipContent";

/** Compact label/value readings shared by analytics charts. */
export function ChartReadings({
  title,
  rows,
}: {
  title: ReactNode;
  rows: readonly { label: string; value: ReactNode }[];
}) {
  return (
    <PanelTooltipCard
      className="max-w-[min(18rem,calc(100vw-4rem))] gap-1.5 p-2.5"
      onMouseMove={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <p className="text-xs font-semibold">{title}</p>
      <section
        key={typeof title === "string" ? title : undefined}
        aria-label="Chart readings"
        tabIndex={0}
        className="max-h-44 scrollbar-thin overflow-y-auto overscroll-contain rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <TooltipStats>
          {rows.map((row) => (
            <TooltipStat key={row.label} label={row.label} value={row.value} />
          ))}
        </TooltipStats>
      </section>
      {rows.length > 7 && <p className="text-xs text-muted-foreground">Scroll for all readings</p>}
    </PanelTooltipCard>
  );
}
