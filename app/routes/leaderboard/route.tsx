import { useQueries } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useRef } from "react";

import { Filter } from "~/components/Filter";
import { LoadingLogo } from "~/components/LoadingLogo";
import { combineQueryStates } from "~/components/QueryRenderer";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import { createPageMeta } from "~/lib/meta";
import { queryKeys } from "~/queries/query-keys";
import { LeaderboardSummary } from "~/routes/leaderboard/LeaderboardSummary";
import { LeaderboardTable, type LeaderboardTableHandle } from "~/routes/leaderboard/LeaderboardTable";

export function meta() {
  return createPageMeta({
    title: "Ranked Leaderboard | Deadlock API",
    description: "Browse the ranked Deadlock leaderboard with region filters, hero filters, and player search.",
    path: "/leaderboard",
  });
}

function getDefaultRegion(): LeaderboardRegionEnum {
  const lang = navigator.language?.toLowerCase() ?? "";
  const langPrefix = lang.split("-")[0];
  const region = lang.split("-")[1];

  // South American country codes
  const saCountries = ["br", "ar", "cl", "co", "pe", "ve", "uy", "py", "bo", "ec", "gf", "sr", "gy"];
  if (region && saCountries.includes(region)) return LeaderboardRegionEnum.SAmerica;

  // Central American / Caribbean country codes → NAmerica
  const naCountries = [
    "us",
    "ca",
    "mx",
    "gt",
    "hn",
    "sv",
    "ni",
    "cr",
    "pa",
    "bz",
    "cu",
    "do",
    "pr",
    "jm",
    "tt",
    "bb",
    "bs",
    "ht",
  ];
  if (region && naCountries.includes(region)) return LeaderboardRegionEnum.NAmerica;

  // Oceania country codes
  const ocCountries = ["au", "nz", "fj", "pg", "sb", "vu", "to", "ws", "ki", "nr", "tv", "ck", "nu", "tk", "pf", "nc"];
  if (region && ocCountries.includes(region)) return LeaderboardRegionEnum.Oceania;

  // Asian country codes
  const asiaCountries = [
    "jp",
    "kr",
    "kp",
    "cn",
    "tw",
    "hk",
    "mo",
    "sg",
    "th",
    "vn",
    "ph",
    "my",
    "id",
    "mm",
    "kh",
    "la",
    "bn",
    "in",
    "bd",
    "pk",
    "lk",
    "np",
    "bt",
    "mn",
    "kz",
    "kg",
    "uz",
    "tj",
    "tm",
    "af",
  ];
  if (region && asiaCountries.includes(region)) return LeaderboardRegionEnum.Asia;

  // Asian languages (when no region code or region not matched above)
  const asiaLangs = [
    "ja",
    "ko",
    "zh",
    "th",
    "vi",
    "id",
    "ms",
    "tl",
    "fil",
    "km",
    "lo",
    "my",
    "hi",
    "bn",
    "ta",
    "te",
    "ml",
    "kn",
    "mr",
    "gu",
    "pa",
    "si",
    "ne",
    "ur",
    "mn",
    "bo",
    "dz",
  ];
  if (asiaLangs.includes(langPrefix)) return LeaderboardRegionEnum.Asia;

  // Portuguese without region → likely Brazil
  if (langPrefix === "pt") return LeaderboardRegionEnum.SAmerica;

  // Fallback to Europe (covers EU, Middle East, Africa, and anything else)
  return LeaderboardRegionEnum.Europe;
}

const REGION_VALUES = Object.values(LeaderboardRegionEnum) as [LeaderboardRegionEnum, ...LeaderboardRegionEnum[]];

export default function Leaderboard() {
  const [region, setRegion] = useQueryState(
    "region",
    parseAsStringLiteral(REGION_VALUES).withDefault(getDefaultRegion()),
  );
  const [heroId, setHeroId] = useQueryState("hero_id", parseAsInteger);

  const [ranks, leaderboardQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.leaderboard.ranks(),
        queryFn: async () => {
          const response = await assetsApi.default_api.getRanksV2RanksGet();
          return response.data;
        },
        staleTime: CACHE_DURATIONS.FOREVER,
      },
      {
        queryKey: queryKeys.leaderboard.data(region, heroId),
        queryFn: async () => {
          const response = heroId
            ? await api.leaderboard_api.leaderboardHero({ region, heroId })
            : await api.leaderboard_api.leaderboard({ region });
          return response.data;
        },
        staleTime: CACHE_DURATIONS.ONE_HOUR,
      },
    ],
  });

  const { isPending, isError, error } = combineQueryStates(ranks, leaderboardQuery);

  const tableRef = useRef<LeaderboardTableHandle>(null);

  const handleHeroClick = useCallback(
    (id: number) => {
      setHeroId(id);
    },
    [setHeroId],
  );

  const handleBadgeClick = useCallback((rank: number) => {
    tableRef.current?.jumpToRank(rank);
  }, []);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ranked player standings across all regions</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Browse the top-ranked Deadlock players by region. Filter by hero to see who dominates with specific
            characters, search for any player, and jump to any rank to see where you stand on the competitive ladder.
          </p>
        </div>
        <Filter.Root>
          <Filter.Hero value={heroId} onChange={setHeroId} allowNull />
          <Filter.Region value={region} onChange={(r) => setRegion(r as LeaderboardRegionEnum)} />
        </Filter.Root>
        <div className="min-h-200">
          {isPending ? (
            <div className="flex items-center justify-center py-24">
              <LoadingLogo />
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Failed to load leaderboard: {error?.message}
            </div>
          ) : leaderboardQuery.data ? (
            <>
              <LeaderboardSummary
                ranks={ranks.data ?? []}
                leaderboard={leaderboardQuery.data}
                onBadgeClick={handleBadgeClick}
              />
              <LeaderboardTable
                ref={tableRef}
                ranks={ranks.data ?? []}
                leaderboard={leaderboardQuery.data}
                onHeroClick={handleHeroClick}
              />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
