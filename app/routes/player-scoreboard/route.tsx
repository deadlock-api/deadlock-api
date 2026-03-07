import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import type { MetaFunction } from "react-router";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import NumberSelector from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import { GameModeSelector, parseAsGameMode } from "~/components/selectors/GameModeSelector";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankRangeSelector from "~/components/selectors/RankRangeSelector";
import { Button } from "~/components/ui/button";
import { FilterCardCustom } from "~/components/FilterCard";
import { LoadingLogo } from "~/components/LoadingLogo";
import { api } from "~/lib/api";
import { PATCHES } from "~/lib/constants";
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

        <FilterCardCustom>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap justify-center gap-2">
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
                <GameModeSelector value={gameMode} onChange={setGameMode} />
                <HeroSelector
                  onHeroSelected={setHeroId}
                  selectedHero={heroId ?? undefined}
                  allowSelectNull
                  label="Hero"
                />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <NumberSelector value={minMatches} onChange={setMinMatches} label="Min Matches" step={10} min={1} />
                {gameMode !== "street_brawl" && (
                  <>
                    <RankRangeSelector
                      minRank={minRankId}
                      maxRank={maxRankId}
                      onRankChange={(min, max) => {
                        setMinRankId(min);
                        setMaxRankId(max);
                      }}
                    />
                  </>
                )}
                <PatchOrDatePicker
                  patchDates={PATCHES}
                  value={{ startDate, endDate }}
                  onValueChange={({ startDate, endDate }) => setDateRange([startDate, endDate])}
                />
              </div>
            </div>
        </FilterCardCustom>

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
