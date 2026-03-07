import { useQueries } from "@tanstack/react-query";
import { LeaderboardRegionEnum } from "deadlock_api_client";
import { useCallback, useRef, useState } from "react";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Card, CardContent } from "~/components/ui/card";
import { LeaderboardFilter, type LeaderboardFilterType } from "~/routes/leaderboard/LeaderboardFilter";
import { LeaderboardSummary } from "~/routes/leaderboard/LeaderboardSummary";
import { LeaderboardTable, type LeaderboardTableHandle } from "~/routes/leaderboard/LeaderboardTable";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";

export function meta() {
  return [{ title: "Leaderboard | Deadlock API" }, { name: "description", content: "Deadlock ranked leaderboard" }];
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

export default function Leaderboard() {
  const [filter, setFilter] = useState<LeaderboardFilterType>(() => ({
    region: getDefaultRegion(),
  }));

  const [ranks, leaderboardQuery] = useQueries({
    queries: [
      {
        queryKey: ["ranks"],
        queryFn: async () => {
          const response = await assetsApi.default_api.getRanksV2RanksGet();
          return response.data;
        },
        staleTime: Number.MAX_SAFE_INTEGER,
      },
      {
        queryKey: ["leaderboardData", filter],
        queryFn: async () => {
          const response =
            "heroId" in filter && filter.heroId
              ? await api.leaderboard_api.leaderboardHero(filter)
              : await api.leaderboard_api.leaderboard(filter);
          return response.data;
        },
        staleTime: 60 * 60 * 1000,
      },
    ],
  });

  const isPending = ranks?.isPending || leaderboardQuery?.isPending;
  const isError = ranks?.isError || leaderboardQuery?.isError;
  const error = ranks?.error || leaderboardQuery?.error;

  const tableRef = useRef<LeaderboardTableHandle>(null);

  const handleHeroClick = useCallback((heroId: number) => {
    setFilter((prevFilter) => ({
      ...prevFilter,
      heroId: heroId,
    }));
  }, []);

  const handleBadgeClick = useCallback((rank: number) => {
    tableRef.current?.jumpToRank(rank);
  }, []);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Ranked player standings across all regions</p>
        </div>
        <Card className="w-fit mx-auto">
          <CardContent>
            <LeaderboardFilter value={filter} onChange={setFilter} />
          </CardContent>
        </Card>
        <div className="min-h-200">
          {isPending ? (
            <div className="flex items-center justify-center py-24">
              <LoadingLogo />
            </div>
          ) : isError ? (
            <div className="text-center text-sm text-destructive py-8">
              Failed to load leaderboard: {error?.message}
            </div>
          ) : leaderboardQuery.data ? (
            <>
              <LeaderboardSummary
                ranks={ranks.data}
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
