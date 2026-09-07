import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

import { kdaRatio, soulsPerMinute, type TrackerSummary } from "~/lib/tracker/compute";
import type { TeamContribution } from "~/lib/tracker/contribution";
import { cn } from "~/lib/utils";
import type { TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Tile({
  label,
  value,
  title,
  children,
}: {
  label: string;
  value: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="leading-tight" title={title}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold tabular-nums">{value}</span>
        {children}
      </div>
    </div>
  );
}

function Delta({ value, format }: { value: number; format: (value: number) => string }) {
  if (value === 0) return null;
  return (
    <span
      className={cn("text-xs tabular-nums", value > 0 ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}
      title="Compared to your average on this hero in the selected range"
    >
      {value > 0 ? "+" : "−"}
      {format(Math.abs(value))}
    </span>
  );
}

export function PerformanceStrip({
  entry,
  player,
  contribution,
  heroSummary,
}: {
  entry: PlayerMatchHistoryEntry;
  player: TrackerMatchPlayer;
  contribution: TeamContribution;
  /** The player's summary on this hero over the filtered history, which includes this match. */
  heroSummary: TrackerSummary;
}) {
  const spm = soulsPerMinute(entry);
  const kda = kdaRatio(entry);
  // With a single match the average is this match, so there is nothing to compare against.
  const comparable = heroSummary.matches > 1;
  // Deltas are taken on the displayed precision so a tiny difference never shows as "+0".
  const spmDelta = Math.round(spm) - Math.round(heroSummary.soulsPerMin);
  const kdaDelta = Number((kda - heroSummary.kdaRatio).toFixed(2));
  const lastHitsDelta = entry.last_hits - Math.round(heroSummary.avgLastHits);
  const deniesDelta = entry.denies - Math.round(heroSummary.avgDenies);
  const shots = player.shots_hit + player.shots_missed;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border px-3 py-2">
      <span className="basis-full text-sm font-semibold @xl:basis-auto">Your performance</span>
      <Tile label="Kill participation" value={percent(contribution.killParticipation)} />
      <Tile label="Damage share" value={percent(contribution.damageShare)} />
      <Tile label="Souls share" value={percent(contribution.soulsShare)} />
      <Tile label="Souls/min" value={Math.round(spm).toLocaleString("en-US")}>
        {comparable && <Delta value={spmDelta} format={(v) => v.toLocaleString("en-US")} />}
      </Tile>
      <Tile label="KDA" value={kda.toFixed(2)}>
        {comparable && <Delta value={kdaDelta} format={(v) => v.toFixed(2)} />}
      </Tile>
      <Tile label="Last hits" value={entry.last_hits.toLocaleString("en-US")}>
        {comparable && <Delta value={lastHitsDelta} format={(v) => v.toLocaleString("en-US")} />}
      </Tile>
      <Tile label="Denies" value={entry.denies.toLocaleString("en-US")}>
        {comparable && <Delta value={deniesDelta} format={(v) => v.toLocaleString("en-US")} />}
      </Tile>
      {shots > 0 && (
        <Tile label="Accuracy" value={percent(player.shots_hit / shots)} title="Shots hit, creeps included" />
      )}
      <Tile label="Damage taken" value={player.player_damage_taken.toLocaleString("en-US")} />
    </div>
  );
}
