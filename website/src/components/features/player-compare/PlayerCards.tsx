import { useQuery } from "@tanstack/react-query";
import type { HeroStats } from "deadlock_api_client";
import { CrownIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { FormDots } from "~/components/domain/match/FormDots";
import { PlayerLink } from "~/components/domain/player/PlayerLink";
import { PlayerSearch } from "~/components/domain/player/PlayerSearch";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Delta } from "~/components/ui/delta";
import { Grid } from "~/components/ui/grid";
import { useReorder } from "~/components/ui/hooks/use-reorder";
import { NoValue } from "~/components/ui/no-value";
import { ReorderHandle, ReorderItem } from "~/components/ui/reorder-handle";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { Tooltip, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";
import { formatPercent } from "~/lib/format";
import { MAX_COMPARE_PLAYERS, scoreComparison } from "~/lib/player-compare";
import { formatPlayerMetricValue } from "~/lib/player-metrics";
import { badgeLabel } from "~/lib/rank-utils";
import { recentForm } from "~/lib/tracker/compute";
import type { CompareFilters } from "~/queries/player-compare-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";

import { QuickAddSuggestions } from "./QuickAddSuggestions";
import type { ComparedPlayer } from "./types";
import type { CompareMatchHistory } from "./useCompareMatchHistories";

const TOP_HEROES = 3;

const FORM_LENGTH = 10;

/** A player's most played heroes on the filters, most played first. */
function topHeroes(rows: readonly HeroStats[], accountId: number) {
  return rows
    .filter((row) => row.account_id === accountId && row.matches_played > 0)
    .sort((a, b) => b.matches_played - a.matches_played || a.hero_id - b.hero_id)
    .slice(0, TOP_HEROES);
}

/**
 * The players side by side as the page's headline, one card each in the player's color: who they are, their rank,
 * how many stats they win, their headline numbers, the heroes they play and how their last matches went. The card
 * holds the player's controls too: the name moves them (drag, or the arrow keys), the cross removes them. While there
 * is room, the last slot adds a player.
 */
export function PlayerCards({
  players,
  rows,
  histories,
  filters,
  onAdd,
  onRemove,
  onMove,
}: {
  players: ComparedPlayer[];
  /** The hero stats of every player on the filters, for the most played heroes. */
  rows: readonly HeroStats[];
  /** Match histories on the filters, in the players' order, for the recent form. */
  histories: readonly CompareMatchHistory[];
  /** The page's filters, for the teammates and opponents the add slot suggests. */
  filters: CompareFilters;
  onAdd: (accountId: number) => void;
  onRemove: (accountId: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const { data: ranks = [] } = useQuery(ranksQueryOptions);
  const reorder = useReorder({
    count: players.length,
    onMove,
    axis: "horizontal",
    itemLabel: (index) => players[index]?.name ?? `Player ${index + 1}`,
  });
  const { scored, tally, leaders, settled } = scoreComparison(players.map((player) => player.aggregate));
  const hasSlot = players.length < MAX_COMPARE_PLAYERS;
  // Two players with matches make a contest; until then a card shows its matches instead of stats won.
  const contest = players.filter((player) => player.aggregate !== null).length >= 2;
  const listRef = useRef<HTMLUListElement>(null);
  /** Removes a player and hands focus to the next card's remove button (the previous one's at the end), which is
   * there before and after the change, so focus never falls back to the page. */
  const removeAt = (index: number) => {
    const neighbour = players[index + 1] ?? players[index - 1];
    if (neighbour) {
      listRef.current?.querySelector<HTMLElement>(`[data-remove-player="${neighbour.accountId}"]`)?.focus();
    }
    onRemove(players[index].accountId);
  };
  /** Adds a suggested player; the suggestion goes away, so focus moves to the slot's search (to the last card's remove
   * button once the slot fills up), which is there before and after the change. */
  const addFromSlot = (accountId: number) => {
    const target =
      players.length + 1 >= MAX_COMPARE_PLAYERS
        ? listRef.current?.querySelector<HTMLElement>(`[data-remove-player="${players.at(-1)?.accountId}"]`)
        : listRef.current?.querySelector<HTMLElement>("[data-add-slot] button");
    target?.focus();
    onAdd(accountId);
  };
  const slots = Math.min(MAX_COMPARE_PLAYERS, players.length + (hasSlot ? 1 : 0)) as 2 | 3 | 4 | 5;

  return (
    <>
      <Grid columns={{ base: 1, sm: 2, lg: Math.min(slots, 3) as 2 | 3, xl: slots }} gap={2} asChild>
        <ul ref={listRef}>
          {players.map((player, index) => {
            const aggregate = player.aggregate;
            const leads = settled && leaders.includes(index);
            const history = histories[index];
            const climb = history?.rankClimb ?? null;
            // On the hero's filter, the last matches on that hero.
            const form = history?.heroMatches ? recentForm(history.heroMatches, FORM_LENGTH) : undefined;
            return (
              // The card is what moves: dragging its handle carries the whole card, and the others make room.
              <ReorderItem key={player.accountId} asChild {...reorder.boxProps(index)}>
                <Card asChild size="sm" accent={player.color} className="@container min-w-0">
                  <li>
                    {/* The numbers sit at the bottom: a name on two lines never pushes one card's stats below the
                        others' in the row. */}
                    <CardContent className="flex-1">
                      <Stack gap={2} justify="between" className="h-full">
                        <Inline gap={2} wrap="nowrap" align="start">
                          {/* Smaller in a narrow card, so the name keeps its room. */}
                          <SteamAvatar
                            src={player.avatar}
                            loading={player.profileLoading}
                            size="lg"
                            shape="rounded"
                            className="size-8 @stat-trio:size-12"
                          />
                          <Stack gap={0.5} className="min-w-0 flex-1">
                            {/* The controls share the name's line only, so the rank and playstyle below get the width. */}
                            <Inline gap={1} wrap="nowrap" align="start" justify="between">
                              {player.profileLoading ? (
                                <Skeleton className="h-5 w-28" />
                              ) : (
                                <Text variant="label" className="line-clamp-2 wrap-break-word" title={player.name}>
                                  <PlayerLink accountId={player.accountId} className="whitespace-normal">
                                    {player.name}
                                  </PlayerLink>
                                </Text>
                              )}
                              <Inline gap={0.5} wrap="nowrap" className="shrink-0">
                                {players.length >= 2 && (
                                  <ReorderHandle
                                    aria-label={`Move ${player.name}`}
                                    title="Drag, or press the arrow keys, to move"
                                    {...reorder.itemProps(index)}
                                  >
                                    <span className="sr-only">{player.name}</span>
                                  </ReorderHandle>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Remove ${player.name}`}
                                  title={`Remove ${player.name}`}
                                  data-remove-player={player.accountId}
                                  onClick={() => removeAt(index)}
                                >
                                  <XIcon aria-hidden="true" />
                                </Button>
                              </Inline>
                            </Inline>
                            {/* The rank (with its move on these dates), then the playstyle. */}
                            <Stack gap={0} className="min-w-0">
                              <Text variant="caption" tone="muted">
                                {player.rankBadge ? (
                                  // One line: the rank's name gives way (truncates) before the move is cut off.
                                  <Inline gap={1} wrap="nowrap" asChild>
                                    <span>
                                      <BadgeImage badge={player.rankBadge} ranks={ranks} size="inline" alt="" />
                                      <span className="sr-only @stat-trio:not-sr-only @stat-trio:truncate">
                                        {badgeLabel(ranks, player.rankBadge)}
                                      </span>
                                      {/* Who is climbing: the rank's move over the page's dates, in divisions. */}
                                      {climb != null && (
                                        <Delta
                                          className="shrink-0"
                                          value={climb}
                                          format="number"
                                          digits={0}
                                          sign="arrow"
                                          unit=" div"
                                          title={`${climb > 0 ? "+" : ""}${climb} divisions on these dates`}
                                        />
                                      )}
                                    </span>
                                  </Inline>
                                ) : player.rankBadge === undefined ? (
                                  <Skeleton className="h-4 w-20" />
                                ) : (
                                  "Unranked"
                                )}
                              </Text>
                              {/* The line is always there, so the card does not grow when the playstyle arrives. */}
                              <Text variant="caption" tone="default" wrap="truncate">
                                {player.playstyle ?? "\u00a0"}
                              </Text>
                            </Stack>
                          </Stack>
                        </Inline>

                        <Stack gap={2}>
                          {/* The verdict first: stats won out of the stats scored, and who leads; then the record. */}
                          {aggregate === null ? (
                            <Text tone="muted">No matches on these filters</Text>
                          ) : (
                            <StatGroup
                              variant="plain"
                              size="sm"
                              // Equal columns, so a stat sits at the same place on every card; one never narrower than its
                              // value, so a crowned "12/19" keeps its "/19".
                              className="grid-cols-2 gap-2 @stat-trio:grid-cols-[minmax(max-content,1.5fr)_repeat(2,minmax(max-content,1fr))] @md:grid-cols-[minmax(max-content,1.5fr)_repeat(4,minmax(max-content,1fr))]"
                            >
                              {!contest ? (
                                // Nothing to win alone: the sample size instead.
                                <Stat
                                  label="Matches"
                                  value={
                                    aggregate ? (
                                      formatPlayerMetricValue(aggregate.matches, "integer")
                                    ) : (
                                      <Skeleton className="h-6 w-10" />
                                    )
                                  }
                                />
                              ) : (
                                <Stat
                                  label="Stats won"
                                  value={
                                    !settled || aggregate === undefined ? (
                                      <Skeleton className="h-6 w-10" />
                                    ) : players.length < 2 ? (
                                      <NoValue label="Add an opponent to score" />
                                    ) : (
                                      <Inline gap={1} wrap="nowrap" asChild>
                                        <span>
                                          {leads && <CrownIcon aria-hidden="true" className="size-4 shrink-0" />}
                                          {tally[index]}
                                          <span className="text-muted-foreground">/{scored.length}</span>
                                          {leads && (
                                            <span className="sr-only">
                                              , {leaders.length > 1 ? "tied lead" : "leads"}
                                            </span>
                                          )}
                                        </span>
                                      </Inline>
                                    )
                                  }
                                />
                              )}
                              <Stat
                                label="Win rate"
                                value={
                                  aggregate ? formatPercent(aggregate.winRate, 1) : <Skeleton className="h-6 w-14" />
                                }
                              />
                              {/* A narrow card leaves the KDA to the table below. */}
                              <Stat
                                className="hidden @stat-trio:flex"
                                label="KDA"
                                value={
                                  aggregate ? (
                                    formatPlayerMetricValue(aggregate.kda, "decimal2")
                                  ) : (
                                    <Skeleton className="h-6 w-12" />
                                  )
                                }
                              />
                              {/* A wide card (a big screen) has room for the farm and the MVPs too. */}
                              <Stat
                                className="hidden @md:flex"
                                label="Souls/min"
                                value={
                                  aggregate ? (
                                    formatPlayerMetricValue(aggregate.netWorthPerMin, "integer")
                                  ) : (
                                    <Skeleton className="h-6 w-12" />
                                  )
                                }
                              />
                              <Stat
                                className="hidden @md:flex"
                                label="MVP rate"
                                value={
                                  aggregate === undefined ? (
                                    <Skeleton className="h-6 w-12" />
                                  ) : aggregate.mvpRate == null ? (
                                    <NoValue />
                                  ) : (
                                    formatPercent(aggregate.mvpRate, 1)
                                  )
                                }
                              />
                            </StatGroup>
                          )}
                          {aggregate && (
                            <Text variant="caption" tone="muted" numeric="tabular" wrap="truncate">
                              {/* Alone, the matches are a stat of their own above. */}
                              {contest && `${formatPlayerMetricValue(aggregate.matches, "integer")} matches · `}
                              {[aggregate.kills, aggregate.deaths, aggregate.assists]
                                .map((value) => formatPlayerMetricValue(value, "decimal1"))
                                .join(" / ")}{" "}
                              K/D/A
                            </Text>
                          )}

                          {/* Without matches on the filters there are no heroes or results to show. */}
                          {aggregate !== null && (
                            <Inline gap={3} justify="between" align="end">
                              {/* On one hero's filter every player's most played is that hero. */}
                              {filters.heroId == null && (
                                <Stack gap={1}>
                                  <Text variant="caption" tone="muted">
                                    Most played
                                  </Text>
                                  <Inline gap={1} wrap="nowrap">
                                    {aggregate === undefined ? (
                                      <Skeleton className="h-7 w-24" />
                                    ) : aggregate === null ? (
                                      <NoValue />
                                    ) : (
                                      topHeroes(rows, player.accountId).map((row, heroIndex) => (
                                        <MostPlayedHero
                                          key={row.hero_id}
                                          row={row}
                                          // A narrow card keeps two, so the recent form fits beside them.
                                          className={heroIndex >= 2 ? "hidden @stat-trio:inline-block" : undefined}
                                        />
                                      ))
                                    )}
                                  </Inline>
                                </Stack>
                              )}
                              <Stack gap={1} align="end">
                                <Text variant="caption" tone="muted">
                                  Last {FORM_LENGTH}
                                </Text>
                                {history?.isError ? (
                                  <NoValue label="Match history unavailable" />
                                ) : form === undefined ? (
                                  <Skeleton className="h-3 w-24" />
                                ) : form.length === 0 ? (
                                  <NoValue label="No matches" />
                                ) : (
                                  <FormDots form={form} />
                                )}
                              </Stack>
                            </Inline>
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </li>
                </Card>
              </ReorderItem>
            );
          })}
          {hasSlot && (
            <Card asChild size="sm" tone="outline" className="min-w-0 justify-center">
              <li data-add-slot="">
                <CardContent>
                  <Stack gap={2} align="center">
                    <Text variant="label">
                      {players.length < 2
                        ? "Add an opponent"
                        : `Add player ${players.length + 1} of ${MAX_COMPARE_PLAYERS}`}
                    </Text>
                    <PlayerSearch
                      label="Search a player"
                      align="center"
                      disabledAccountIds={players.map((player) => player.accountId)}
                      onValueChange={(player) => onAdd(player.accountId)}
                    />
                    <QuickAddSuggestions
                      accountIds={players.map((player) => player.accountId)}
                      filters={filters}
                      onAdd={addFromSlot}
                    />
                  </Stack>
                </CardContent>
              </li>
            </Card>
          )}
        </ul>
      </Grid>
      <span className="sr-only" aria-live="polite">
        {reorder.announcement}
      </span>
    </>
  );
}

/** One of a card's most played heroes: its icon, a tab stop read as the hero and its record, the numbers on hover. */
function MostPlayedHero({ row, className }: { row: HeroStats; className?: string }) {
  const winRate = formatPercent(row.wins / row.matches_played, 0);
  return (
    <Tooltip
      content={
        <TooltipStats variant="plain">
          <TooltipStat label="Matches" value={row.matches_played} />
          <TooltipStat label="Win rate" value={winRate} />
        </TooltipStats>
      }
    >
      <TooltipTarget className={className}>
        {/* The image's alt names the hero; the record follows for a screen reader. */}
        <HeroImage heroId={row.hero_id} shape="rounded" ring="border" className="size-7" />
        <span className="sr-only">
          {row.matches_played} matches, {winRate} win rate
        </span>
      </TooltipTarget>
    </Tooltip>
  );
}
