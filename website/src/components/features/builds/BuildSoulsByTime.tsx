import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { performanceCurveParams } from "~/components/features/builds/build-hooks";
import { ChartEmpty, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_ACTIVE_DOT,
  CHART_BASELINE,
  CHART_COLOR,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { niceTicks } from "~/lib/chart-axis";
import { formatSignedPercent } from "~/lib/format";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";
import { playerPerformanceCurveQueryOptions } from "~/queries/player-performance-curve-query";

/** The last game time drawn: few matches last longer, so the line would only show noise past it. */
const LAST_MINUTE = 40;

interface Point {
  minute: number;
  build: number;
  hero: number;
  /** The build's souls relative to the hero's: 0.05 is five percent more. */
  diff: number;
}

/**
 * The souls the build's players have over the game against every player of the hero, as a difference: above the
 * line the build farms faster, below it slower.
 */
export function BuildSoulsByTime({
  heroId,
  buildId,
  filters,
  active = true,
}: {
  heroId: number;
  buildId: number;
  filters: BuildPurchaseFilters;
  /** False while the selection is still moving: nothing is asked for yet. */
  active?: boolean;
}) {
  const strokeId = useId();
  const params = performanceCurveParams(heroId, filters, 0);
  const buildQuery = useQuery({
    ...playerPerformanceCurveQueryOptions({ ...params, heroBuildId: buildId }),
    enabled: active,
  });
  const heroQuery = useQuery(playerPerformanceCurveQueryOptions(params));
  if (buildQuery.isError || heroQuery.isError) return null;

  const heroAt = new Map(heroQuery.data?.map((point) => [point.game_time, point.net_worth_avg]));
  const points: Point[] = (buildQuery.data ?? []).flatMap((point) => {
    const hero = heroAt.get(point.game_time);
    if (!hero || point.game_time > LAST_MINUTE * 60) return [];
    return [{ minute: point.game_time / 60, build: point.net_worth_avg, hero, diff: point.net_worth_avg / hero - 1 }];
  });
  const extent = Math.max(0.02, ...points.map((point) => Math.abs(point.diff)));
  const yTicks = niceTicks(-extent, extent, 4);
  const domain: [number, number] = [yTicks[0], yTicks[yTicks.length - 1]];
  // The line is green while the build is ahead of the hero and red while behind: the stops sit where it crosses 0, as
  // a share of the line's own height (the gradient spans its bounding box).
  const high = Math.max(...points.map((point) => point.diff));
  const low = Math.min(...points.map((point) => point.diff));
  const zeroAt = high <= 0 ? 0 : low >= 0 ? 1 : high / (high - low);

  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title="Souls vs. hero average" />
      {buildQuery.isPending || heroQuery.isPending ? (
        <ChartLoading label="Souls over the game" size="md" />
      ) : points.length < 3 ? (
        <ChartEmpty label="game times with souls of this build" />
      ) : (
        <ChartSurface
          variant="flush"
          size="md"
          label={`The build's souls against the hero's average over the game, from ${formatSignedPercent(points[0].diff)} at ${points[0].minute} minutes to ${formatSignedPercent(points[points.length - 1].diff)} at ${points[points.length - 1].minute}`}
        >
          <LineChart data={points} margin={{ ...CHART_MARGIN, right: 12 }}>
            <defs>
              <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={zeroAt} stopColor={CHART_COLOR.positive} />
                <stop offset={zeroAt} stopColor={CHART_COLOR.negative} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              {...CHART_X_AXIS}
              dataKey="minute"
              type="number"
              domain={[points[0].minute, points[points.length - 1].minute]}
              ticks={[5, 10, 15, 20, 25, 30, 35, 40].filter((minute) => minute <= points[points.length - 1].minute)}
              tickFormatter={(minute: number) => `${minute}m`}
            />
            <YAxis
              {...CHART_Y_AXIS}
              domain={domain}
              ticks={yTicks}
              tickFormatter={(value: number) => formatSignedPercent(value, 0)}
            />
            <ReferenceLine y={0} {...CHART_BASELINE} />
            <Tooltip
              isAnimationActive={false}
              content={({ active: shown, payload }) => {
                const point = shown ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!point) return null;
                return (
                  <TooltipCard>
                    <TooltipHeader title={`${point.minute} minutes in`} />
                    <TooltipStats>
                      <TooltipStat label="This build" value={Math.round(point.build).toLocaleString("en-US")} />
                      <TooltipStat label="Hero average" value={Math.round(point.hero).toLocaleString("en-US")} />
                      <TooltipStat label="Difference" value={formatSignedPercent(point.diff)} />
                    </TooltipStats>
                  </TooltipCard>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="diff"
              stroke={`url(#${strokeId})`}
              strokeWidth={2}
              dot={false}
              activeDot={CHART_ACTIVE_DOT}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartSurface>
      )}
    </section>
  );
}
