import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartEmpty, ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_COLOR,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { TooltipCard, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { niceTicks } from "~/lib/chart-axis";
import { formatPercent } from "~/lib/format";
import type { DayScores } from "~/lib/guess-the-rank/scores";

import { useDayScores } from "./use-guess-the-rank";

interface ScorePlayers {
  points: number;
  players: number;
  share: number;
  mine: boolean;
  /** The bar's colour; Recharts reads it from the data point. */
  fill: string;
}

const MINE_COLOR = CHART_COLOR.primary;
const OTHER_COLOR = CHART_COLOR.neutral;

function ScoreTooltip({ entry }: { entry?: ScorePlayers }) {
  if (!entry) return null;
  return (
    <TooltipCard>
      <TooltipHeader title={entry.mine ? `${entry.points} points · Your score` : `${entry.points} points`} />
      <TooltipStats>
        <TooltipStat label="Players" value={entry.players.toLocaleString("en-US")} />
        <TooltipStat label="Share" value={formatPercent(entry.share)} />
      </TooltipStats>
    </TooltipCard>
  );
}

/** Players per day score, from 0 to the day's maximum, the player's own score in the brand color. */
function ScoreDistributionChart({ scores, points, max }: { scores: DayScores; points: number; max: number }) {
  const data: ScorePlayers[] = Array.from({ length: max + 1 }, (_, score) => {
    const players = scores.stats[score] ?? 0;
    const mine = score === points;
    return {
      points: score,
      players,
      share: scores.total > 0 ? players / scores.total : 0,
      mine,
      fill: mine ? MINE_COLOR : OTHER_COLOR,
    };
  });
  const valueTicks = niceTicks(0, Math.max(4, ...data.map((entry) => entry.players)));
  const label =
    `Players per day score, ${scores.total} in all. ` +
    `You scored ${points} of ${max}, as did ${formatPercent(data[points]?.share ?? 0)} of players.`;

  return (
    <Stack gap={2} className="flex-1">
      <ChartSurface label={label} size="grow" variant="flush">
        <BarChart data={data} margin={CHART_MARGIN} accessibilityLayer>
          <CartesianGrid {...CHART_GRID} />
          <XAxis {...CHART_X_AXIS} dataKey="points" interval="preserveStartEnd" minTickGap={4} />
          <YAxis
            {...CHART_Y_AXIS}
            allowDecimals={false}
            ticks={valueTicks}
            domain={[0, valueTicks[valueTicks.length - 1]]}
          />
          <Tooltip
            cursor={CHART_CURSOR_BAND}
            isAnimationActive={false}
            content={({ active, payload }) =>
              active && payload?.length ? <ScoreTooltip entry={payload[0].payload as ScorePlayers} /> : null
            }
          />
          <Bar dataKey="players" radius={4} />
        </BarChart>
      </ChartSurface>
      <ChartLegend label="Bar colors">
        <ChartLegendItem shape="square" color={MINE_COLOR}>
          Your score
        </ChartLegendItem>
        <ChartLegendItem shape="square" color={OTHER_COLOR}>
          Others
        </ChartLegendItem>
      </ChartLegend>
    </Stack>
  );
}

/**
 * How everyone scored on the day, beside where the player's own score lands: how many played, their average and the
 * share of players the score beat. Narrow, the numbers sit above the chart; wide, beside it.
 */
export function ScoreDistribution({ date, points, max }: { date: string; points: number; max: number }) {
  const query = useDayScores(date);
  const scores = query.data;
  const total = scores?.total ?? 0;
  let sum = 0;
  let below = 0;
  for (const [score, players] of Object.entries(scores?.stats ?? {})) {
    sum += Number(score) * players;
    if (Number(score) < points) below += players;
  }

  return (
    <Panel className="flex flex-col">
      <PanelHeader title="How everyone scored" />
      <PanelBody className="@container flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3 @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] @2xl:gap-4">
          <StatGroup size="xs" className="grid-cols-3 content-start font-mono @2xl:grid-cols-1">
            <Stat label="Players" value={scores ? total.toLocaleString("en-US") : undefined} />
            <Stat label="Average" value={total > 0 ? (sum / total).toFixed(1) : undefined} />
            <Stat label="You beat" value={total > 0 ? formatPercent(below / total, 0) : undefined} />
          </StatGroup>
          <Stack gap={2} className="min-h-52 flex-1">
            {query.isPending ? (
              <ChartLoading label="day scores" size="grow" />
            ) : query.isError ? (
              <ChartError
                className="flex-1"
                label="day scores"
                onRetry={() => void query.refetch()}
                retrying={query.isFetching}
              />
            ) : !scores || total === 0 ? (
              <ChartEmpty className="flex-1" label="day scores" description="No scores for this day yet." />
            ) : (
              <ScoreDistributionChart scores={scores} points={points} max={max} />
            )}
          </Stack>
        </div>
      </PanelBody>
    </Panel>
  );
}
