import { ZoomIn } from "lucide-react";
import { useState } from "react";

import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { Panel, PanelBody, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";
import type { GameMode } from "~/lib/game-mode";

import { DistributionMarkers, distributionMetricsFor } from "./DistributionMarkers";
import type { ComparedPlayer } from "./types";
import type { CompareMetrics } from "./useCompareMetrics";

/** The stats people measure a player by, shown before "Show all". */
const COLLAPSED_METRICS = 10;

/**
 * Where each player sits among all players on the same filters: the population's curve for every stat, each
 * player's average marked on it.
 */
export function PercentileComparison({
  players,
  metrics,
  gameMode,
}: {
  players: ComparedPlayer[];
  metrics: CompareMetrics;
  /** Street Brawl has no soul economy: its souls curves are left out. */
  gameMode: GameMode;
}) {
  const [zoom, setZoom] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const failed = metrics.populationFailed || metrics.failed.some(Boolean);
  // The curves draw once the field and one player are in; a player still loading just has no marker yet, so adding
  // a player does not blank every chart.
  const loading = metrics.populationPending || metrics.pending.every(Boolean);

  return (
    // Named, so a tile knows the panel's width (a phone shows fewer before "Show all").
    <Panel className="@container/percentiles">
      <PanelHeader size="sm" title="Against everyone">
        {/* The legend, then the zoom toggle on the far right. */}
        <Inline gap={3} wrap="nowrap">
          <ChartLegend label="Players">
            {players.map((player) => (
              <ChartLegendItem key={player.accountId} color={player.color} shape="line" title={player.name}>
                <span className="max-w-full truncate" title={player.name}>
                  {player.name}
                </span>
              </ChartLegendItem>
            ))}
            <ChartLegendItem color={CHART_COLOR.reference} shape="dashed">
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
            onRetry={metrics.retry}
            retrying={metrics.retrying}
          />
        </PanelBody>
      )}
      <DistributionMarkers
        players={players}
        gameMode={gameMode}
        population={metrics.population}
        averages={metrics.own}
        loading={loading}
        zoom={zoom}
        limit={expanded ? undefined : COLLAPSED_METRICS}
      />
      <PanelShowMore open={expanded} onOpenChange={setExpanded} total={distributionMetricsFor(gameMode).length} />
    </Panel>
  );
}
