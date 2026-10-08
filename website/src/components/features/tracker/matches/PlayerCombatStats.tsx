import { Badge } from "~/components/ui/badge";
import { DetailPopover } from "~/components/ui/detail-popover";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { formatPercent } from "~/lib/format";
import { formatMatchDuration } from "~/lib/tracker/compute";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

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
      {stats?.metrics.map((metric) => {
        const rate = formatPercent(metric.share);
        return (
          <DetailPopover
            key={metric.label}
            label={`${metric.label}: ${rate}`}
            size="xs"
            className="px-1"
            details={
              <>
                <TooltipHeader title={metric.label} subtitle={metric.detail} />
                <TooltipStats>
                  <TooltipStat label="Rate" value={rate} />
                  <TooltipStat label="Through" value={formatMatchDuration(stats.sampledAt)} />
                </TooltipStats>
              </>
            }
          >
            <span className="font-semibold tabular-nums">{rate}</span>
            <span className="text-muted-foreground">{SHORT_LABELS[metric.label] ?? metric.label}</span>
          </DetailPopover>
        );
      })}
      {swapped && <Badge variant="outline">Swapped from {pregameHeroName ?? `Hero ${player.pregame_hero_id}`}</Badge>}
    </>
  );
}
