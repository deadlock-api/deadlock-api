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

/** The order the metrics take in every player's strip, so each sits in the same column down the scoreboard. */
export const COMBAT_METRIC_ORDER = Object.keys(SHORT_LABELS);

/**
 * One grid cell per metric in `labels` (the metrics any player of the match has): the player's reading, or an empty
 * cell where they have none, so the next metric keeps its column.
 */
export function PlayerCombatStats({ player, labels }: { player: TrackerMatchPlayer; labels: readonly string[] }) {
  const stats = player.combat_stats;
  return labels.map((label) => {
    const metric = stats?.metrics.find((candidate) => candidate.label === label);
    if (!stats || !metric) return <span key={label} aria-hidden="true" />;
    const rate = formatPercent(metric.share);
    return (
      <DetailPopover
        key={label}
        label={label}
        size="xs"
        className="justify-self-start px-1"
        details={
          <>
            <TooltipHeader title={label} subtitle={metric.detail} />
            <TooltipStats>
              <TooltipStat label="Rate" value={rate} />
              <TooltipStat label="Through" value={formatMatchDuration(stats.sampledAt)} />
            </TooltipStats>
          </>
        }
      >
        <span className="font-semibold tabular-nums">{rate}</span>
        <span className="text-muted-foreground">{SHORT_LABELS[label] ?? label}</span>
      </DetailPopover>
    );
  });
}
