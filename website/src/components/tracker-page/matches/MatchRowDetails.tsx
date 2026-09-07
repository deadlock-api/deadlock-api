import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Rank } from "deadlock_api_client";
import { Fragment, useMemo } from "react";

import { BadgeImage } from "~/components/BadgeImage";
import { HeroImage } from "~/components/HeroImage";
import { ItemImageFromAsset } from "~/components/ItemImage";
import { Skeleton } from "~/components/ui/skeleton";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { IS_DEV } from "~/lib/constants";
import { cn } from "~/lib/utils";
import { itemUpgradesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import { type TrackerMatchItem, trackerMatchMetadataQueryOptions } from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";

const TEAMS = [
  { key: "Team0", name: "The Amber Hand" },
  { key: "Team1", name: "The Sapphire Flame" },
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

export function MatchRowDetails({ matchId, accountId, ranks }: { matchId: number; accountId: number; ranks: Rank[] }) {
  const { data: match, isPending, isError } = useQuery(trackerMatchMetadataQueryOptions(matchId));
  const { data: itemsById } = useQuery({
    ...itemUpgradesQueryOptions,
    select: (items) => new Map(items.map((item) => [item.id, item])),
  });

  const unnamedAccountIds = useMemo(
    () => match?.players.filter((player) => !player.personaname).map((player) => player.account_id) ?? [],
    [match],
  );
  const { profiles } = useSteamProfiles(unnamedAccountIds);

  const maxima = useMemo(() => {
    let souls = 0;
    let damage = 0;
    for (const player of match?.players ?? []) {
      souls = Math.max(souls, player.net_worth);
      damage = Math.max(damage, player.player_damage);
    }
    return { souls, damage };
  }, [match]);

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {TEAMS.map((team) => (
          <div key={team.key} className="space-y-2">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 6 }, (_, i) => (
              // oxlint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (isError || !match) {
    return <div className="py-4 text-center text-sm text-muted-foreground">Failed to load match details.</div>;
  }

  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-2">
        {TEAMS.map((team, teamIndex) => {
          const players = match.players.filter((player) => player.team === team.key);
          const won = match.winning_team === team.key;
          const averageBadge = teamIndex === 0 ? match.average_badge_team0 : match.average_badge_team1;
          return (
            <div key={team.key} className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{team.name}</span>
                <span className={cn("text-xs font-bold", won ? WIN_TEXT_CLASS : LOSS_TEXT_CLASS)}>
                  {won ? "Victory" : "Defeat"}
                </span>
                {averageBadge != null && averageBadge > 0 && (
                  <BadgeImage badge={averageBadge} ranks={ranks} className="size-5" />
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th colSpan={2} className="px-2 py-1 text-left font-normal">
                      Player
                    </th>
                    <th className="px-2 py-1 text-right font-normal">K / D / A</th>
                    <th className="px-2 py-1 text-right font-normal">Souls</th>
                    <th
                      className="hidden px-2 py-1 text-right font-normal @sm:table-cell"
                      title="Damage dealt to players"
                    >
                      Dmg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const isTracked = player.account_id === accountId;
                    const name =
                      player.personaname ?? profiles[player.account_id]?.personaname ?? `Player ${player.account_id}`;
                    const build = isTracked && itemsById ? finalBuild(player.items, itemsById) : [];
                    return (
                      <Fragment key={player.account_id}>
                        <tr className={cn(isTracked && "bg-accent font-medium")}>
                          <td className="w-8 py-1 pl-2">
                            <div className="relative size-6">
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
                                <span
                                  className="shrink-0 rounded-sm bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-500"
                                  title="Match MVP"
                                >
                                  MVP
                                </span>
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
                            className="hidden @sm:table-cell"
                          />
                        </tr>
                        {build.length > 0 && (
                          <tr className="bg-accent">
                            <td colSpan={5} className="px-2 pb-1.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="mr-1 text-xs text-muted-foreground">Final build</span>
                                {build.map((item) => (
                                  <ItemImageFromAsset key={item.id} item={item} className="size-6 rounded-sm" />
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
    </div>
  );
}
