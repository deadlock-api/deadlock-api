import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Rank } from "deadlock_api_client";
import { Crown, ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { AssetImage } from "~/components/AssetImage";
import { BadgeImage } from "~/components/BadgeImage";
import { HeroImage } from "~/components/HeroImage";
import { ItemImageFromAsset } from "~/components/ItemImage";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { IS_DEV } from "~/lib/constants";
import { LANES } from "~/lib/team-builder/lanes";
import { type BuildAbility, type BuildItem, playerBuild } from "~/lib/tracker/build";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import {
  type TrackerMatchMetadata,
  type TrackerMatchPlayer,
  trackerAbilitiesQueryOptions,
} from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { PanelTooltipContent } from "../shared/PanelTooltipContent";
import { RankDelta } from "../shared/RankDelta";

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

/** Unlocking an ability is its first level, and each of its three upgrades adds one. */
const MAX_ABILITY_LEVEL = 4;

function AbilityChip({ entry }: { entry: BuildAbility }) {
  // An ability only enters the history once unlocked, even when its unlock is not recorded.
  const level = Math.min(MAX_ABILITY_LEVEL, entry.upgradedAt.length + 1);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex flex-col items-center gap-0.5">
          <span className="relative">
            <AssetImage
              asset={{
                webp: entry.ability.image_webp,
                png: entry.ability.image,
                fallbackSrc: entry.ability.image_webp ?? entry.ability.image,
                alt: entry.ability.name,
                title: "",
              }}
              isLoading={false}
              emptyClassName="aspect-square size-5.5 rounded-full bg-muted"
              imgClassName="aspect-square size-5.5 object-cover dark:brightness-0 dark:invert"
            />
            {entry.stacks != null && <StackBadge stacks={entry.stacks} />}
          </span>
          <span className="flex gap-px" aria-label={`Level ${level} of ${MAX_ABILITY_LEVEL}`}>
            {Array.from({ length: MAX_ABILITY_LEVEL }, (_, index) => (
              <span
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                className={cn("h-0.5 w-1 rounded-full", index < level ? "bg-amber-400" : "bg-muted-foreground/30")}
              />
            ))}
          </span>
        </span>
      </TooltipTrigger>
      <PanelTooltipContent>
        <div className="font-medium">
          {entry.ability.name} · level {level}/{MAX_ABILITY_LEVEL}
        </div>
        <div className="text-muted-foreground tabular-nums">
          {[
            entry.unlockedAt != null && `Unlocked at ${formatMatchDuration(entry.unlockedAt)}`,
            entry.upgradedAt.length > 0 && `upgraded at ${entry.upgradedAt.map(formatMatchDuration).join(", ")}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {entry.stacks != null && <div className="text-muted-foreground tabular-nums">{entry.stacks} stacks</div>}
      </PanelTooltipContent>
    </Tooltip>
  );
}

function StackBadge({ stacks }: { stacks: number }) {
  return (
    <span className="absolute -top-1.5 -right-1.5 rounded-sm bg-background px-0.5 text-[9px] leading-tight font-semibold tabular-nums">
      {stacks}
    </span>
  );
}

function ItemChip({ item }: { item: BuildItem }) {
  const sold = item.soldAt != null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative">
          <ItemImageFromAsset
            item={item.upgrade}
            className={cn("size-5.5 rounded-sm", sold && "opacity-35 grayscale")}
            title=""
          />
          {item.imbuedInto && (
            <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-violet-400 ring-1 ring-background" />
          )}
          {item.stacks != null && <StackBadge stacks={item.stacks} />}
        </span>
      </TooltipTrigger>
      <PanelTooltipContent>
        <div className="font-medium">
          {item.upgrade.name}
          {item.upgrade.cost != null && ` · ${item.upgrade.cost.toLocaleString("en-US")} souls`}
        </div>
        <div className="text-muted-foreground tabular-nums">
          Bought at {formatMatchDuration(item.boughtAt)}
          {sold && ` · sold at ${formatMatchDuration(item.soldAt as number)}`}
        </div>
        {item.imbuedInto && <div className="text-muted-foreground">Imbued into {item.imbuedInto.name}</div>}
        {item.stacks != null && <div className="text-muted-foreground tabular-nums">{item.stacks} stacks</div>}
      </PanelTooltipContent>
    </Tooltip>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />;

/** The full stat line, which the table itself drops column by column as the panel narrows. */
function PlayerStatLines({
  player,
  name,
  lane,
}: {
  player: TrackerMatchPlayer;
  name: string;
  lane: (typeof LANES)[number] | undefined;
}) {
  const number = (value: number) => value.toLocaleString("en-US");
  const plural = (value: number, one: string, many: string) => `${number(value)} ${value === 1 ? one : many}`;
  return (
    <>
      <div className="font-medium">
        {name}
        {player.level > 0 && ` · level ${player.level}`}
        {lane && ` · ${lane.name} lane`}
      </div>
      <div className="text-muted-foreground tabular-nums">
        {player.kills}/{player.deaths}/{player.assists} K/D/A · {number(player.net_worth)} souls
      </div>
      <div className="text-muted-foreground tabular-nums">
        {plural(player.last_hits, "last hit", "last hits")} · {plural(player.denies, "deny", "denies")}
      </div>
      <div className="text-muted-foreground tabular-nums">
        {number(player.player_damage)} hero damage · {number(player.player_damage_taken)} taken
      </div>
      <div className="text-muted-foreground tabular-nums">
        {number(player.boss_damage)} objective damage · {number(player.player_healing)} healing
      </div>
    </>
  );
}

/** Both teams' end-of-match stats side by side, with the stat bars scaled to the lobby maximum. */
export function Scoreboard({
  match,
  accountId,
  ranks,
  laned,
  itemsById,
  nameOf,
  viewedAccountId,
  onViewPlayer,
}: {
  match: TrackerMatchMetadata;
  accountId: number;
  ranks: Rank[];
  laned: boolean;
  itemsById: Map<number, SlimUpgrade> | undefined;
  nameOf: (player: TrackerMatchPlayer) => string;
  /** The player the match timeline shows, or null while it shows every kill. */
  viewedAccountId: number | null;
  onViewPlayer: (accountId: number) => void;
}) {
  const { data: abilitiesById } = useQuery({
    ...trackerAbilitiesQueryOptions,
    select: (abilities) => new Map(abilities.map((ability) => [ability.id, ability])),
  });
  const { data: heroesById } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero])),
  });

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
                  <th colSpan={2} className="px-2 py-1 text-left font-normal">
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
              {players.map((player) => {
                const isTracked = player.account_id === accountId;
                const viewed = player.account_id === viewedAccountId;
                const name = nameOf(player);
                const build =
                  itemsById && abilitiesById
                    ? playerBuild(
                        player.items,
                        itemsById,
                        abilitiesById,
                        heroesById?.get(player.hero_id),
                        player.ability_stacks,
                      )
                    : null;
                const lane = laned ? LANES[laneIndex(player)] : undefined;
                return (
                  // One body per player, so hover and clicks cover both of their rows.
                  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- the name button is the keyboard path; the body widens the mouse target
                  <tbody
                    key={player.account_id}
                    onClick={() => onViewPlayer(player.account_id)}
                    className={cn(
                      "cursor-pointer hover:bg-muted/40",
                      isTracked && "bg-accent font-medium hover:bg-accent",
                      viewed && "bg-primary/15 hover:bg-primary/15",
                    )}
                  >
                    <tr>
                      {/* The cell holds only the portrait and a level badge, so it carries the label itself. */}
                      <td className="w-8 py-1 pl-2" aria-label={`${name}, level ${player.level}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="relative size-6 rounded-full"
                              style={lane && { boxShadow: `0 0 0 2px ${lane.color}` }}
                            >
                              <HeroImage heroId={player.hero_id} className="size-6 rounded-full" />
                              {player.level > 0 && (
                                <span className="absolute -right-1.5 -bottom-1 rounded-sm bg-background px-0.5 text-[9px] leading-tight font-semibold text-muted-foreground tabular-nums">
                                  {player.level}
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <PanelTooltipContent>
                            <PlayerStatLines player={player} name={name} lane={lane} />
                          </PanelTooltipContent>
                        </Tooltip>
                      </td>
                      <td className="w-full max-w-0 px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onViewPlayer(player.account_id);
                            }}
                            aria-pressed={viewed}
                            className="min-w-0 cursor-pointer truncate text-left transition-colors hover:text-primary"
                            title={`Show ${name}'s kills and deaths on the match timeline`}
                          >
                            {name}
                          </button>
                          {!isTracked && IS_DEV && (
                            <Link
                              to="/players/$accountId"
                              params={{ accountId: String(player.account_id) }}
                              className="shrink-0 text-muted-foreground hover:text-primary"
                              title="Open player tracker"
                            >
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                          {player.mvp_rank === 1 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Match MVP" />
                              </TooltipTrigger>
                              <PanelTooltipContent>Match MVP</PanelTooltipContent>
                            </Tooltip>
                          )}
                          {(player.rank_delta || player.demotion_protected || player.rank_badge != null) && (
                            <span className="ml-auto flex shrink-0 items-center gap-1 pl-1 text-xs font-normal">
                              {player.demotion_protected && (
                                <ShieldCheck
                                  className="size-3.5 text-muted-foreground"
                                  aria-label="Demotion protection prevented a rank drop"
                                />
                              )}
                              <RankDelta value={player.rank_delta} />
                              {player.rank_badge != null && (
                                <BadgeImage
                                  badge={player.rank_badge}
                                  ranks={ranks}
                                  className="-my-1 size-7 max-w-none"
                                />
                              )}
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
                    {build && (
                      <tr>
                        <td colSpan={7} className="px-2 pb-1.5 pl-10">
                          <div className="flex flex-wrap items-center gap-1">
                            {build.abilities.map((entry) => (
                              <AbilityChip key={entry.ability.id} entry={entry} />
                            ))}
                            {build.abilities.length > 0 && build.items.length > 0 && <Divider />}
                            {build.items.map((item) => (
                              <ItemChip key={`${item.upgrade.id}-${item.boughtAt}`} item={item} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        );
      })}
    </div>
  );
}
