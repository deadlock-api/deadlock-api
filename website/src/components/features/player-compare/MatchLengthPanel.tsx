import { Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartError, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_BASELINE,
  CHART_CURSOR_BAND,
  CHART_GRID,
  CHART_MARGIN,
  CHART_X_AXIS,
  CHART_Y_AXIS,
} from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { NoValue } from "~/components/ui/no-value";
import { Stack } from "~/components/ui/stack";
import { percentTicks } from "~/lib/chart-axis";
import { type BracketResult, DURATION_BRACKETS, MIN_BRACKET_MATCHES, winRateByDuration } from "~/lib/compare-records";
import { formatPercent } from "~/lib/format";

import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

const LABEL = "win rate by match length";

interface Row {
  label: string;
  /** Per player key: the bracket's result. */
  results: Record<string, BracketResult>;
}

/**
 * Every compared player's win rate in short, medium and long matches, a bar each: who closes games early and who
 * scales into the late game. A bracket with too few of a player's matches has no bar.
 */
export function MatchLengthPanel({
  players,
  histories,
  className,
}: {
  players: ComparedPlayer[];
  /** The players' match histories on the filters, in the players' order (`useCompareMatchHistories`). */
  histories: readonly CompareMatchHistory[];
  /** Layout from the parent (grid placement). */
  className?: string;
}) {
  const pending = histories.some((history) => history.isPending);
  const allFailed = histories.length > 0 && histories.every((history) => history.isError);
  const keys = players.map((player) => String(player.accountId));
  const byPlayer = histories.map((history) => winRateByDuration(history.matches ?? []));
  const rows: Row[] = DURATION_BRACKETS.map((bracket, index) => ({
    label: bracket.label,
    results: Object.fromEntries(keys.map((key, at) => [key, byPlayer[at][index]])),
  }));
  const values = byPlayer.flatMap((brackets) => brackets.flatMap((result) => result.winRate ?? []));
  // Hidden once loaded when no player has a bracket with enough matches.
  if (!pending && !allFailed && values.length === 0) return null;

  // Symmetric around 50%, so a bar's length reads as its distance from an even record either way.
  const reach = Math.max(0.1, Math.ceil(Math.max(0, ...values.map((value) => Math.abs(value - 0.5))) * 10) / 10);
  const domain: [number, number] = [Math.max(0, 0.5 - reach), Math.min(1, 0.5 + reach)];
  const summary = `Win rate by match length, brackets with ${MIN_BRACKET_MATCHES} or more matches. ${players
    .map(
      (player, index) =>
        `${player.name}: ${byPlayer[index]
          .map((result, at) =>
            result.winRate == null
              ? `${DURATION_BRACKETS[at].label} too few matches`
              : `${DURATION_BRACKETS[at].label} ${formatPercent(result.winRate)} of ${result.matches}`,
          )
          .join(", ")}`,
    )
    .join("; ")}.`;

  return (
    <Panel className={className}>
      <PanelHeader size="sm" title="Win rate by match length" icon={Timer} />
      <PanelBody size="sm">
        <Stack gap={2}>
          {allFailed ? (
            <ChartError
              label={LABEL}
              onRetry={() => {
                for (const history of histories) if (history.isError) history.refetch();
              }}
            />
          ) : pending ? (
            <ChartLoading label={LABEL} size="md" />
          ) : (
            <ChartSurface label={summary} announce="label" size="md" variant="flush">
              <BarChart data={rows} margin={CHART_MARGIN} accessibilityLayer={false} barGap={2}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis {...CHART_X_AXIS} dataKey="label" />
                <YAxis
                  {...CHART_Y_AXIS}
                  type="number"
                  domain={domain}
                  ticks={percentTicks(domain)}
                  interval={0}
                  tickFormatter={(value: number) => formatPercent(value, 0)}
                />
                <ReferenceLine y={0.5} {...CHART_BASELINE} />
                <Tooltip
                  cursor={CHART_CURSOR_BAND}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as Row | undefined;
                    if (!active || !row) return null;
                    return (
                      <ChartReadings
                        title={`${row.label} matches`}
                        valueLabel="Win rate"
                        extraLabel="Matches"
                        label={`Win rate in ${row.label} matches`}
                      >
                        {players.map((player, index) => {
                          const result = row.results[keys[index]];
                          return (
                            <ChartReading
                              key={player.accountId}
                              label={player.name}
                              color={player.color}
                              extra={result?.matches ?? 0}
                            >
                              {result?.winRate == null ? <NoValue /> : formatPercent(result.winRate)}
                            </ChartReading>
                          );
                        })}
                      </ChartReadings>
                    );
                  }}
                />
                {players.map((player, index) => {
                  const key = keys[index];
                  return (
                    <Bar
                      key={key}
                      name={player.name}
                      // A range from 50% to the win rate: up for a winning record, down for a losing one.
                      dataKey={(row: Row) => {
                        const winRate = row.results[key]?.winRate;
                        return winRate == null ? null : [0.5, winRate];
                      }}
                      fill={player.color}
                      radius={2}
                      maxBarSize={20}
                      isAnimationActive={false}
                    />
                  );
                })}
              </BarChart>
            </ChartSurface>
          )}
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} title={player.name}>
                <span className="max-w-full truncate">{player.name}</span>
              </ChartLegendItem>
            ))}
          </ChartLegend>
        </Stack>
      </PanelBody>
    </Panel>
  );
}
