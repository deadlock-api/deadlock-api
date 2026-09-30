import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { type ComponentProps, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { PatchMarkers } from "~/components/domain/charts/PatchMarkers";
import MatchHistoryCard from "~/components/domain/match/MatchHistoryCard";
import { ScoreboardTable } from "~/components/domain/player-scoreboard/ScoreboardTable";
import { SortBySelector } from "~/components/domain/player-scoreboard/SortBySelector";
import { ChartSurface } from "~/components/patterns/charts/ChartSurface";
import {
  CHART_GRID,
  CHART_MARGIN_MARKED,
  CHART_X_AXIS,
  CHART_Y_AXIS,
  SERIES_COLORS,
} from "~/components/patterns/charts/theme";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { PATCHES } from "~/lib/constants";
import { normalizeUnixFloor } from "~/lib/time-normalize";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

const BUILD_MATCH: ComponentProps<typeof MatchHistoryCard> = {
  timeAgo: "2 hours ago",
  matchId: 38214577,
  result: "win",
  durationSeconds: 34 * 60 + 12,
  heroId: 2,
  kills: 14,
  deaths: 3,
  assists: 11,
  averageBadge: 94,
  accountId: 74963221,
  buildData: {
    items: [
      { itemId: 1548066885, gameTimeS: 45, sold: false },
      { itemId: 968099481, gameTimeS: 130, sold: true, soldTimeS: 1500 },
      { itemId: 1437614329, gameTimeS: 320, sold: false },
      { itemId: 7409189, gameTimeS: 640, sold: false, imbuedAbilityNumber: 2 },
      { itemId: 499683006, gameTimeS: 900, sold: false },
      { itemId: 811521119, gameTimeS: 1260, sold: false },
      { itemId: 1414025773, gameTimeS: 1500, sold: false },
      { itemId: 3577481646, gameTimeS: 1900, sold: false, imbuedAbilityNumber: 4 },
    ],
    abilityBuildOrder: [1, 3, 2, 4],
    abilityUpgradeSequence: [1, 3, 2, 4, 1, 1, 3, 4, 3, 2, 4, 2],
  },
};

const PATCH_TREND_START = Date.UTC(2026, 4, 1);
const PATCH_TREND = Array.from({ length: 150 }, (_, i) => ({
  date: PATCH_TREND_START + i * 86_400_000,
  value: 0.5 + Math.sin(i / 9) * 0.02,
}));

export function DomainData() {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const [clickedPlayer, setClickedPlayer] = useState<string>();

  const [sortBy, setSortBy] = useState("kills");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [pickedPlayers, setPickedPlayers] = useState<number[]>([]);
  const scoreboardQuery = useQuery(
    playerScoreboardQueryOptions({
      sortBy: sortBy as PlayerScoreboardSortByEnum,
      sortDirection,
      minUnixTimestamp: normalizeUnixFloor(PATCHES[1].startDate) ?? 0,
      start: 0,
      limit: 8,
    }),
  );

  const [selectorSort, setSelectorSort] = useState("winrate");

  return (
    <>
      <Specimen
        name="PatchMarkers"
        source="domain/charts/PatchMarkers"
        note="Every patch on a time axis in ms, as ChartMarkers: labelled with the name the date picker lists. Render it inside the chart with CHART_MARGIN_MARKED; size=sm (PATCH_MARKERS_SHORT) uses each patch's shortName, Patch for minor updates. StatTrendChart and WeeklyTrendChart take the markers through markers."
      >
        <ChartSurface label="Example trend across the recent patches" size="md">
          <LineChart data={PATCH_TREND} margin={CHART_MARGIN_MARKED}>
            <CartesianGrid {...CHART_GRID} />
            <XAxis
              dataKey="date"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(date: number) => new Date(date).toISOString().slice(5, 10)}
              minTickGap={32}
              {...CHART_X_AXIS}
            />
            <YAxis domain={[0.46, 0.54]} {...CHART_Y_AXIS} />
            <PatchMarkers />
            <Line dataKey="value" stroke={SERIES_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartSurface>
      </Specimen>

      <Specimen
        name="MatchHistoryCard"
        source="domain/match/MatchHistoryCard"
        note="One match of one player; the left edge carries the result. It lists the purchases by phase (sold items dimmed, imbued abilities numbered) and the ability order."
      >
        <Variants label={`onPlayerClick${clickedPlayer ? `: ${clickedPlayer}` : ""}`}>
          <MatchHistoryCard {...BUILD_MATCH} ranks={ranks} onPlayerClick={setClickedPlayer} />
        </Variants>
      </Specimen>

      <Specimen
        name="ScoreboardTable"
        source="domain/player-scoreboard/ScoreboardTable"
        note="A player leaderboard for one stat: search, pagination and Steam names. The parent picks the stat (SortBySelector in its toolbar); the stat's column header flips the direction. Sorting is the server's, so the parent refetches on onSortChange. Search, page and page size live in the URL (q, page, per_page). With selectedAccountIds each row ends in a + toggle that adds its player to a pick (onValueChange gets the new list), up to maxSelected; here three. pickHeader fills that column's header, usually the action that uses the picks. Live data: the top 8 since the previous patch."
      >
        <QueryRenderer query={scoreboardQuery}>
          {(entries) => (
            <ScoreboardTable
              entries={entries}
              selectedAccountIds={pickedPlayers}
              onValueChange={setPickedPlayers}
              maxSelected={3}
              pickHeader={`${pickedPlayers.length} of 3`}
              sortBy={sortBy}
              sortDirection={sortDirection}
              onSortChange={(next) => {
                setSortBy(next.sortBy);
                setSortDirection(next.sortDirection);
              }}
            />
          )}
        </QueryRenderer>
      </Specimen>

      <Specimen
        name="SortBySelector"
        source="domain/player-scoreboard/SortBySelector"
        note="Picks the stat a scoreboard ranks by. Stats that have them also offer AVG / MAX / TOTAL; the value is the API's sort_by string."
      >
        <Variants>
          <SortBySelector value={selectorSort} defaultValue="winrate" onValueChange={setSelectorSort} />
          <code className="font-mono text-xs text-muted-foreground">{selectorSort}</code>
        </Variants>
      </Specimen>
    </>
  );
}
