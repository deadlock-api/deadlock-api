import { useQueries, useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { useMemo, useState } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

const EXPERIENCE_BUCKETS = [
  { label: "Beginner", sublabel: "1-25 matches", min: 1, max: 25 },
  { label: "Intermediate", sublabel: "25-100 matches", min: 25, max: 100 },
  { label: "Experienced", sublabel: "100-500 matches", min: 100, max: 500 },
  { label: "Veteran", sublabel: "500+ matches", min: 500, max: 10000 },
] as const;

const MIN_MATCHES_PER_BUCKET = 10;

type SortKey = "name" | "delta" | `bucket-${number}`;

interface HeroStatsByExperienceTableProps {
  heroStat: (typeof HERO_STATS)[number];
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
}

export default function HeroStatsByExperienceTable({
  heroStat,
  minRankId,
  maxRankId,
  minHeroMatches,
  minDate,
  maxDate,
  gameMode,
}: HeroStatsByExperienceTableProps) {
  const minDateTimestamp = useMemo(() => minDate?.unix() ?? 0, [minDate]);
  const maxDateTimestamp = useMemo(() => maxDate?.unix(), [maxDate]);

  const bucketQueries = useQueries({
    queries: EXPERIENCE_BUCKETS.map((bucket) => ({
      queryKey: [
        "api-hero-stats-by-experience",
        bucket.min,
        bucket.max,
        minRankId,
        maxRankId,
        minDateTimestamp,
        maxDateTimestamp,
        minHeroMatches,
        gameMode,
      ],
      queryFn: async () => {
        const response = await api.analytics_api.heroStats({
          minHeroMatches,
          minHeroMatchesTotal: bucket.min,
          maxHeroMatchesTotal: bucket.max,
          minAverageBadge: minRankId ?? 0,
          maxAverageBadge: maxRankId ?? 116,
          minUnixTimestamp: minDateTimestamp,
          maxUnixTimestamp: maxDateTimestamp,
          bucket: "no_bucket",
          gameMode,
        });
        return response.data;
      },
      staleTime: 24 * 60 * 60 * 1000,
    })),
  });

  const { data: assetsHeroes, isLoading: isLoadingAssetsHeroes } = useQuery(heroesQueryOptions);

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string }> = {};
    for (const hero of assetsHeroes || []) {
      map[hero.id] = { name: hero.name };
    }
    return map;
  }, [assetsHeroes]);

  const anyLoaded = bucketQueries.some((q) => q.data != null);
  const allLoading = !anyLoaded || isLoadingAssetsHeroes;
  const bucketLoading = bucketQueries.map((q) => q.data == null);

  const isPercentStat = heroStat === "winrate";

  const heroRows = useMemo(() => {
    if (!anyLoaded) return [];

    const heroIds = new Set<number>();
    for (const q of bucketQueries) {
      for (const entry of q.data || []) {
        heroIds.add(entry.hero_id);
      }
    }

    const rows: {
      heroId: number;
      bucketValues: (number | null)[];
      bucketEntries: (AnalyticsHeroStats | null)[];
      delta: number | null;
    }[] = [];

    for (const heroId of heroIds) {
      const bucketEntries = EXPERIENCE_BUCKETS.map((_, i) => {
        const entry = bucketQueries[i].data?.find((e) => e.hero_id === heroId);
        if (!entry || entry.matches < MIN_MATCHES_PER_BUCKET) return null;
        return entry;
      });

      const bucketValues = bucketEntries.map((entry) => {
        if (!entry) return null;
        const raw = hero_stats_transform(entry, heroStat);
        return raw > 100 ? Math.round(raw) : Math.round(raw * 100) / 100;
      });

      const loadedValues = bucketValues.filter((v, i) => !bucketLoading[i] && v !== null) as number[];
      const firstVal = loadedValues[0] ?? null;
      const lastVal = loadedValues[loadedValues.length - 1] ?? null;
      const allBucketsLoaded = bucketLoading.every((l) => !l);
      const delta = allBucketsLoaded && firstVal !== null && lastVal !== null ? lastVal - firstVal : null;

      rows.push({ heroId, bucketValues, bucketEntries, delta });
    }

    return rows;
  }, [anyLoaded, bucketQueries, heroStat, bucketLoading]);

  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedRows = useMemo(() => {
    return [...heroRows].sort((a, b) => {
      if (sortKey === "name") {
        const aName = heroIdMap[a.heroId]?.name ?? "";
        const bName = heroIdMap[b.heroId]?.name ?? "";
        const cmp = aName.localeCompare(bName);
        return sortAsc ? cmp : -cmp;
      }

      let aVal: number | null;
      let bVal: number | null;
      if (sortKey === "delta") {
        aVal = a.delta;
        bVal = b.delta;
      } else {
        const idx = Number(sortKey.replace("bucket-", ""));
        aVal = a.bucketValues[idx];
        bVal = b.bucketValues[idx];
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [heroRows, sortKey, sortAsc, heroIdMap]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const formatValue = (val: number | null) => {
    if (val === null) return <span className="text-muted-foreground/50">-</span>;
    if (isPercentStat) return `${val.toFixed(1)}%`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  const formatDelta = (delta: number | null) => {
    if (delta === null) return <span className="text-muted-foreground/50">-</span>;
    const sign = delta > 0 ? "+" : "";
    const color = delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground";
    if (isPercentStat) {
      return (
        <span className={`font-medium ${color}`}>
          {sign}
          {delta.toFixed(1)}%
        </span>
      );
    }
    return (
      <span className={`font-medium ${color}`}>
        {sign}
        {delta.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </span>
    );
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortAsc ? " \u25B2" : " \u25BC";
  };

  const allBucketsLoaded = bucketLoading.every((l) => !l);

  if (allLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead className="text-center">#</TableHead>
          <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
            Hero{sortIndicator("name")}
          </TableHead>
          {EXPERIENCE_BUCKETS.map((bucket, i) => (
            <TableHead
              key={bucket.label}
              className="text-center cursor-pointer select-none"
              onClick={() => handleSort(`bucket-${i}`)}
            >
              {bucket.label}
              <br />
              <span className="text-xs font-normal text-muted-foreground">{bucket.sublabel}</span>
              {sortIndicator(`bucket-${i}`)}
            </TableHead>
          ))}
          <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort("delta")}>
            Change{sortIndicator("delta")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedRows.map((row, index) => (
          <TableRow key={row.heroId}>
            <TableCell className="font-semibold text-center">{index + 1}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <HeroImage heroId={row.heroId} />
                <HeroName heroId={row.heroId} />
              </div>
            </TableCell>
            {row.bucketValues.map((val, i) => (
              <TableCell key={EXPERIENCE_BUCKETS[i].label} className="text-center tabular-nums">
                {bucketLoading[i] ? (
                  <Skeleton className="h-4 w-12 mx-auto" />
                ) : (
                  <BucketTooltip
                    entry={row.bucketEntries[i]}
                    heroStat={heroStat}
                    bucketLabel={EXPERIENCE_BUCKETS[i].label}
                  >
                    {formatValue(val)}
                  </BucketTooltip>
                )}
              </TableCell>
            ))}
            <TableCell className="text-center tabular-nums">
              {!allBucketsLoaded ? (
                <Skeleton className="h-4 w-12 mx-auto" />
              ) : (
                <DeltaTooltip
                  firstEntry={row.bucketEntries.find((e) => e !== null) ?? null}
                  lastEntry={[...row.bucketEntries].reverse().find((e) => e !== null) ?? null}
                  heroStat={heroStat}
                >
                  {formatDelta(row.delta)}
                </DeltaTooltip>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BucketTooltip({
  entry,
  heroStat,
  bucketLabel,
  children,
}: {
  entry: AnalyticsHeroStats | null;
  heroStat: (typeof HERO_STATS)[number];
  bucketLabel: string;
  children: React.ReactNode;
}) {
  if (!entry) return <>{children}</>;

  const winrate = ((entry.wins / entry.matches) * 100).toFixed(2);
  const kills = (entry.total_kills / entry.matches).toFixed(1);
  const deaths = (entry.total_deaths / entry.matches).toFixed(1);
  const assists = (entry.total_assists / entry.matches).toFixed(1);
  const netWorth = Math.round(entry.total_net_worth / entry.matches).toLocaleString();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="bg-popover text-popover-foreground border border-border shadow-md p-3">
        <div className="flex flex-col gap-1 text-xs">
          <div className="font-medium text-foreground mb-1">{bucketLabel}</div>
          <TooltipRow label="Matches" value={entry.matches.toLocaleString()} />
          <TooltipRow label="Win rate" value={`${winrate}%`} highlight={heroStat === "winrate"} />
          <TooltipRow label="Players" value={entry.players.toLocaleString()} />
          <div className="border-t border-border my-1" />
          <TooltipRow label="Kills/match" value={kills} highlight={heroStat === "kills_per_match"} />
          <TooltipRow label="Deaths/match" value={deaths} highlight={heroStat === "deaths_per_match"} />
          <TooltipRow label="Assists/match" value={assists} highlight={heroStat === "assists_per_match"} />
          <TooltipRow label="Net worth/match" value={netWorth} highlight={heroStat === "net_worth_per_match"} />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function DeltaTooltip({
  firstEntry,
  lastEntry,
  heroStat,
  children,
}: {
  firstEntry: AnalyticsHeroStats | null;
  lastEntry: AnalyticsHeroStats | null;
  heroStat: (typeof HERO_STATS)[number];
  children: React.ReactNode;
}) {
  if (!firstEntry || !lastEntry || firstEntry === lastEntry) return <>{children}</>;

  const firstVal = hero_stats_transform(firstEntry, heroStat);
  const lastVal = hero_stats_transform(lastEntry, heroStat);
  const isPercent = heroStat === "winrate";

  const fmt = (v: number) => {
    if (isPercent) return `${v.toFixed(2)}%`;
    return v > 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="bg-popover text-popover-foreground border border-border shadow-md p-3">
        <div className="flex flex-col gap-1 text-xs">
          <TooltipRow label="Beginner" value={fmt(firstVal)} />
          <TooltipRow label="Veteran" value={fmt(lastVal)} />
          <div className="border-t border-border my-1" />
          <TooltipRow label="Difference" value={fmt(lastVal - firstVal)} />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function TooltipRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-bold text-foreground" : "font-medium"}>{value}</span>
    </div>
  );
}
