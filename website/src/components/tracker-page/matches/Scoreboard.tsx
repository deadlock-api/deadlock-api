import { Link } from "@tanstack/react-router";
import type { Rank } from "deadlock_api_client";
import { Crown } from "lucide-react";
import { Fragment, useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { HeroImage } from "~/components/HeroImage";
import { ItemImageFromAsset } from "~/components/ItemImage";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { IS_DEV } from "~/lib/constants";
import { LANES } from "~/lib/team-builder/lanes";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";
import type { TrackerMatchItem, TrackerMatchMetadata, TrackerMatchPlayer } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

export const TEAMS = [
  { key: "Team0", name: "The Hidden King" },
  { key: "Team1", name: "The Archmother" },
] as const;

function StatCell({
  value,
  max,
  barClassName,
  className,
}: {
  value: number;
  max: number;
  barClassName: string;
  className?: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <td className={cn("relative px-2 py-1 text-right tabular-nums", className)}>
      <span className={cn("absolute inset-y-1.5 left-0 rounded-r-sm", barClassName)} style={{ width: `${width}%` }} />
      <span className="relative">{value.toLocaleString("en-US")}</span>
    </td>
  );
}

const laneIndex = (player: TrackerMatchPlayer) => {
  const index = LANES.findIndex((lane) => lane.id === player.assigned_lane);
  return index === -1 ? LANES.length : index;
};

/** Lane by lane so opponents line up across the two team tables; unassigned players sink to the bottom. */
function byLane(players: TrackerMatchPlayer[]): TrackerMatchPlayer[] {
  return [...players].sort((a, b) => laneIndex(a) - laneIndex(b));
}

/** Shop items still held at the end of the match, in purchase order. Ability upgrades share the list and are dropped. */
function finalBuild(items: TrackerMatchItem[], itemsById: Map<number, SlimUpgrade>): SlimUpgrade[] {
  const seen = new Set<number>();
  return [...items]
    .sort((a, b) => a.game_time_s - b.game_time_s)
    .filter((item) => item.sold_time_s === 0 && itemsById.has(item.item_id) && !seen.has(item.item_id))
    .map((item) => {
      seen.add(item.item_id);
      return itemsById.get(item.item_id) as SlimUpgrade;
    });
}

/** Both teams' end-of-match stats side by side, with the stat bars scaled to the lobby maximum. */
export function Scoreboard({
  match,
  accountId,
  ranks,
  laned,
  itemsById,
  nameOf,
}: {
  match: TrackerMatchMetadata;
  accountId: number;
  ranks: Rank[];
  laned: boolean;
  itemsById: Map<number, SlimUpgrade> | undefined;
  nameOf: (player: TrackerMatchPlayer) => string;
}) {
  const maxima = useMemo(() => {
    let souls = 0;
    let damage = 0;
    let bossDamage = 0;
    let healing = 0;
    for (const player of match.players) {
      souls = Math.max(souls, player.net_worth);
      damage = Math.max(damage, player.player_damage);
      bossDamage = Math.max(bossDamage, player.boss_damage);
      healing = Math.max(healing, player.player_healing);
    }
    return { souls, damage, bossDamage, healing };
  }, [match]);

  return (
    <div className="grid gap-4 @2xl:grid-cols-2">
      {TEAMS.map((team, teamIndex) => {
        const teamPlayers = match.players.filter((player) => player.team === team.key);
        const players = laned ? byLane(teamPlayers) : teamPlayers;
        const won = match.winning_team === team.key;
        const averageBadge = teamIndex === 0 ? match.average_badge_team0 : match.average_badge_team1;
        const teamKills = teamPlayers.reduce((sum, player) => sum + player.kills, 0);
        const teamSouls = teamPlayers.reduce((sum, player) => sum + player.net_worth, 0);
        return (
          <div key={team.key} className="@container min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold">{team.name}</span>
              <span className={cn("text-xs font-bold", won ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>
                {won ? "Victory" : "Defeat"}
              </span>
              {averageBadge != null && averageBadge > 0 && (
                <BadgeImage badge={averageBadge} ranks={ranks} className="size-5" />
              )}
              <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{teamKills}</span> kills ·{" "}
                <span className="font-semibold text-foreground">{teamSouls.toLocaleString("en-US")}</span> souls
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th colSpan={3} className="px-2 py-1 text-left font-normal">
                    Player
                  </th>
                  <th className="px-2 py-1 text-right font-normal">K / D / A</th>
                  <th className="px-2 py-1 text-right font-normal">Souls</th>
                  <th
                    className="hidden px-2 py-1 text-right font-normal @md:table-cell"
                    title="Damage dealt to players"
                  >
                    Dmg
                  </th>
                  <th
                    className="hidden px-2 py-1 text-right font-normal @lg:table-cell"
                    title="Damage dealt to objectives"
                  >
                    Obj
                  </th>
                  <th className="hidden px-2 py-1 text-right font-normal @lg:table-cell" title="Healing done">
                    Heal
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const isTracked = player.account_id === accountId;
                  const name = nameOf(player);
                  const build = itemsById ? finalBuild(player.items, itemsById) : [];
                  const lane = laned ? LANES[laneIndex(player)] : undefined;
                  return (
                    <Fragment key={player.account_id}>
                      <tr className={cn(isTracked && "bg-accent font-medium")}>
                        <td className="w-8 py-1 pl-2">
                          <div
                            className="relative size-6 rounded-full"
                            style={lane && { boxShadow: `0 0 0 2px ${lane.color}` }}
                            title={lane && `${lane.name} lane`}
                          >
                            <HeroImage heroId={player.hero_id} className="size-6 rounded-full" />
                            {player.level > 0 && (
                              <span
                                className="absolute -right-1.5 -bottom-1 rounded-sm bg-background px-0.5 text-[9px] leading-tight font-semibold text-muted-foreground tabular-nums"
                                title={`Level ${player.level}`}
                              >
                                {player.level}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="w-9 py-0.5 pl-1">
                          {player.rank_badge != null && (
                            <BadgeImage badge={player.rank_badge} ranks={ranks} className="size-8 max-w-none" />
                          )}
                        </td>
                        <td className="w-full max-w-0 px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            {isTracked || !IS_DEV ? (
                              <span className="truncate">{name}</span>
                            ) : (
                              <Link
                                to="/players/$accountId"
                                params={{ accountId: String(player.account_id) }}
                                className="truncate hover:text-primary hover:underline"
                                title="Open player tracker"
                              >
                                {name}
                              </Link>
                            )}
                            {player.mvp_rank === 1 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Match MVP" />
                                </TooltipTrigger>
                                <TooltipContent>Match MVP</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                          {player.kills} / {player.deaths} / {player.assists}
                        </td>
                        <StatCell value={player.net_worth} max={maxima.souls} barClassName="bg-amber-500/15" />
                        <StatCell
                          value={player.player_damage}
                          max={maxima.damage}
                          barClassName="bg-primary/15"
                          className="hidden @md:table-cell"
                        />
                        <StatCell
                          value={player.boss_damage}
                          max={maxima.bossDamage}
                          barClassName="bg-violet-500/15"
                          className="hidden @lg:table-cell"
                        />
                        <StatCell
                          value={player.player_healing}
                          max={maxima.healing}
                          barClassName="bg-emerald-500/15"
                          className="hidden @lg:table-cell"
                        />
                      </tr>
                      {build.length > 0 && (
                        <tr className={cn(isTracked && "bg-accent")}>
                          <td colSpan={8} className="px-2 pb-1.5 pl-10">
                            <div className="flex flex-wrap items-center gap-1">
                              {build.map((item) => (
                                <Tooltip key={item.id}>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <ItemImageFromAsset item={item} className="size-5 rounded-sm" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {item.name}
                                    {item.cost != null && ` · ${item.cost.toLocaleString("en-US")} souls`}
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
