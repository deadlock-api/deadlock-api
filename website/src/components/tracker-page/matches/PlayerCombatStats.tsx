import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { PanelTooltipContent, TooltipHeader, TooltipStat, TooltipStats } from "../shared/PanelTooltipContent";

const SHORT_LABELS: Record<string, string> = {
  "Hero accuracy": "Accuracy",
  "Headshot rate": "Headshots",
  "Hits without falloff": "No falloff",
  "Incoming accuracy": "Incoming",
};

/** Inline metrics for each player's existing scoreboard stat strip. */
export function PlayerCombatStats({
  player,
  pregameHeroName,
}: {
  player: TrackerMatchPlayer;
  pregameHeroName?: string;
}) {
  const stats = player.combat_stats;
  const swapped = player.pregame_hero_id != null && player.pregame_hero_id !== player.hero_id;
  if (!stats && !swapped) return null;
  return (
    <>
      {stats?.metrics.map((metric) => (
        <Tooltip key={metric.label}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="-mx-2 -my-0.5"
              onClick={(event) => event.stopPropagation()}
              aria-label={`${metric.label}: ${(metric.share * 100).toFixed(1)}%. ${metric.detail}`}
            >
              <span className="font-semibold tabular-nums">{(metric.share * 100).toFixed(1)}%</span>
              <span className="text-muted-foreground">{SHORT_LABELS[metric.label] ?? metric.label}</span>
            </Button>
          </TooltipTrigger>
          <PanelTooltipContent>
            <TooltipHeader title={metric.label} subtitle={metric.detail} />
            <TooltipStats>
              <TooltipStat label="Rate" value={`${(metric.share * 100).toFixed(1)}%`} />
              <TooltipStat label="Through" value={formatMatchDuration(stats.sampledAt)} />
            </TooltipStats>
          </PanelTooltipContent>
        </Tooltip>
      ))}
      {swapped && <Badge variant="outline">Swapped from {pregameHeroName ?? `Hero ${player.pregame_hero_id}`}</Badge>}
    </>
  );
}
