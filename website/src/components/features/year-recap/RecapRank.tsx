import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { RANK_BADGE_AXIS_WIDTH, RankBadgeTick } from "~/components/domain/rank/RankBadgeTick";
import { ChartDataTable } from "~/components/patterns/charts/ChartDataTable";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_ACTIVE_DOT,
  CHART_COLOR,
  CHART_CURSOR_LINE,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Grid } from "~/components/ui/grid";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { rankAxis } from "~/lib/compare-rank-history";
import { badgeLabel } from "~/lib/rank-utils";
import { badgeToLinear } from "~/lib/tracker/compute";
import { MONTH_NAMES } from "~/lib/year-recap/recap";
import type { RecapRank, YearRecap } from "~/lib/year-recap/types";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { count, useRecapTime } from "./shared";

/** From the first ranked match of the year to the peak and where they ended, with the climb as a step line. */
export function RankChapter({ id, recap, rank }: { id: string; recap: YearRecap; rank: RecapRank }) {
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const { format, partsOf } = useRecapTime();
  const name = (badge: number) => badgeLabel(ranks, badge);
  const climbed = badgeToLinear(rank.last_badge) - badgeToLinear(rank.first_badge);
  const title =
    climbed > 0
      ? "The climb"
      : climbed < 0
        ? "A rocky ladder"
        : rank.peak_badge > rank.last_badge
          ? "Up and back"
          : "Holding the line";
  const points = rank.points.map((point) => ({ ...point, linear: badgeToLinear(point.badge) }));
  const axis = rankAxis(points.map((point) => point.linear));
  // From the month of the first ranked match: a climb that starts in August does not need an empty half year before it.
  const firstMonth = new Date((points[0]?.start_time ?? recap.start_unix) * 1000).getUTCMonth();
  const domainStart = Date.UTC(recap.year, firstMonth, 1) / 1000;
  const monthTicks = MONTH_NAMES.map((_, month) => Date.UTC(recap.year, month, 1) / 1000).filter(
    (tick) => tick >= domainStart,
  );
  const peakPoint =
    points.find((point) => point.start_time === rank.peak_at) ?? points.find((p) => p.badge === rank.peak_badge);
  // The peak is the chapter's subject, so its badge is the largest; the two ends of the year flank it.
  const steps = [
    { label: "First rank", badge: rank.first_badge, size: "size-16 @2xl/story:size-24" },
    {
      label: "Peak",
      badge: rank.peak_badge,
      sub: `on ${format(rank.peak_at, "MMMM D")}`,
      size: "size-24 @2xl/story:size-32",
    },
    { label: "Where you ended", badge: rank.last_badge, size: "size-16 @2xl/story:size-24" },
  ];

  return (
    <StoryChapter
      id={id}
      eyebrow="Ranked journey"
      title={title}
      description={`${count(rank.ranked_matches)} ranked matches took you from ${name(rank.first_badge)} to ${name(rank.last_badge)}.`}
    >
      <StoryFigure
        size="sm"
        value={name(rank.peak_badge)}
        caption={`Your peak of the year, reached on ${format(rank.peak_at, "MMMM D")}.`}
      />
      <Grid columns={3} gap={3} className="items-end">
        {steps.map((step) => (
          <Stack key={step.label} align="center" gap={1} className="text-center">
            <BadgeImage badge={step.badge} ranks={ranks} className={step.size} />
            <Text variant="eyebrow">{step.label}</Text>
            <Text variant="label">{name(step.badge)}</Text>
            {step.sub && (
              <Text variant="caption" tone="muted">
                {step.sub}
              </Text>
            )}
          </Stack>
        ))}
      </Grid>
      {points.length > 1 && (
        <ChartSurface
          label={`Rank after each ranked match of ${recap.year}, from ${name(rank.first_badge)} to ${name(rank.last_badge)}, peaking at ${name(rank.peak_badge)}.`}
          announce="label"
          size="default"
          variant="flush"
          dataTable={
            <ChartDataTable
              caption="Rank by month"
              head={["Month", "Rank at month end"]}
              rows={MONTH_NAMES.flatMap((month, index) => {
                const last = points.filter((point) => partsOf(point.start_time).month === index).at(-1);
                return last ? [{ key: month, cells: [month, name(last.badge)] }] : [];
              })}
            />
          }
        >
          <LineChart data={points} margin={CHART_MARGIN} accessibilityLayer={false}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              {...CHART_X_AXIS}
              dataKey="start_time"
              type="number"
              domain={[domainStart, recap.end_unix]}
              ticks={monthTicks}
              interval={0}
              minTickGap={8}
              tickFormatter={(unix: number) => MONTH_NAMES[new Date(unix * 1000).getUTCMonth()]?.slice(0, 3) ?? ""}
            />
            <YAxis
              {...CHART_Y_AXIS}
              width={RANK_BADGE_AXIS_WIDTH}
              type="number"
              domain={axis.domain}
              ticks={axis.ticks}
              interval={0}
              allowDecimals={false}
              tick={<RankBadgeTick ranks={ranks} />}
            />
            <Tooltip
              cursor={CHART_CURSOR_LINE}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <ChartReadings title={format(row.start_time, "MMM D, HH:mm")} label="Rank after this match">
                    <ChartReading label="Rank" color={CHART_COLOR.primary}>
                      {name(row.badge)}
                    </ChartReading>
                  </ChartReadings>
                );
              }}
            />
            <Line
              dataKey="linear"
              type="stepAfter"
              stroke={CHART_COLOR.primary}
              strokeWidth={2}
              dot={false}
              activeDot={CHART_ACTIVE_DOT}
              isAnimationActive={false}
            />
            {peakPoint && (
              <ReferenceDot
                x={peakPoint.start_time}
                y={peakPoint.linear}
                r={6}
                fill={CHART_COLOR.caution}
                stroke={CHART_COLOR.surface}
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ChartSurface>
      )}
    </StoryChapter>
  );
}
