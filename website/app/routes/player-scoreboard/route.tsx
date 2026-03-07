import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import type { MetaFunction } from "react-router";
import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { parseAsGameMode } from "~/components/selectors/GameModeSelector";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { ScoreboardTable } from "./ScoreboardTable";
import { SortBySelector } from "./SortBySelector";
import { ALL_SORT_BY_VALUES } from "./sort-options";

export const meta: MetaFunction = () => {
  return [
    { title: "Player Scoreboard - Deadlock API" },
    {
      name: "description",
      content: "Top player performances ranked by various stats in Deadlock",
    },
  ];
};

export default function PlayerScoreboard() {
  const [sortBy, setSortBy] = useQueryState(
    "sort_by",
    parseAsStringLiteral(ALL_SORT_BY_VALUES as [string, ...string[]]).withDefault("matches"),
  );
  const [sortDirection, setSortDirection] = useQueryState(
    "sort_dir",
    parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
  );
  const [gameMode, setGameMode] = useQueryState("game_mode", parseAsGameMode);
  const [heroId, setHeroId] = useQueryState("hero", parseAsInteger);
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(0));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(0));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [dateRange, setDateRange] = useQueryState("date_range", parseAsDayjsRange);
  const startDate = dateRange?.[0];
  const endDate = dateRange?.[1];

  const MAX_ENTRIES = 1000;

  const scoreboardQuery = useQuery({
    queryKey: [
      "playerScoreboard",
      sortBy,
      sortDirection,
      gameMode,
      heroId,
      minMatches,
      minRankId,
      maxRankId,
      startDate?.unix(),
      endDate?.unix(),
    ],
    queryFn: async () => {
      const response = await api.analytics_api.playerScoreboard({
        sortBy: sortBy as PlayerScoreboardSortByEnum,
        sortDirection: sortDirection as "desc" | "asc",
        gameMode,
        heroId: heroId ?? undefined,
        minMatches,
        minAverageBadge: gameMode === "street_brawl" ? undefined : minRankId,
        maxAverageBadge: gameMode === "street_brawl" ? undefined : maxRankId,
        minUnixTimestamp: startDate?.unix() ?? 0,
        maxUnixTimestamp: endDate?.unix(),
        start: 0,
        limit: MAX_ENTRIES,
      });
      return response.data;
    },
    staleTime: 60 * 60 * 1000,
  });

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Player Scoreboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Top player performances ranked by various stats</p>
        </div>

        <Filter.Root>
          <SortBySelector value={sortBy} onChange={setSortBy} />
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-center md:justify-start items-center h-8">
              <span className="text-sm font-semibold text-foreground">Direction</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}
            >
              {sortDirection === "desc" ? (
                <ArrowDownNarrowWide className="size-4" />
              ) : (
                <ArrowUpNarrowWide className="size-4" />
              )}
              {sortDirection === "desc" ? "DESC" : "ASC"}
            </Button>
          </div>
          <Filter.GameMode value={gameMode} onChange={setGameMode} />
          <Filter.Hero value={heroId} onChange={setHeroId} allowNull label="Hero" />
          <Filter.MinMatches value={minMatches} onChange={setMinMatches} min={1} />
          {gameMode !== "street_brawl" && (
            <Filter.RankRange
              minRank={minRankId}
              maxRank={maxRankId}
              onRankChange={(min, max) => {
                setMinRankId(min);
                setMaxRankId(max);
              }}
            />
          )}
          <Filter.PatchOrDate startDate={startDate} endDate={endDate} onDateChange={(s, e) => setDateRange([s, e])} />
        </Filter.Root>

        <div>
          {scoreboardQuery.isPending ? (
            <div className="flex items-center justify-center py-24">
              <LoadingLogo />
            </div>
          ) : scoreboardQuery.isError ? (
            <div className="text-center text-sm text-destructive py-8">
              Failed to load scoreboard: {scoreboardQuery.error?.message}
            </div>
          ) : (
            <ScoreboardTable entries={scoreboardQuery.data ?? []} sortBy={sortBy} />
          )}
        </div>
      </section>
    </div>
  );
}
