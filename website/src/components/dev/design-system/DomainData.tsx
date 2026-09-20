import { useQuery } from "@tanstack/react-query";
import type { PlayerScoreboardSortByEnum } from "deadlock_api_client";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import MatchHistoryCard, { type MatchHistoryCardProps } from "~/components/domain/match/MatchHistoryCard";
import { ScoreboardTable } from "~/components/domain/player-scoreboard/ScoreboardTable";
import { SortBySelector } from "~/components/domain/player-scoreboard/SortBySelector";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { PATCHES } from "~/lib/constants";
import { normalizeUnixFloor } from "~/lib/time-normalize";
import { playerScoreboardQueryOptions } from "~/queries/player-scoreboard-query";
import { ranksQueryOptions } from "~/queries/ranks-query";

const BUILD_MATCH: MatchHistoryCardProps = {
  gameMode: "Ranked",
  timeAgo: "2 hours ago",
  matchId: 38214577,
  result: "win",
  durationSeconds: 34 * 60 + 12,
  heroId: 2,
  kills: 14,
  deaths: 3,
  assists: 11,
  itemIds: [],
  averageBadge: 94,
  steamProfile: { personaname: "Showcase Player" },
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

const SUMMARY_MATCH: MatchHistoryCardProps = {
  gameMode: "Ranked",
  timeAgo: "Yesterday",
  matchId: 38177402,
  result: "loss",
  durationSeconds: 41 * 60 + 5,
  heroId: 1,
  kills: 6,
  deaths: 9,
  assists: 13,
  killParticipation: 58,
  headshotPercent: 17,
  itemIds: [
    1548066885, 1009965641, 2064029594, 811521119, 710436191, 1437614329, 499683006, 1414025773, 968099481, 7409189,
    619484391, 3577481646,
  ],
  averageBadge: 64,
  placement: "4th",
  placementLabel: "Souls",
  teams: [
    [1, 2, 3, 4, 6, 7].map((heroId, i) => ({ heroId, name: `Amber ${i + 1}` })),
    [8, 10, 11, 12, 13, 14].map((heroId, i) => ({ heroId, name: `Sapphire ${i + 1}` })),
  ],
};

export function DomainData() {
  const { data: ranks } = useQuery(ranksQueryOptions);
  const [expanded, setExpanded] = useState(false);
  const [clickedPlayer, setClickedPlayer] = useState<string>();

  const [sortBy, setSortBy] = useState("kills");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
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
        name="MatchHistoryCard"
        source="domain/match/MatchHistoryCard"
        note="One match of one player; the left edge carries the result. With buildData it lists the purchases by phase (sold items dimmed, imbued abilities numbered) and the ability order; without it, the final inventory, placement and both teams. Pass steamProfile to skip the card's own Steam lookup."
      >
        <Variants
          label={`With buildData, expandable={false}, onPlayerClick${clickedPlayer ? `: ${clickedPlayer}` : ""}`}
        >
          <MatchHistoryCard {...BUILD_MATCH} ranks={ranks} expandable={false} onPlayerClick={setClickedPlayer} />
        </Variants>
        <Variants label="Loss, without buildData, expandable" className="overflow-x-auto">
          <MatchHistoryCard
            {...SUMMARY_MATCH}
            ranks={ranks}
            expanded={expanded}
            onToggleExpand={() => setExpanded((open) => !open)}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="ScoreboardTable"
        source="domain/player-scoreboard/ScoreboardTable"
        note="A player leaderboard for one stat: search, pagination, Steam names, and the stat picked in the header through SortBySelector. Sorting is the server's, so the parent refetches on onSortChange. Search, page and page size live in the URL (q, page, per_page). Live data: the top 8 since the previous patch."
      >
        <QueryRenderer query={scoreboardQuery}>
          {(entries) => (
            <ScoreboardTable
              entries={entries}
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
