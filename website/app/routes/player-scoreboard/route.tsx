import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import type { MetaFunction } from "react-router";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankSelector from "~/components/selectors/RankSelector";
import NumberSelector from "~/components/NumberSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import { Card, CardContent } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api } from "~/lib/api";
import { PATCHES } from "~/lib/constants";
import { parseAsDayjsRange } from "~/lib/nuqs-parsers";
import { ScoreboardTable } from "./ScoreboardTable";
import { SortBySelector } from "./SortBySelector";
import { ALL_SORT_BY_VALUES } from "./sort-options";

export const meta: MetaFunction = () => {
  return [
    { title: "Player Scoreboard - Deadlock API" },
    { name: "description", content: "Top player performances ranked by various stats in Deadlock" },
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
    parseAsStringLiteral(ALL_SORT_BY_VALUES as [string, ...string[]]).withDefault("avg_kills_per_match"),
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
  const [minMatches, setMinMatches] = useQueryState("min_matches", parseAsInteger.withDefault(20));
  const [minRankId, setMinRankId] = useQueryState("min_rank", parseAsInteger.withDefault(91));
  const [maxRankId, setMaxRankId] = useQueryState("max_rank", parseAsInteger.withDefault(116));
  const [[startDate, endDate], setDateRange] = useQueryState(
    "date_range",
    parseAsDayjsRange.withDefault([PATCHES[0].startDate, PATCHES[0].endDate]),
  );

  const MAX_ENTRIES = 2000;

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
        <h2 className="text-3xl font-bold text-center mb-2">Player Scoreboard</h2>

        <Card className="mb-8 w-fit mx-auto">
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
                <NumberSelector value={minMatches} onChange={setMinMatches} label="Min Matches" step={5} min={1} />
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

        <div className="max-w-250 mx-auto">
          {scoreboardQuery.isPending ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Spinner className="size-6" />
              <span className="text-sm text-muted-foreground">Loading scoreboard...</span>
            </div>
          ) : scoreboardQuery.isError ? (
            <div className="text-center text-sm text-red-600 py-8">
              Failed to load scoreboard: {scoreboardQuery.error?.message}
            </div>
          ) : (
            <ScoreboardTable
              entries={scoreboardQuery.data ?? []}
              sortBy={sortBy}
            />
          )}
        </div>
      </section>
    </div>
  );
}
