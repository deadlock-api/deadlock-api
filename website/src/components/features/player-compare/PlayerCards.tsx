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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { useReorder } from "~/components/ui/hooks/use-reorder";
import { NoValue } from "~/components/ui/no-value";
import { ReorderHandle } from "~/components/ui/reorder-handle";
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
  const slots = Math.min(MAX_COMPARE_PLAYERS, players.length + (hasSlot ? 1 : 0)) as 2 | 3 | 4 | 5;

  return (
    <>
      <Grid columns={{ base: 1, sm: 2, lg: Math.min(slots, 3) as 2 | 3, xl: slots }} gap={3} asChild>
        <ul ref={listRef}>
          {players.map((player, index) => {
            const aggregate = player.aggregate;
            const leads = settled && leaders.includes(index);
            const history = histories[index];
            // On the hero's filter, the last matches on that hero.
            const form = history?.matches
              ? recentForm(
                  filters.heroId == null
                    ? history.matches
                    : history.matches.filter((match) => match.hero_id === filters.heroId),
                  FORM_LENGTH,
                )
              : undefined;
            return (
              <Card key={player.accountId} asChild size="sm" accent={player.color} className="min-w-0">
                <li>
                  <CardContent>
                    <Stack gap={3}>
                      <Inline gap={3} wrap="nowrap" align="start">
                        <SteamAvatar src={player.avatar} loading={player.profileLoading} size="lg" shape="rounded" />
                        <Stack gap={0.5} className="min-w-0 flex-1">
                          {player.profileLoading ? (
                            <Skeleton className="h-5 w-28" />
                          ) : (
                            <Text variant="label" className="truncate" title={player.name}>
                              <PlayerLink accountId={player.accountId}>{player.name}</PlayerLink>
                            </Text>
                          )}
                          <Text variant="caption" tone="muted" className="truncate">
                            {aggregate?.rankBadge ? (
                              <Inline gap={1} wrap="nowrap" asChild>
                                <span>
                                  <BadgeImage badge={aggregate.rankBadge} ranks={ranks} size="inline" alt="" />
                                  {badgeLabel(ranks, aggregate.rankBadge)}
                                </span>
                              </Inline>
                            ) : aggregate?.rankBadge === undefined ? (
                              <Skeleton className="h-4 w-20" />
                            ) : (
                              "Unranked"
                            )}
                          </Text>
                          {player.playstyle && (
                            <Badge variant="muted" className="w-fit">
                              {player.playstyle}
                            </Badge>
                          )}
                        </Stack>
                        <Inline gap={0.5} wrap="nowrap">
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

                      {/* The verdict first: stats won out of the stats scored, and who leads; then the record. */}
                      {aggregate === null ? (
                        <Text tone="muted">No matches on these filters</Text>
                      ) : (
                        <StatGroup variant="plain" className="grid-cols-2">
                          <Stat
                            label="Stats won"
                            value={
                              !settled || aggregate === undefined ? (
                                <Skeleton className="h-7 w-12" />
                              ) : players.length < 2 ? (
                                <NoValue label="Add an opponent to score" />
                              ) : (
                                <span className={leads ? "text-primary" : undefined}>{tally[index]}</span>
                              )
                            }
                            sub={
                              leads ? (
                                <Badge variant="soft">
                                  <CrownIcon aria-hidden="true" />
                                  {leaders.length > 1 ? "Tied lead" : "Leads"}
                                </Badge>
                              ) : settled && players.length >= 2 ? (
                                `of ${scored.length}`
                              ) : undefined
                            }
                          />
                          <Stat
                            label="Win rate"
                            value={aggregate ? formatPercent(aggregate.winRate, 1) : <Skeleton className="h-7 w-16" />}
                            sub={
                              aggregate &&
                              `${formatPlayerMetricValue(aggregate.matches, "integer")} matches · ${formatPlayerMetricValue(aggregate.kda, "decimal2")} KDA`
                            }
                          />
                        </StatGroup>
                      )}

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
                                topHeroes(rows, player.accountId).map((row) => (
                                  <Tooltip
                                    key={row.hero_id}
                                    content={
                                      <TooltipStats variant="plain">
                                        <TooltipStat label="Matches" value={row.matches_played} />
                                        <TooltipStat
                                          label="Win rate"
                                          value={formatPercent(row.wins / row.matches_played, 0)}
                                        />
                                      </TooltipStats>
                                    }
                                  >
                                    <TooltipTarget>
                                      <HeroImage
                                        heroId={row.hero_id}
                                        shape="rounded"
                                        ring="border"
                                        className="size-7"
                                      />
                                    </TooltipTarget>
                                  </Tooltip>
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
                    </Stack>
                  </CardContent>
                </li>
              </Card>
            );
          })}
          {hasSlot && (
            <Card asChild size="sm" tone="outline" className="min-w-0 justify-center">
              <li>
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
                      onAdd={onAdd}
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
