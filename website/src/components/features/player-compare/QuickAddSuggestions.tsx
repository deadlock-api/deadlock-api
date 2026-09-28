import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";

import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useSteamProfiles } from "~/hooks/useSteamProfiles";
import { type CompareFilters, compareCompanionParams } from "~/queries/player-compare-queries";
import { trackerEnemyStatsQueryOptions, trackerMateStatsQueryOptions } from "~/queries/tracker-queries";

/** How many suggestions the card shows in all, and how many each group keeps when both have enough. */
const SUGGESTION_TOTAL = 3;
const SUGGESTION_PER_GROUP = 2;

interface Companion {
  accountId: number;
  matches: number;
}

/** The most frequent companions first, without the players already compared. */
function topCompanions(
  rows: readonly { id: number; matches_played: number }[] | undefined,
  exclude: ReadonlySet<number>,
): Companion[] {
  if (!rows) return [];
  return rows
    .filter((row) => !exclude.has(row.id))
    .sort((a, b) => b.matches_played - a.matches_played)
    .slice(0, SUGGESTION_TOTAL)
    .map((row) => ({ accountId: row.id, matches: row.matches_played }));
}

/**
 * Up to three suggestions split between teammates and opponents: two teammates and one opponent when both have
 * enough, and a group with fewer leaves its room to the other. A player who was both is offered once, as a teammate.
 */
function splitSuggestions(mates: Companion[], enemies: Companion[]): { mates: Companion[]; enemies: Companion[] } {
  const mateIds = new Set(mates.map((mate) => mate.accountId));
  const opponents = enemies.filter((enemy) => !mateIds.has(enemy.accountId));
  const mateCount = Math.min(mates.length, Math.max(SUGGESTION_PER_GROUP, SUGGESTION_TOTAL - opponents.length));
  return {
    mates: mates.slice(0, mateCount),
    enemies: opponents.slice(0, SUGGESTION_TOTAL - mateCount),
  };
}

function useQuickAddSuggestions(accountIds: readonly number[], filters: CompareFilters) {
  // Whose teammates to suggest: the lowest account id rather than the first column, so reordering the players never
  // swaps the suggestions.
  const first = accountIds.length > 0 ? Math.min(...accountIds) : undefined;
  const enabled = first !== undefined;
  const params = compareCompanionParams(first ?? 0, filters);
  // Another player to suggest for (an add or a removal) keeps the old suggestions up until the new ones arrive, so the slot
  // does not collapse to a skeleton and back.
  const mateQuery = useQuery({ ...trackerMateStatsQueryOptions(params), enabled, placeholderData: keepPreviousData });
  const enemyQuery = useQuery({ ...trackerEnemyStatsQueryOptions(params), enabled, placeholderData: keepPreviousData });

  const suggestions = useMemo(() => {
    const exclude = new Set(accountIds);
    return splitSuggestions(
      topCompanions(
        mateQuery.data?.map((row) => ({ id: row.mate_id, matches_played: row.matches_played })),
        exclude,
      ),
      topCompanions(
        enemyQuery.data?.map((row) => ({ id: row.enemy_id, matches_played: row.matches_played })),
        exclude,
      ),
    );
  }, [accountIds, mateQuery.data, enemyQuery.data]);

  const profileIds = useMemo(
    () => [...suggestions.mates, ...suggestions.enemies].map((companion) => companion.accountId),
    [suggestions],
  );
  const { profiles, isLoading: profilesLoading } = useSteamProfiles(profileIds);

  return {
    enabled,
    isPending: enabled && (mateQuery.isPending || enemyQuery.isPending),
    ...suggestions,
    profiles,
    profilesLoading,
  };
}

/** One suggestion: the player, and how often they met the compared player, together or against. */
function SuggestionRow({
  companion: { accountId, matches },
  relation,
  profiles,
  profilesLoading,
  onAdd,
}: {
  companion: Companion;
  relation: "together" | "against";
  profiles: ReturnType<typeof useSteamProfiles>["profiles"];
  profilesLoading: boolean;
  onAdd: (accountId: number) => void;
}) {
  const profile = profiles[accountId];
  const name = profile?.personaname ?? `Player ${accountId}`;
  return (
    <li>
      <Button
        variant="ghost"
        size="sm-tight"
        className="w-full justify-start"
        aria-label={`Add ${name}, ${matches} ${matches === 1 ? "game" : "games"} ${relation}`}
        onClick={() => onAdd(accountId)}
      >
        <PlayerCell
          size="sm"
          accountId={accountId}
          name={profile?.personaname}
          avatar={profile?.avatar}
          loading={profilesLoading && !profile}
          className="flex-1"
        />
        <Text variant="caption" tone="muted" numeric="tabular" className="shrink-0">
          {matches} {relation}
        </Text>
      </Button>
    </li>
  );
}

/**
 * One-click additions for the comparison: the players one compared player (the lowest account id) queues with and
 * meets most, on the page's filters, in one list of up to three. While it loads, a skeleton of the same three rows
 * holds its place; it shows nothing when there is nobody to suggest or the request fails.
 */
export function QuickAddSuggestions({
  accountIds,
  filters,
  onAdd,
}: {
  accountIds: readonly number[];
  filters: CompareFilters;
  onAdd: (accountId: number) => void;
}) {
  const labelId = useId();
  const { enabled, isPending, mates, enemies, profiles, profilesLoading } = useQuickAddSuggestions(accountIds, filters);

  if (!enabled) return null;
  if (!isPending && mates.length === 0 && enemies.length === 0) return null;

  return (
    <Stack gap={0.5} className="w-full">
      <Text id={labelId} variant="caption" tone="muted">
        Suggested players
      </Text>
      <Stack gap={0.5} asChild>
        <ul aria-labelledby={labelId} aria-busy={isPending || undefined}>
          {isPending
            ? Array.from({ length: SUGGESTION_TOTAL }, (_, index) => (
                <li key={index} aria-hidden="true">
                  <Skeleton className="h-8 w-full" />
                </li>
              ))
            : [
                ...mates.map((companion) => ({ companion, relation: "together" as const })),
                ...enemies.map((companion) => ({ companion, relation: "against" as const })),
              ].map(({ companion, relation }) => (
                <SuggestionRow
                  key={companion.accountId}
                  companion={companion}
                  relation={relation}
                  profiles={profiles}
                  profilesLoading={profilesLoading}
                  onAdd={onAdd}
                />
              ))}
        </ul>
      </Stack>
    </Stack>
  );
}
