import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import type { MetaFunction } from "react-router";
import NumberSelector from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { api } from "~/lib/api";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { ScoreboardTable } from "./ScoreboardTable";
import { SortBySelector } from "./SortBySelector";
import { ALL_SORT_BY_VALUES, getSortByLabel } from "./sort-options";

export const meta: MetaFunction = () => {
  return [
    { title: "Player Scoreboard - Deadlock API" },
    {
      name: "description",
      content: "Top player performances ranked by various stats in Deadlock",
    },
  ];
};

const SORT_DIRECTION_OPTIONS = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" },
];

const GAME_MODE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "street_brawl", label: "Street Brawl" },
];

export default function PlayerScoreboard() {
  const [sortBy, setSortBy] = useQueryState(
    "sort_by",
    parseAsStringLiteral(ALL_SORT_BY_VALUES as [string, ...string[]]).withDefault("matches"),
  );
  const [sortDirection, setSortDirection] = useQueryState(
    "sort_dir",
    parseAsStringLiteral(["desc", "asc"] as const).withDefault("desc"),
  );
  const [gameMode, setGameMode] = useQueryState(
    "game_mode",
    parseAsStringLiteral(["normal", "street_brawl"] as const).withDefault("normal"),
  );
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
        gameMode: gameMode as "normal" | "street_brawl",
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

        <Card className="w-fit mx-auto">
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap justify-center gap-2">
                <SortBySelector value={sortBy} onChange={setSortBy} />
                <StringSelector
                  options={SORT_DIRECTION_OPTIONS}
                  onSelect={(v) => setSortDirection(v as "desc" | "asc")}
                  selected={sortDirection}
                  label="Direction"
                />
                <StringSelector
                  options={GAME_MODE_OPTIONS}
                  onSelect={(v) => setGameMode(v as "normal" | "street_brawl")}
                  selected={gameMode}
                  label="Game Mode"
                />
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
                    <RankSelector onRankSelected={setMinRankId} selectedRank={minRankId} label="Min Rank" />
                    <RankSelector onRankSelected={setMaxRankId} selectedRank={maxRankId} label="Max Rank" />
                  </>
                )}
                <PatchOrDatePicker
                  patchDates={PATCHES}
                  value={{ startDate, endDate }}
                  onValueChange={({ startDate, endDate }) => setDateRange([startDate, endDate])}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          {scoreboardQuery.isPending ? (
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-[5ch] text-right">#</TableHead>
                  <TableHead>Player</TableHead>
                  {sortBy !== "matches" && <TableHead className="text-right">Matches</TableHead>}
                  <TableHead className="text-right">{getSortByLabel(sortBy)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 25 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-6 ml-auto" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </TableCell>
                    {sortBy !== "matches" && (
                      <TableCell className="text-right">
                        <Skeleton className="h-4 w-12 ml-auto" />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Skeleton className="h-4 w-14 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
