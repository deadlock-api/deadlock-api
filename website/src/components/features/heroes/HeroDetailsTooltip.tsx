import { Info } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import { Stack } from "~/components/ui/stack";
import { TooltipStat, TooltipStats } from "~/components/ui/tooltip";

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
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={1}>
      <span className="text-xs font-semibold">{title}</span>
      <TooltipStats variant="plain">{children}</TooltipStats>
    </Stack>
  );
}

export function HeroDetailsTooltip({
  row,
  sumMatches,
  pickrateLabel,
  pickrateMultiplier,
  heroName,
}: {
  row: HeroDetailsRow;
  /** Names the button: a table of them all read "Show hero details". */
  heroName?: string;
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
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={heroName ? `Show ${heroName} details` : "Show hero details"}
          className="text-muted-foreground"
        >
          <Info className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="left" aria-label={heroName ? `${heroName} details` : "Hero details"} className="p-3">
        <Stack gap={2}>
          <DetailGroup title="General">
            <TooltipStat label="Matches" value={row.matches.toLocaleString("en-US")} />
            <TooltipStat
              label="Wins / Losses"
              value={`${row.wins.toLocaleString("en-US")} / ${row.losses.toLocaleString("en-US")}`}
            />
            <TooltipStat label="Win Rate" value={`${((row.wins / row.matches) * 100).toFixed(2)}%`} />
            <TooltipStat
              label={pickrateLabel ?? "Pick Rate"}
              value={`${(mult * (row.matches / sumMatches) * 100).toFixed(2)}%`}
            />
          </DetailGroup>
          <Separator />
          <DetailGroup title="KDA (avg per match)">
            <TooltipStat label="Kills" value={avgKills.toFixed(1)} />
            <TooltipStat label="Deaths" value={avgDeaths.toFixed(1)} />
            <TooltipStat label="Assists" value={avgAssists.toFixed(1)} />
            <TooltipStat
              label="KDA Ratio"
              value={avgDeaths > 0 ? ((avgKills + avgAssists) / avgDeaths).toFixed(2) : "-"}
            />
          </DetailGroup>
          <Separator />
          <DetailGroup title="Economy (avg per match)">
            <TooltipStat label="Net Worth" value={Math.round(avgNetWorth).toLocaleString("en-US")} />
            <TooltipStat label="Last Hits" value={avgLastHits.toFixed(1)} />
            <TooltipStat label="Denies" value={avgDenies.toFixed(1)} />
          </DetailGroup>
          <Separator />
          <DetailGroup title="Damage (avg per match)">
            <TooltipStat label="Player Damage" value={Math.round(avgPlayerDmg).toLocaleString("en-US")} />
            <TooltipStat label="Damage Taken" value={Math.round(avgDmgTaken).toLocaleString("en-US")} />
            <TooltipStat label="Boss Damage" value={Math.round(avgBossDmg).toLocaleString("en-US")} />
            <TooltipStat label="Creep Damage" value={Math.round(avgCreepDmg).toLocaleString("en-US")} />
            <TooltipStat label="Neutral Damage" value={Math.round(avgNeutralDmg).toLocaleString("en-US")} />
          </DetailGroup>
          <Separator />
          <DetailGroup title="Shooting">
            <TooltipStat label="Accuracy" value={`${accuracy.toFixed(1)}%`} />
            <TooltipStat label="Shots Hit" value={row.total_shots_hit.toLocaleString("en-US")} />
            <TooltipStat label="Shots Missed" value={row.total_shots_missed.toLocaleString("en-US")} />
          </DetailGroup>
        </Stack>
      </PopoverContent>
    </Popover>
  );
}
