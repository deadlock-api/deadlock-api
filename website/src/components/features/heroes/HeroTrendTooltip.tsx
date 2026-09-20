import type { TooltipContentProps } from "recharts";

import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { day } from "~/dayjs";
import { formatTrendValue, HERO_TREND_LABELS, type HeroTrendStat } from "~/lib/hero-trends";

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
    <ChartReadings
      size="lg"
      title={date}
      summary={`${entries.length} ${entries.length === 1 ? "hero" : "heroes"}`}
      valueLabel={HERO_TREND_LABELS[stat]}
      extraLabel={showMatches ? "Matches" : undefined}
      scrollHint="Scroll for all heroes"
      label={`Hero values for ${date}`}
    >
      {entries.map((item) => {
        const matches = item.payload?.[`${item.dataKey}_matches`];
        return (
          <ChartReading
            key={String(item.dataKey)}
            label={String(item.name)}
            color={item.color}
            highlighted={Number(item.dataKey) === highlightedHeroId}
            extra={
              matches == null ? undefined : (
                <>
                  {Number(matches).toLocaleString("en-US")}
                  <span className="sr-only"> matches</span>
                </>
              )
            }
          >
            {formatTrendValue(Number(item.value), stat)}
          </ChartReading>
        );
      })}
    </ChartReadings>
  );
}
