import type { HashMapValue } from "deadlock_api_client";

import { ChartLegend, ChartLegendItem, ChartLegendToggle } from "~/components/patterns/charts/ChartLegend";
import { ChartReading, ChartReadings } from "~/components/patterns/charts/ChartReadings";
import { ChartEmpty, ChartLoading } from "~/components/patterns/charts/ChartStates";
import { RadarChart, RadarSeries } from "~/components/patterns/charts/RadarChart";
import { useSeriesHighlight } from "~/components/patterns/charts/useSeriesHighlight";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Grid } from "~/components/ui/grid";
import { NoValue } from "~/components/ui/no-value";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { rankShareLabel } from "~/lib/player-compare";
import { formatPlayerMetricValue, PLAYER_METRICS } from "~/lib/player-metrics";
import {
  PLAYSTYLE_AXES,
  type Playstyle,
  playstyleLabel,
  type PlaystylePercentiles,
  playstylePercentiles,
} from "~/lib/playstyle";

import type { ComparedPlayer } from "./types";
import type { CompareMetrics } from "./useCompareMetrics";

const CHART_SIZE = "md";

interface RadarPlayer {
  player: ComparedPlayer;
  /** The series key on each row. */
  key: `p${number}`;
  percentiles: PlaystylePercentiles;
  playstyle: Playstyle | null;
  /** The player's own averages, for the tooltip. */
  own: Record<string, HashMapValue>;
}

interface AxisRow {
  axis: string;
  metricKey: string;
  [player: `p${number}`]: number | undefined;
}

const axisLabel = (axis: string) => PLAYSTYLE_AXES.find((def) => def.axis === axis)?.label ?? axis;
const metricOf = (key: string) => PLAYER_METRICS.find((metric) => metric.key === key);

/** "Farmer · Top 8% in Farming": the label and the rank that earned it. */
function playstyleLine({ playstyle, percentiles }: RadarPlayer): string | null {
  if (!playstyle) return null;
  const [strength] = playstyle.strengths;
  if (!strength) return playstyle.label;
  return `${playstyle.label} · ${rankShareLabel(percentiles[strength] ?? 50)} in ${axisLabel(strength)}`;
}

/** The hover card of one axis: every player's rank on it, and the average behind it. */
function AxisReadings({ entry, players }: { entry?: AxisRow; players: RadarPlayer[] }) {
  if (!entry) return null;
  const metric = metricOf(entry.metricKey);
  return (
    <ChartReadings title={`${entry.axis} · ${metric?.label ?? entry.metricKey}`} extraLabel="Avg" size="sm">
      {players.map(({ player, key, own }) => {
        const value = entry[key];
        return (
          <ChartReading
            key={player.accountId}
            label={player.name}
            color={player.color}
            extra={metric ? formatPlayerMetricValue(own[entry.metricKey]?.avg, metric.format) : undefined}
          >
            {value == null ? <NoValue /> : rankShareLabel(value)}
          </ChartReading>
        );
      })}
    </ChartReadings>
  );
}

/**
 * How each player plays, as percentiles among all players on the same filters: one axis per side of the game, 50 the
 * median, higher always better. Each player gets a playstyle label from their strongest axes.
 */
export function PlaystyleRadarPanel({ players, metrics }: { players: ComparedPlayer[]; metrics: CompareMetrics }) {
  const { highlighted, toggleProps } = useSeriesHighlight();

  // A player whose numbers failed (a private account) drops out of the chart; the others still draw.
  const failedPlayers = players.filter((_, index) => metrics.failed[index]);
  const failed = metrics.populationFailed || (players.length > 0 && failedPlayers.length === players.length);
  // Drawn once the field and one player are in; a player still loading joins when their numbers arrive.
  const loading = metrics.populationPending || metrics.pending.every(Boolean);

  const ranked: RadarPlayer[] = players.flatMap((player, index) => {
    const data = metrics.own[index];
    const percentiles = playstylePercentiles(metrics.population, data);
    if (!data || Object.keys(percentiles).length === 0) return [];
    return [
      { player, key: `p${player.accountId}` as const, percentiles, playstyle: playstyleLabel(percentiles), own: data },
    ];
  });
  const rows: AxisRow[] = PLAYSTYLE_AXES.map(({ axis, label, metricKey }) => ({
    axis: label,
    metricKey,
    ...Object.fromEntries(ranked.map(({ key, percentiles }) => [key, percentiles[axis]])),
  }));
  const summary =
    "Playstyle: each player's percentile among all players on the same filters, 50 is the median. " +
    ranked
      .map(
        (entry) =>
          `${entry.player.name}${entry.playstyle ? `, ${entry.playstyle.label}` : ""}: ` +
          PLAYSTYLE_AXES.map(({ axis, label }) => {
            const value = entry.percentiles[axis];
            return `${label} ${value == null ? "no data" : rankShareLabel(value)}`;
          }).join(", "),
      )
      .join(". ");

  return (
    <Panel>
      <PanelHeader size="sm" title="Playstyle">
        <ChartLegend label="Reference">
          <ChartLegendItem color="var(--chart-axis)" shape="dashed">
            Median player
          </ChartLegendItem>
        </ChartLegend>
      </PanelHeader>
      <PanelBody size="sm">
        {failed ? (
          <ErrorState
            variant="inline"
            title="Some percentiles could not be loaded."
            onRetry={metrics.retry}
            retrying={metrics.retrying}
          />
        ) : loading ? (
          <ChartLoading label="Playstyle percentiles" size={CHART_SIZE} />
        ) : ranked.length === 0 ? (
          <ChartEmpty label="playstyle data" />
        ) : (
          <Stack gap={3}>
            {failedPlayers.length > 0 && (
              <ErrorState
                variant="inline"
                title={`No playstyle for ${failedPlayers.map((player) => player.name).join(", ")}: their numbers did not load.`}
                onRetry={metrics.retry}
                retrying={metrics.retrying}
              />
            )}
            <Grid columns={{ base: 1, sm: 2 }} gap={3} className="items-center">
              <RadarChart
                label={summary}
                announce="label"
                size={CHART_SIZE}
                variant="bare"
                data={rows}
                axisKey="axis"
                domain={[0, 100]}
                baseline={50}
                highlighted={highlighted}
                tooltip={<AxisReadings players={ranked} />}
              >
                {ranked.map(({ player, key }) => (
                  <RadarSeries key={key} dataKey={key} name={player.name} color={player.color} />
                ))}
              </RadarChart>
              <ChartLegend label="Players: hover, focus or press one to single it out" orientation="vertical">
                {ranked.map((entry) => (
                  <ChartLegendToggle
                    key={entry.key}
                    color={entry.player.color}
                    shape="line"
                    {...toggleProps(entry.key)}
                  >
                    <Stack gap={0} className="min-w-0 py-1">
                      <Text variant="label" tone="default" wrap="truncate" title={entry.player.name}>
                        {entry.player.name}
                      </Text>
                      <Text variant="caption" tone="muted" className="line-clamp-2">
                        {playstyleLine(entry) ?? "Not enough data for a playstyle"}
                      </Text>
                    </Stack>
                  </ChartLegendToggle>
                ))}
              </ChartLegend>
            </Grid>
          </Stack>
        )}
      </PanelBody>
    </Panel>
  );
}
