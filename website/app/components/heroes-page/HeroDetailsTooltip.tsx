import { Info } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";

interface HeroDetailsRow {
  hero_id: number;
  matches: number;
  wins: number;
  losses: number;
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_last_hits: number;
  total_denies: number;
  total_net_worth: number;
  total_player_damage: number;
  total_player_damage_taken: number;
  total_boss_damage: number;
  total_creep_damage: number;
  total_neutral_damage: number;
  total_shots_hit: number;
  total_shots_missed: number;
  total_max_health: number;
  players: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function HeroDetailsTooltip({
  row,
  sumMatches,
  pickrateLabel,
  pickrateMultiplier,
}: {
  row: HeroDetailsRow;
  sumMatches: number;
  pickrateLabel?: string;
  pickrateMultiplier?: number;
}) {
  const avgKills = row.total_kills / row.matches;
  const avgDeaths = row.total_deaths / row.matches;
  const avgAssists = row.total_assists / row.matches;
  const avgLastHits = row.total_last_hits / row.matches;
  const avgDenies = row.total_denies / row.matches;
  const avgNetWorth = row.total_net_worth / row.matches;
  const avgPlayerDmg = row.total_player_damage / row.matches;
  const avgDmgTaken = row.total_player_damage_taken / row.matches;
  const avgBossDmg = row.total_boss_damage / row.matches;
  const avgCreepDmg = row.total_creep_damage / row.matches;
  const avgNeutralDmg = row.total_neutral_damage / row.matches;
  const totalShots = row.total_shots_hit + row.total_shots_missed;
  const accuracy = totalShots > 0 ? (row.total_shots_hit / totalShots) * 100 : 0;
  const mult = pickrateMultiplier ?? 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex cursor-pointer items-center justify-center">
          <Info className="size-4 text-muted-foreground transition-colors hover:text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        className="w-72 border border-border bg-popover p-3 text-popover-foreground shadow-md"
      >
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold">General</span>
            <Stat label="Matches" value={row.matches.toLocaleString()} />
            <Stat label="Wins / Losses" value={`${row.wins.toLocaleString()} / ${row.losses.toLocaleString()}`} />
            <Stat label="Win Rate" value={`${((row.wins / row.matches) * 100).toFixed(2)}%`} />
            <Stat
              label={pickrateLabel ?? "Pick Rate"}
              value={`${(mult * (row.matches / sumMatches) * 100).toFixed(2)}%`}
            />
            <Stat label="Unique Players" value={row.players.toLocaleString()} />
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-xs font-semibold">KDA (avg per match)</span>
            <Stat label="Kills" value={avgKills.toFixed(1)} />
            <Stat label="Deaths" value={avgDeaths.toFixed(1)} />
            <Stat label="Assists" value={avgAssists.toFixed(1)} />
            <Stat label="KDA Ratio" value={avgDeaths > 0 ? ((avgKills + avgAssists) / avgDeaths).toFixed(2) : "-"} />
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-xs font-semibold">Economy (avg per match)</span>
            <Stat label="Net Worth" value={Math.round(avgNetWorth).toLocaleString()} />
            <Stat label="Last Hits" value={avgLastHits.toFixed(1)} />
            <Stat label="Denies" value={avgDenies.toFixed(1)} />
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-xs font-semibold">Damage (avg per match)</span>
            <Stat label="Player Damage" value={Math.round(avgPlayerDmg).toLocaleString()} />
            <Stat label="Damage Taken" value={Math.round(avgDmgTaken).toLocaleString()} />
            <Stat label="Boss Damage" value={Math.round(avgBossDmg).toLocaleString()} />
            <Stat label="Creep Damage" value={Math.round(avgCreepDmg).toLocaleString()} />
            <Stat label="Neutral Damage" value={Math.round(avgNeutralDmg).toLocaleString()} />
          </div>
          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <span className="text-xs font-semibold">Shooting</span>
            <Stat label="Accuracy" value={`${accuracy.toFixed(1)}%`} />
            <Stat label="Shots Hit" value={row.total_shots_hit.toLocaleString()} />
            <Stat label="Shots Missed" value={row.total_shots_missed.toLocaleString()} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
