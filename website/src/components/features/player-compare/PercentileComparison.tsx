import { useQueries, useQuery } from "@tanstack/react-query";
import { ZoomIn } from "lucide-react";
import { useState } from "react";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";
import { type CompareFilters, compareMetricsParams } from "~/queries/player-compare-queries";
import { playerStatsMetricsQueryOptions } from "~/queries/player-stats-metrics-query";

import { DistributionMarkers } from "./DistributionMarkers";
import type { ComparedPlayer } from "./types";

/**
 * Where each player sits among all players on the same filters: the population's curve for every stat, each
 * player's average marked on it.
 */
export function PercentileComparison({ players, filters }: { players: ComparedPlayer[]; filters: CompareFilters }) {
  const [zoom, setZoom] = useState(true);
  const population = useQuery(playerStatsMetricsQueryOptions(compareMetricsParams(filters)));
  const own = useQueries({
    queries: players.map((player) => playerStatsMetricsQueryOptions(compareMetricsParams(filters, player.accountId))),
  });
  const failed = population.isError || own.some((query) => query.isError && !query.data);
  const loading = population.isPending || own.some((query) => query.isPending);
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
          <ChartLegend size="sm" label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-32 truncate" title={player.name}>
                  {player.name}
                </span>
              </ChartLegendItem>
            ))}
            <ChartLegendItem color="var(--chart-axis)" shape="line">
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
            <ZoomIn />
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
      />
    </Panel>
  );
}
