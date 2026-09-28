import { useQuery } from "@tanstack/react-query";
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
const SUGGESTION_TOTAL = 4;
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
 * Up to four suggestions split between teammates and opponents: two each, and a group with fewer leaves its room to
 * the other. A player who was both is offered once, as a teammate.
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
  const first = accountIds[0];
  const enabled = first !== undefined;
  const params = compareCompanionParams(first ?? 0, filters);
  const mateQuery = useQuery({ ...trackerMateStatsQueryOptions(params), enabled });
  const enemyQuery = useQuery({ ...trackerEnemyStatsQueryOptions(params), enabled });

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

function SuggestionGroup({
  label,
  relation,
  companions,
  profiles,
  profilesLoading,
  onAdd,
}: {
  label: string;
  /** How the count reads to a screen reader: "together" or "against". */
  relation: string;
  companions: Companion[];
  profiles: ReturnType<typeof useSteamProfiles>["profiles"];
  profilesLoading: boolean;
  onAdd: (accountId: number) => void;
}) {
  const labelId = useId();
  if (companions.length === 0) return null;
  return (
    <Stack gap={0.5}>
      <Text id={labelId} variant="caption" tone="muted">
        {label}
      </Text>
      <Stack gap={0.5} asChild>
        <ul aria-labelledby={labelId}>
          {companions.map(({ accountId, matches }) => {
            const profile = profiles[accountId];
            const name = profile?.personaname ?? `Player ${accountId}`;
            const games = `${matches} ${matches === 1 ? "game" : "games"}`;
            return (
              <li key={accountId}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start px-1.5"
                  aria-label={`Add ${name}, ${games} ${relation}`}
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
                    {games}
                  </Text>
                </Button>
              </li>
            );
          })}
        </ul>
      </Stack>
    </Stack>
  );
}

/**
 * One-click additions for the comparison: the players the first compared player queues with and meets most, on the
 * page's filters. An optional helper: it shows a thin skeleton while it loads and nothing at all when there is
 * nobody to suggest or the request fails.
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
  const { enabled, isPending, mates, enemies, profiles, profilesLoading } = useQuickAddSuggestions(accountIds, filters);

  if (!enabled) return null;
  if (isPending) return <Skeleton className="h-4 w-32" />;
  if (mates.length === 0 && enemies.length === 0) return null;

  return (
    <Stack gap={2} className="w-full">
      <SuggestionGroup
        label="Frequent teammates"
        relation="together"
        companions={mates}
        profiles={profiles}
        profilesLoading={profilesLoading}
        onAdd={onAdd}
      />
      <SuggestionGroup
        label="Frequent opponents"
        relation="against"
        companions={enemies}
        profiles={profiles}
        profilesLoading={profilesLoading}
        onAdd={onAdd}
      />
    </Stack>
  );
}
