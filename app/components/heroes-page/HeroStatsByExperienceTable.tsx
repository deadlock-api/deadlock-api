import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import HeroImage from "~/components/HeroImage";
import HeroName from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import type { Dayjs } from "~/dayjs";
import { api } from "~/lib/api";
import { assetsApi } from "~/lib/assets-api";
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

  const { data: assetsHeroes, isLoading: isLoadingAssetsHeroes } = useQuery({
    queryKey: ["assets-heroes"],
    queryFn: async () => {
      const response = await assetsApi.heroes_api.getHeroesV2HeroesGet({ onlyActive: true });
      return response.data;
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const heroIdMap = useMemo(() => {
    const map: Record<number, { name: string }> = {};
    for (const hero of assetsHeroes || []) {
      map[hero.id] = { name: hero.name };
    }
    return map;
  }, [assetsHeroes]);

  const isLoading = bucketQueries.some((q) => q.isLoading) || isLoadingAssetsHeroes;
  const allLoaded = bucketQueries.every((q) => q.data != null);

  const isPercentStat = heroStat === "winrate";

  const heroRows = useMemo(() => {
    if (!allLoaded) return [];

    const heroIds = new Set<number>();
    for (const q of bucketQueries) {
      for (const entry of q.data || []) {
        heroIds.add(entry.hero_id);
      }
    }

    const rows: {
      heroId: number;
      bucketValues: (number | null)[];
      delta: number | null;
    }[] = [];

    for (const heroId of heroIds) {
      const bucketValues = EXPERIENCE_BUCKETS.map((_, i) => {
        const entry = bucketQueries[i].data?.find((e) => e.hero_id === heroId);
        if (!entry || entry.matches < MIN_MATCHES_PER_BUCKET) return null;
        const raw = hero_stats_transform(entry, heroStat);
        return raw > 100 ? Math.round(raw) : Math.round(raw * 100) / 100;
      });

      const firstVal = bucketValues.find((v) => v !== null) ?? null;
      const lastVal = [...bucketValues].reverse().find((v) => v !== null) ?? null;
      const delta = firstVal !== null && lastVal !== null ? lastVal - firstVal : null;

      rows.push({ heroId, bucketValues, delta });
    }

    return rows;
  }, [allLoaded, bucketQueries, heroStat]);

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

  if (isLoading) {
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
                {formatValue(val)}
              </TableCell>
            ))}
            <TableCell className="text-center tabular-nums">{formatDelta(row.delta)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
