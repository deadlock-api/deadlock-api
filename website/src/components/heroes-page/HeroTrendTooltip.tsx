/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The scrollable readings need keyboard focus for scrolling. */
import type { TooltipContentProps } from "recharts";

import { PanelTooltipCard } from "~/components/tracker-page/shared/PanelTooltipContent";
import { day } from "~/dayjs";
import { formatTrendValue, HERO_TREND_LABELS, type HeroTrendStat } from "~/lib/hero-trends";
import { cn } from "~/lib/utils";

/** A hoverable reading list: moving into it must not change the bucket underneath it. */
export function HeroTrendTooltip({
  active,
  payload,
  label,
  stat,
  hourly,
  highlightedHeroId,
}: Pick<TooltipContentProps, "active" | "payload" | "label"> & {
  stat: HeroTrendStat;
  hourly: boolean;
  highlightedHeroId: number | null;
}) {
  if (!active || !payload.length) return null;
  const entries = payload
    .filter((item) => typeof item.value === "number" && Number.isFinite(item.value))
    .toSorted((a, b) => {
      if (Number(a.dataKey) === highlightedHeroId) return -1;
      if (Number(b.dataKey) === highlightedHeroId) return 1;
      return String(a.name).localeCompare(String(b.name));
    });
  if (!entries.length) return null;
  const showMatches = stat !== "matches" && entries.some((item) => item.payload?.[`${item.dataKey}_matches`] != null);
  const date = day.utc(Number(label)).format(hourly ? "MMM D, YYYY · HH:mm [UTC]" : "MMM D, YYYY [UTC]");

  return (
    <PanelTooltipCard
      className="w-64 max-w-[calc(100vw-5rem)] gap-1.5 p-2.5"
      onMouseMove={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
    >
      <p className="text-xs font-semibold">{date}</p>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {entries.length} {entries.length === 1 ? "hero" : "heroes"}
        </span>
        <span className="ml-auto">{HERO_TREND_LABELS[stat]}</span>
        {showMatches && <span className="w-12 text-right">Matches</span>}
      </div>
      <section
        key={`${stat}-${label}`}
        aria-label={`Hero values for ${date}`}
        tabIndex={0}
        className="max-h-44 scrollbar-thin overflow-y-auto overscroll-contain rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ul className="flex flex-col gap-1 text-xs">
          {entries.map((item) => {
            const matches = item.payload?.[`${item.dataKey}_matches`];
            const highlighted = Number(item.dataKey) === highlightedHeroId;
            return (
              <li
                key={String(item.dataKey)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-sm px-1 py-0.5",
                  highlighted && "bg-accent",
                )}
              >
                <span className="mr-auto flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate" title={String(item.name)}>
                    {item.name}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatTrendValue(Number(item.value), stat)}</span>
                {showMatches && (
                  <span
                    className="w-12 shrink-0 text-right text-muted-foreground tabular-nums"
                    aria-label={
                      matches == null ? "Match count unavailable" : `${Number(matches).toLocaleString("en-US")} matches`
                    }
                  >
                    {matches == null ? "—" : Number(matches).toLocaleString("en-US")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {entries.length > 7 && <p className="text-xs text-muted-foreground">Scroll for all heroes</p>}
    </PanelTooltipCard>
  );
}
