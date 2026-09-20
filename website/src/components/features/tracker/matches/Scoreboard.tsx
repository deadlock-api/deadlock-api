import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { Rank } from "deadlock_api_client";
import { ArrowDown, ArrowUp, Crown, ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { RankDelta } from "~/components/features/tracker/shared/RankDelta";
import { Box } from "~/components/ui/box";
import { Button } from "~/components/ui/button";
import { CornerBadge } from "~/components/ui/corner-badge";
import { DetailPopover } from "~/components/ui/detail-popover";
import { Pips } from "~/components/ui/pips";
import { ProgressBar } from "~/components/ui/progress-bar";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { ariaSort, SortButton } from "~/components/ui/sort-button";
import { Stack } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { Tooltip } from "~/components/ui/tooltip";
import { IS_DEV } from "~/lib/constants";
import { formatShare } from "~/lib/format";
import { LANES } from "~/lib/team-builder/lanes";
import { TONE_TEXT } from "~/lib/tone";
import { type BuildAbility, type BuildItem, playerBuild } from "~/lib/tracker/build";
import { formatMatchDuration } from "~/lib/tracker/compute";
import {
  type PlayerContext,
  playerContext,
  PLAYER_STAT_COLUMNS,
  REVEAL,
  sortScoreboardPlayers,
  statMaxima,
} from "~/lib/tracker/player-stats";
import { TEAMS } from "~/lib/tracker/teams";
import { cn } from "~/lib/utils";
import { heroesQueryOptions, type SlimUpgrade } from "~/queries/asset-queries";
import type { TrackerAbility, TrackerMatchMetadata, TrackerMatchPlayer } from "~/queries/tracker-queries";
import type { Color } from "~/types/general";

import { BuildTimelineDialog } from "./BuildTimelineDialog";
import { PlayerCombatStats } from "./PlayerCombatStats";
import { TeamStatsDetails } from "./TeamStatsDetails";

function ColumnSortButton({
  label,
  short,
  active,
  direction,
  onClick,
}: {
  label: string;
  short: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <SortButton
      active={active}
      sortDir={direction}
      align="end"
      size="sm"
      onClick={onClick}
      aria-label={`Sort scoreboard by ${label.toLowerCase()}, ${active && direction === "desc" ? "lowest" : "highest"} first`}
      title={label}
      className="gap-0.5 whitespace-nowrap"
    >
      {short}
    </SortButton>
  );
}

function StatCell({
  value,
  max,
  label,
  barColor,
  className,
}: {
  value: number;
  max: number;
  label: string;
  barColor: Color;
  className?: string;
}) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <TableCell className={cn("relative px-1.5 py-1 text-end tabular-nums", className)}>
      <ProgressBar variant="cell" value={width} max={100} color={barColor} />
      <span className="relative">{label}</span>
    </TableCell>
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
    <DetailPopover
      label={entry.ability.name}
      size="icon-xs"
      details={
        <>
          <TooltipHeader title={entry.ability.name} subtitle={`Level ${level} of ${MAX_ABILITY_LEVEL}`} />
          <TooltipStats>
            {entry.unlockedAt != null && <TooltipStat label="Unlocked" value={formatMatchDuration(entry.unlockedAt)} />}
            {entry.upgradedAt.length > 0 && (
              <TooltipStat label="Upgraded" value={entry.upgradedAt.map(formatMatchDuration).join(", ")} />
            )}
            {entry.stacks != null && <TooltipStat label="Stacks" value={entry.stacks.toLocaleString("en-US")} />}
          </TooltipStats>
        </>
      }
    >
      <span className="flex flex-col items-center gap-0.5">
        <span className="relative">
          <AbilityImage abilityId={entry.ability.id} className="size-5" title="" />
          {entry.stacks != null && <StackBadge stacks={entry.stacks} />}
        </span>
        <Pips value={level} max={MAX_ABILITY_LEVEL} label={`Level ${level} of ${MAX_ABILITY_LEVEL}`} />
      </span>
    </DetailPopover>
  );
}

function StackBadge({ stacks }: { stacks: number }) {
  return <CornerBadge>{stacks}</CornerBadge>;
}

function ItemChip({ item }: { item: BuildItem }) {
  return (
    <DetailPopover
      label={item.upgrade.name}
      size="icon-xs"
      details={
        <>
          <TooltipHeader
            leading={<ItemImage item={item.upgrade} className="size-8 shrink-0" title="" />}
            title={item.upgrade.name}
            subtitle={item.upgrade.cost != null && `${item.upgrade.cost.toLocaleString("en-US")} souls`}
          />
          <TooltipStats>
            <TooltipStat label="Bought" value={formatMatchDuration(item.boughtAt)} />
            {item.imbuedInto && <TooltipStat label="Imbued into" value={item.imbuedInto.name} />}
            {item.stacks != null && <TooltipStat label="Stacks" value={item.stacks.toLocaleString("en-US")} />}
          </TooltipStats>
        </>
      }
    >
      <span className="relative">
        <ItemImage item={item.upgrade} className="size-5" title="" />
        {item.imbuedInto && (
          <StatusDot color="var(--chart-6)" ring="surface" className="absolute -end-0.5 -bottom-0.5" />
        )}
        {item.stacks != null && <StackBadge stacks={item.stacks} />}
      </span>
    </DetailPopover>
  );
}

const Divider = () => (
  <Box className="h-4">
    <Separator orientation="vertical" />
  </Box>
);

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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pb-1 text-2xs text-muted-foreground tabular-nums">
      {(player.rank_delta || player.demotion_protected || player.rank_badge != null) && (
        // The name row hands the rank down here at phone width, where the name needs the room more.
        <span className="flex items-center gap-1 @sm:hidden">
          {player.demotion_protected && (
            <ShieldCheck className="size-3" aria-label="Demotion protection prevented a rank drop" />
          )}
          <RankDelta value={player.rank_delta} />
          {player.rank_badge != null && <BadgeImage badge={player.rank_badge} ranks={ranks} size="inline" />}
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
function PlayerStatsDetails({
  player,
  name,
  heroName,
  lane,
  context,
}: {
  player: TrackerMatchPlayer;
  name: string;
  heroName?: string;
  lane: (typeof LANES)[number] | undefined;
  context: PlayerContext;
}) {
  const whole = (value: number) => value.toLocaleString("en-US");
  return (
    <>
      <TooltipHeader
        leading={<HeroImage heroId={player.hero_id} shape="circle" className="size-8 shrink-0" title="" />}
        title={name}
        subtitle={[heroName, player.level > 0 && `Level ${player.level}`, lane && `${lane.name} lane`]
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
  abilitiesById,
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
  abilitiesById: Map<number, TrackerAbility> | undefined;
  nameOf: (player: TrackerMatchPlayer) => string;
  /** The player the match timeline shows, or null while it shows every kill. */
  viewedAccountId: number | null;
  onViewPlayer: (accountId: number) => void;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const sortLabel = sortKey === "kda" ? "KDA" : PLAYER_STAT_COLUMNS.find((column) => column.key === sortKey)?.short;
  const changeSort = (key: string) => {
    setSortDirection(sortKey === key && sortDirection === "desc" ? "asc" : "desc");
    setSortKey(key);
  };
  const { data: heroesById } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero])),
  });

  const maxima = useMemo(() => statMaxima(match.players), [match]);
  const hasWinner = TEAMS.some((team) => team.key === match.winning_team);

  return (
    <div className="grid gap-4 @6xl:grid-cols-2">
      {TEAMS.map((team, teamIndex) => {
        const teamPlayers = match.players.filter((player) => player.team === team.key);
        const players = sortScoreboardPlayers(laned ? byLane(teamPlayers) : teamPlayers, sortKey, sortDirection);
        const won = match.winning_team === team.key;
        const averageBadge = teamIndex === 0 ? match.average_badge_team0 : match.average_badge_team1;
        const teamKills = teamPlayers.reduce((sum, player) => sum + player.kills, 0);
        const teamSouls = teamPlayers.reduce((sum, player) => sum + player.net_worth, 0);
        return (
          <Stack key={team.key} gap={1.5} className="@container">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <DetailPopover
                label={`${team.name} team totals`}
                size="sm"
                underline="dotted"
                className="h-6 px-1.5 text-sm font-semibold"
                details={<TeamStatsDetails name={team.name} players={teamPlayers} lobbyPlayers={match.players} />}
              >
                {team.name}
              </DetailPopover>
              <span
                className={cn("text-xs font-bold", TONE_TEXT[hasWinner ? (won ? "positive" : "negative") : "muted"])}
              >
                {hasWinner ? (won ? "Victory" : "Defeat") : "Result unavailable"}
              </span>
              {averageBadge != null && averageBadge > 0 && (
                <BadgeImage badge={averageBadge} ranks={ranks} className="size-5" />
              )}
              <span className="ms-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{teamKills}</span> kills ·{" "}
                <span className="font-semibold text-foreground">{teamSouls.toLocaleString("en-US")}</span> souls
              </span>
            </div>
            <Table>
              <TableCaption className="sr-only">{team.name} scoreboard</TableCaption>
              <TableHeader>
                <TableRow className="text-xs text-muted-foreground">
                  <TableHead colSpan={2} className="h-auto py-1 font-normal">
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-disabled={sortKey == null}
                      aria-label={
                        sortKey == null
                          ? `Players in ${laned ? "lane" : "team"} order`
                          : `Restore ${laned ? "lane" : "team"} order`
                      }
                      title={
                        sortKey == null
                          ? `Players in ${laned ? "lane" : "team"} order`
                          : `Restore ${laned ? "lane" : "team"} order`
                      }
                      onClick={sortKey ? () => setSortKey(null) : undefined}
                      className="hidden font-normal @lg:inline-flex"
                    >
                      Player
                      {sortKey && (
                        <span className="text-3xs text-muted-foreground">
                          {sortLabel}
                          {sortDirection === "desc" ? "↓" : "↑"}
                        </span>
                      )}
                    </Button>
                    <div className="flex items-center gap-0.5 @lg:hidden">
                      <Select
                        value={sortKey ?? "default"}
                        onValueChange={(value) => (value === "default" ? setSortKey(null) : changeSort(value))}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Sort ${team.name} scoreboard`}
                          className="min-w-0 gap-1 px-1.5"
                        >
                          <SelectValue>{sortLabel ?? "Player"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent position="popper" align="start" collisionPadding={16}>
                          <SelectGroup>
                            <SelectItem value="default">{laned ? "Lane" : "Team"} order</SelectItem>
                            <SelectItem value="kda">KDA ratio</SelectItem>
                            {PLAYER_STAT_COLUMNS.map((column) => (
                              <SelectItem key={column.key} value={column.key}>
                                {column.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {sortKey && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Sort ${team.name} scoreboard ${sortDirection === "desc" ? "lowest" : "highest"} first`}
                          title={sortDirection === "desc" ? "Sort lowest first" : "Sort highest first"}
                          onClick={() => setSortDirection((direction) => (direction === "desc" ? "asc" : "desc"))}
                        >
                          {sortDirection === "desc" ? <ArrowDown /> : <ArrowUp />}
                        </Button>
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className="h-auto px-1.5 py-1 text-end font-normal"
                    aria-sort={ariaSort(sortKey === "kda", sortDirection)}
                  >
                    <ColumnSortButton
                      label="KDA ratio"
                      short="K / D / A"
                      active={sortKey === "kda"}
                      direction={sortDirection}
                      onClick={() => changeSort("kda")}
                    />
                  </TableHead>
                  {PLAYER_STAT_COLUMNS.map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn("h-auto px-1.5 py-1 text-end font-normal", REVEAL[column.reveal].cell)}
                      title={column.label}
                      aria-sort={ariaSort(sortKey === column.key, sortDirection)}
                    >
                      <ColumnSortButton
                        label={column.label}
                        short={column.short}
                        active={sortKey === column.key}
                        direction={sortDirection}
                        onClick={() => changeSort(column.key)}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
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
                const finalItems = build?.items.filter((item) => item.soldAt == null) ?? [];
                const lane = laned ? LANES[laneIndex(player)] : undefined;
                const context = playerContext(match, player, durationS);
                return (
                  // One body per player, so hover and clicks cover both of their rows.
                  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- the name button is the keyboard path; the body widens the mouse target
                  <TableBody
                    key={player.account_id}
                    data-interactive
                    data-state={viewed ? "viewed" : isTracked ? "current" : undefined}
                    onClick={() => onViewPlayer(player.account_id)}
                    className={cn(isTracked && "font-medium")}
                  >
                    <TableRow data-plain="">
                      {/* The cell holds only the portrait and a level badge, so it carries the label itself. */}
                      <TableCell className="w-8 py-1 ps-2 pe-0" aria-label={`${name}, level ${player.level}`}>
                        <DetailPopover
                          label={`${name}'s match stats`}
                          size="icon-xs"
                          details={
                            <PlayerStatsDetails
                              player={player}
                              name={name}
                              heroName={heroesById?.get(player.hero_id)?.name}
                              lane={lane}
                              context={context}
                            />
                          }
                        >
                          <span aria-hidden="true" className="relative block size-6">
                            <HeroImage
                              heroId={player.hero_id}
                              shape="circle"
                              ringColor={lane?.color}
                              className="size-6"
                              title=""
                            />
                            {player.level > 0 && (
                              <CornerBadge corner="bottom-end" tone="muted">
                                {player.level}
                              </CornerBadge>
                            )}
                          </span>
                        </DetailPopover>
                      </TableCell>
                      <TableCell className="w-full max-w-0 py-1">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="text"
                            size="inline"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onViewPlayer(player.account_id);
                            }}
                            aria-pressed={viewed}
                            className="min-h-6 min-w-6 justify-start text-start"
                            title={`Show ${name}'s kills and deaths on the match timeline`}
                          >
                            <span className="min-w-0 truncate">{name}</span>
                          </Button>
                          {!isTracked && IS_DEV && (
                            <Link
                              to="/tracker/players/$accountId"
                              params={{ accountId: String(player.account_id) }}
                              onClick={(event) => event.stopPropagation()}
                              className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-primary"
                              title="Open player tracker"
                            >
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                          {player.mvp_rank === 1 && (
                            <Tooltip content="Match MVP">
                              <Crown className="size-3.5 shrink-0 text-warning" aria-label="Match MVP" />
                            </Tooltip>
                          )}
                          {(player.rank_delta || player.demotion_protected || player.rank_badge != null) && (
                            <span className="ms-auto hidden shrink-0 items-center gap-1 ps-1 text-xs font-normal @sm:flex">
                              {player.demotion_protected && (
                                <ShieldCheck
                                  className="size-3.5 text-muted-foreground"
                                  aria-label="Demotion protection prevented a rank drop"
                                />
                              )}
                              <RankDelta value={player.rank_delta} />
                              {player.rank_badge != null && (
                                <BadgeImage badge={player.rank_badge} ranks={ranks} size="inline" />
                              )}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-1.5 py-1 text-end text-muted-foreground tabular-nums">
                        {player.kills} / {player.deaths} / {player.assists}
                      </TableCell>
                      {PLAYER_STAT_COLUMNS.map((column) => (
                        <StatCell
                          key={column.key}
                          value={column.value(player)}
                          max={maxima[column.key]}
                          label={column.format(column.value(player))}
                          barColor={column.barColor}
                          className={REVEAL[column.reveal].cell}
                        />
                      ))}
                    </TableRow>
                    <TableRow data-plain="">
                      <TableCell colSpan={COLUMN_COUNT} className="py-0 ps-10 whitespace-normal">
                        <PlayerStatStrip
                          player={player}
                          context={context}
                          ranks={ranks}
                          pregameHeroName={heroesById?.get(player.pregame_hero_id ?? 0)?.name}
                        />
                      </TableCell>
                    </TableRow>
                    {build && (
                      <TableRow data-plain="">
                        <TableCell colSpan={COLUMN_COUNT} className="ps-10 pt-0 pb-1.5 whitespace-normal">
                          <div className="flex flex-wrap items-center gap-1">
                            {build.abilities.map((entry) => (
                              <AbilityChip key={entry.ability.id} entry={entry} />
                            ))}
                            {build.abilities.length > 0 && finalItems.length > 0 && <Divider />}
                            {finalItems.map((item) => (
                              <ItemChip key={`${item.upgrade.id}-${item.boughtAt}`} item={item} />
                            ))}
                            <BuildTimelineDialog build={build} playerName={name} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                );
              })}
            </Table>
          </Stack>
        );
      })}
    </div>
  );
}
