import { useQueries, useQuery } from "@tanstack/react-query";
import { ZoomIn } from "lucide-react";
import { useState } from "react";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";
import { type CompareFilters, compareMetricsParams } from "~/queries/player-compare-queries";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

import { DistributionMarkers, METRIC_COUNT } from "./DistributionMarkers";

/** The stats people measure a player by, shown before "Show all". */
const COLLAPSED_METRICS = 10;
import type { ComparedPlayer } from "./types";

/**
 * Where each player sits among all players on the same filters: the population's curve for every stat, each
 * player's average marked on it.
 */
export function PercentileComparison({ players, filters }: { players: ComparedPlayer[]; filters: CompareFilters }) {
  const [zoom, setZoom] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const population = useQuery(playerStatsMetricsQueryOptions(compareMetricsParams(filters)));
  const own = useQueries({
    queries: players.map((player) => playerStatsMetricsQueryOptions(compareMetricsParams(filters, player.accountId))),
  });
  const failed = population.isError || own.some((query) => query.isError && !query.data);
  // The curves draw once the field and one player are in; a player still loading just has no marker yet, so adding
  // a player does not blank every chart.
  const loading = population.isPending || own.every((query) => query.isPending);
  const retry = () => {
    if (population.isError) void population.refetch();
    for (const query of own) if (query.isError) void query.refetch();
  };

  const averages = own.map((query) => query.data);

  return (
    <Panel>
      <PanelHeader size="sm" title="Against everyone">
        {/* The legend, then the zoom toggle on the far right. */}
        <Inline gap={3} wrap="nowrap">
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-32 truncate" title={player.name}>
                  {player.name}
                </span>
              </ChartLegendItem>
            ))}
            <ChartLegendItem color="var(--chart-axis)" shape="dashed">
              Median player
            </ChartLegendItem>
          </ChartLegend>
          <Button
            variant="toggle"
            size="icon-sm"
            aria-pressed={zoom}
            aria-label="Zoom in on the players"
            title="Zoom in on the players"
            onClick={() => setZoom(!zoom)}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
        </Inline>
      </PanelHeader>
      {failed && (
        <PanelBody size="sm">
          <ErrorState
            variant="inline"
            title="Some percentiles could not be loaded."
            onRetry={retry}
            retrying={population.isFetching || own.some((query) => query.isFetching)}
          />
        </PanelBody>
      )}
      <DistributionMarkers
        players={players}
        population={population.data}
        averages={averages}
        loading={loading}
        zoom={zoom}
        limit={expanded ? undefined : COLLAPSED_METRICS}
      />
      <PanelShowMore open={expanded} onOpenChange={setExpanded} total={METRIC_COUNT} />
    </Panel>
  );
}
