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
import { formatShare } from "~/lib/format";
import { LANES } from "~/lib/team-builder/lanes";
import { type BuildAbility, type BuildItem, playerBuild } from "~/lib/tracker/build";
import { formatMatchDuration } from "~/lib/tracker/compute";
import { type PlayerContext, playerContext, PLAYER_STAT_COLUMNS, REVEAL, statMaxima } from "~/lib/tracker/player-stats";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import {
  type TrackerMatchMetadata,
  type TrackerMatchPlayer,
  trackerAbilitiesQueryOptions,
} from "~/queries/tracker-queries";

import { LOSS_TEXT_CLASS, WIN_TEXT_CLASS } from "../shared/colors";
import { PanelTooltipContent, TooltipHeader, TooltipStat, TooltipStats } from "../shared/PanelTooltipContent";
import { RankDelta } from "../shared/RankDelta";
import { PlayerCombatStats } from "./PlayerCombatStats";

export const TEAMS = [
  { key: "Team0", name: "The Hidden King" },
  { key: "Team1", name: "The Archmother" },
] as const;

function StatCell({
  value,
  max,
  label,
  barClassName,
  className,
}: {
  value: number;
  max: number;
  label: string;
  barClassName: string;
  className?: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <td className={cn("relative px-1.5 py-1 text-right tabular-nums", className)}>
      <span className={cn("absolute inset-y-1.5 left-0 rounded-r-sm", barClassName)} style={{ width: `${width}%` }} />
      <span className="relative">{label}</span>
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
        <TooltipHeader title={entry.ability.name} subtitle={`Level ${level} of ${MAX_ABILITY_LEVEL}`} />
        <TooltipStats>
          {entry.unlockedAt != null && <TooltipStat label="Unlocked" value={formatMatchDuration(entry.unlockedAt)} />}
          {entry.upgradedAt.length > 0 && (
            <TooltipStat label="Upgraded" value={entry.upgradedAt.map(formatMatchDuration).join(", ")} />
          )}
          {entry.stacks != null && <TooltipStat label="Stacks" value={entry.stacks.toLocaleString("en-US")} />}
        </TooltipStats>
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
        <TooltipHeader
          lead={<ItemImageFromAsset item={item.upgrade} className="size-8 shrink-0 rounded-sm" title="" />}
          title={item.upgrade.name}
          subtitle={item.upgrade.cost != null && `${item.upgrade.cost.toLocaleString("en-US")} souls`}
        />
        <TooltipStats>
          <TooltipStat label="Bought" value={formatMatchDuration(item.boughtAt)} />
          {sold && <TooltipStat label="Sold" value={formatMatchDuration(item.soldAt as number)} />}
          {item.imbuedInto && <TooltipStat label="Imbued into" value={item.imbuedInto.name} />}
          {item.stacks != null && <TooltipStat label="Stacks" value={item.stacks.toLocaleString("en-US")} />}
        </TooltipStats>
      </PanelTooltipContent>
    </Tooltip>
  );
}

const Divider = () => <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />;

/** Player, portrait, K/D/A, and one cell per stat column. */
const COLUMN_COUNT = 3 + PLAYER_STAT_COLUMNS.length;

/**
 * The stats the table dropped at this width, spelled out under the player. A phone shows the whole set here,
 * since there is no pointer to open the hover card with, and a wide panel shows only what no column carries.
 */
function PlayerStatStrip({
  player,
  context,
  ranks,
  pregameHeroName,
}: {
  player: TrackerMatchPlayer;
  context: PlayerContext;
  ranks: Rank[];
  pregameHeroName?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pb-1 text-[11px] text-muted-foreground tabular-nums">
      {(player.rank_delta || player.demotion_protected || player.rank_badge != null) && (
        // The name row hands the rank down here at phone width, where the name needs the room more.
        <span className="flex items-center gap-1 @sm:hidden">
          {player.demotion_protected && (
            <ShieldCheck className="size-3" aria-label="Demotion protection prevented a rank drop" />
          )}
          <RankDelta value={player.rank_delta} />
          {player.rank_badge != null && (
            <BadgeImage badge={player.rank_badge} ranks={ranks} className="-my-1 size-6 max-w-none" />
          )}
        </span>
      )}
      {PLAYER_STAT_COLUMNS.map((column) => (
        <span key={column.key} className={cn("whitespace-nowrap", REVEAL[column.reveal].strip)}>
          <span className="text-foreground">{column.format(column.value(player))}</span> {column.label.toLowerCase()}
        </span>
      ))}
      <span className="whitespace-nowrap">
        <span className="text-foreground">{formatShare(context.killShare)}</span> kill share
      </span>
      {context.deadForS != null && (
        <span className="whitespace-nowrap">
          <span className="text-foreground">{formatMatchDuration(context.deadForS)}</span> dead
        </span>
      )}
      <PlayerCombatStats player={player} pregameHeroName={pregameHeroName} />
    </div>
  );
}

/** Everything known about one player in the match, whatever the table has room to show. */
function PlayerHoverCard({
  player,
  name,
  lane,
  context,
}: {
  player: TrackerMatchPlayer;
  name: string;
  lane: (typeof LANES)[number] | undefined;
  context: PlayerContext;
}) {
  const whole = (value: number) => value.toLocaleString("en-US");
  return (
    <>
      <TooltipHeader
        lead={<HeroImage heroId={player.hero_id} className="size-8 shrink-0 rounded-full" title="" />}
        title={name}
        subtitle={[player.level > 0 && `Level ${player.level}`, lane && `${lane.name} lane`]
          .filter(Boolean)
          .join(" · ")}
      />
      <TooltipStats>
        <TooltipStat
          label="Kills / deaths / assists"
          value={`${player.kills} / ${player.deaths} / ${player.assists}`}
        />
        <TooltipStat label="Kill share" value={formatShare(context.killShare)} />
        <TooltipStat label="Souls" value={whole(player.net_worth)} />
        <TooltipStat label="Souls per minute" value={whole(Math.round(context.soulsPerMin))} />
        <TooltipStat label="Last hits" value={whole(player.last_hits)} />
        <TooltipStat label="Denies" value={whole(player.denies)} />
        <TooltipStat
          label="Hero damage"
          value={`${whole(player.player_damage)} · ${formatShare(context.damageShare)}`}
        />
        <TooltipStat label="Damage taken" value={whole(player.player_damage_taken)} />
        <TooltipStat label="Objective damage" value={whole(player.boss_damage)} />
        <TooltipStat label="Healing" value={whole(player.player_healing)} />
        {context.deadForS != null && <TooltipStat label="Time dead" value={formatMatchDuration(context.deadForS)} />}
      </TooltipStats>
    </>
  );
}

/** Both teams' end-of-match stats side by side, with the stat bars scaled to the lobby maximum. */
export function Scoreboard({
  match,
  accountId,
  ranks,
  laned,
  durationS,
  itemsById,
  nameOf,
  viewedAccountId,
  onViewPlayer,
}: {
  match: TrackerMatchMetadata;
  accountId: number;
  ranks: Rank[];
  laned: boolean;
  durationS: number;
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

  const maxima = useMemo(() => statMaxima(match.players), [match]);

  return (
    <div className="grid gap-4 @6xl:grid-cols-2">
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
                  <th className="px-1.5 py-1 text-right font-normal">K / D / A</th>
                  {PLAYER_STAT_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className={cn("px-1.5 py-1 text-right font-normal", REVEAL[column.reveal].cell)}
                      title={column.label}
                    >
                      {column.short}
                    </th>
                  ))}
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
                const context = playerContext(match, player, durationS);
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
                            <PlayerHoverCard player={player} name={name} lane={lane} context={context} />
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
                            <span className="ml-auto hidden shrink-0 items-center gap-1 pl-1 text-xs font-normal @sm:flex">
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
                      <td className="px-1.5 py-1 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                        {player.kills} / {player.deaths} / {player.assists}
                      </td>
                      {PLAYER_STAT_COLUMNS.map((column) => (
                        <StatCell
                          key={column.key}
                          value={column.value(player)}
                          max={maxima[column.key]}
                          label={column.format(column.value(player))}
                          barClassName={column.barClassName}
                          className={REVEAL[column.reveal].cell}
                        />
                      ))}
                    </tr>
                    <tr>
                      <td colSpan={COLUMN_COUNT} className="px-2 pl-10">
                        <PlayerStatStrip
                          player={player}
                          context={context}
                          ranks={ranks}
                          pregameHeroName={heroesById?.get(player.pregame_hero_id ?? 0)?.name}
                        />
                      </td>
                    </tr>
                    {build && (
                      <tr>
                        <td colSpan={COLUMN_COUNT} className="px-2 pb-1.5 pl-10">
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
