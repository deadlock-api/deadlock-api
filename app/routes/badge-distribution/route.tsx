import { useQueries } from "@tanstack/react-query";
import type { AnalyticsApiBadgeDistributionRequest } from "deadlock_api_client/api";
import { useState } from "react";
import { Card, CardContent } from "~/components/ui/card";
import { LoadingLogo } from "~/components/LoadingLogo";
import { day } from "~/dayjs";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
import BadgeDistributionChart from "./BadgeDistributionChart";
import BadgeDistributionFilter from "./BadgeDistributionFilter";

export function meta() {
  return [
    { title: "Rank Distribution | Deadlock API" },
    { name: "description", content: "Deadlock match rank distribution" },
  ];
}

export default function BadgeDistribution() {
  const [filter, setFilter] = useState<AnalyticsApiBadgeDistributionRequest>({
    minUnixTimestamp: day().subtract(30, "day").startOf("day").unix(),
    maxUnixTimestamp: day().endOf("day").unix(),
  });

  const [ranks, badgeDistributionQuery] = useQueries({
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
        queryKey: ["badgeDistribution", filter],
        queryFn: async () => {
          const response = await api.analytics_api.badgeDistribution(filter);
          return response.data;
        },
        staleTime: 24 * 60 * 60 * 1000,
      },
    ],
  });

  const isPending = badgeDistributionQuery?.isPending || ranks?.isPending;
  const isError = badgeDistributionQuery?.isError || ranks?.isError;
  const error = badgeDistributionQuery?.error || ranks?.error;

  return (
    <div className="space-y-8">
      <section className="space-y-4 max-h-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Match Rank Distribution</h1>
          <p className="text-sm text-muted-foreground mt-1">Player rank distribution across all badges</p>
        </div>
        <Card>
          <CardContent className="p-4">
            <BadgeDistributionFilter value={filter} onChange={setFilter} />
          </CardContent>
        </Card>
        <div className="h-200 flex justify-center items-center">
          {isPending ? (
            <div className="flex items-center justify-center py-8">
              <LoadingLogo className="w-12 h-12" />
            </div>
          ) : isError ? (
            <div className="text-center text-sm text-destructive py-8">
              Failed to load rank distribution: {error?.message}
            </div>
          ) : badgeDistributionQuery.data ? (
            <BadgeDistributionChart badgeDistributionData={badgeDistributionQuery.data} ranksData={ranks.data ?? []} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
