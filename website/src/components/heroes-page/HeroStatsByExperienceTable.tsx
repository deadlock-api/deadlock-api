import { useQueries, useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { ArrowDown, ArrowUp, ChevronsUpDown, Minus, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { LoadingLogo } from "~/components/LoadingLogo";
import type { GameMode } from "~/components/selectors/GameModeSelector";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";
import { queryKeys } from "~/queries/query-keys";
import { type HERO_STATS, hero_stats_transform } from "~/types/api_hero_stats";

const EXPERIENCE_BUCKETS = [
  { label: "Beginner", sublabel: "1-25 matches", min: 1, max: 25 },
  { label: "Intermediate", sublabel: "25-100 matches", min: 25, max: 100 },
  { label: "Experienced", sublabel: "100-500 matches", min: 100, max: 500 },
] as const;

const MIN_MATCHES_PER_BUCKET = 10;

// The first bucket (Beginner) is the baseline that all deltas are measured against.
const BASELINE_BUCKET = 0;

type SortKey = "name" | "trend" | `value-${number}` | `delta-${number}`;

interface HeroRow {
  heroId: number;
  bucketValues: (number | null)[];
  bucketEntries: (AnalyticsHeroStats | null)[];
  bucketDeltas: (number | null)[];
  // Relative change from baseline to the last loaded bucket, used to sort the trend column.
  trend: number | null;
}

interface HeroStatsByExperienceTableProps {
  heroStat: (typeof HERO_STATS)[number];
  minRankId?: number;
  maxRankId?: number;
  minHeroMatches?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  gameMode?: GameMode;
}

export function HeroStatsByExperienceTable({
  heroStat,
  minRankId,
  maxRankId,
  minHeroMatches,
  minDate,
  maxDate,
  gameMode,
}: HeroStatsByExperienceTableProps) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const bucketQueries = useQueries({
    queries: EXPERIENCE_BUCKETS.map((bucket) => {
      const heroStatsByExperienceQuery = {
        minHeroMatches,
        minHeroMatchesTotal: bucket.min,
        maxHeroMatchesTotal: bucket.max,
        minAverageBadge: minRankId,
        maxAverageBadge: maxRankId,
        minUnixTimestamp: minUnixTimestamp ?? 0,
        maxUnixTimestamp,
        bucket: "no_bucket" as const,
        gameMode,
      };
      return {
        queryKey: queryKeys.analytics.heroStatsByExperience(heroStatsByExperienceQuery),
        queryFn: async () => {
          const response = await api.analytics_api.heroStats(heroStatsByExperienceQuery);
          return response.data;
        },
        staleTime: CACHE_DURATIONS.ONE_DAY,
      };
    }),
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
  const baselineLoading = bucketLoading[BASELINE_BUCKET];

  const isPercentStat = heroStat === "winrate";

  const heroRows = useMemo<HeroRow[]>(() => {
    if (!anyLoaded) return [];

    const heroIds = new Set<number>();
    for (const q of bucketQueries) {
      for (const entry of q.data || []) {
        heroIds.add(entry.hero_id);
      }
    }

    const rows: HeroRow[] = [];

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

      const baselineValue = bucketValues[BASELINE_BUCKET];
      const bucketDeltas = bucketValues.map((val, i) => {
        if (i === BASELINE_BUCKET) return null;
        if (val === null || baselineValue === null) return null;
        return Math.round((val - baselineValue) * 100) / 100;
      });

      // Overall trend: baseline vs the last bucket that actually has a value.
      const lastDelta = [...bucketDeltas].reverse().find((d) => d !== null);
      const trend = lastDelta ?? null;

      rows.push({ heroId, bucketValues, bucketEntries, bucketDeltas, trend });
    }

    return rows;
  }, [anyLoaded, bucketQueries, heroStat]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [sortKey, setSortKey] = useState<SortKey>("trend");
  const [sortAsc, setSortAsc] = useState(false);

  const filteredRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return heroRows;
    return heroRows.filter((row) => (heroIdMap[row.heroId]?.name ?? "").toLowerCase().includes(q));
  }, [heroRows, heroIdMap, deferredSearch]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortKey === "name") {
        const aName = heroIdMap[a.heroId]?.name ?? "";
        const bName = heroIdMap[b.heroId]?.name ?? "";
        const cmp = aName.localeCompare(bName);
        return sortAsc ? cmp : -cmp;
      }

      let aVal: number | null;
      let bVal: number | null;
      if (sortKey === "trend") {
        aVal = a.trend;
        bVal = b.trend;
      } else if (sortKey.startsWith("delta-")) {
        const idx = Number(sortKey.slice("delta-".length));
        aVal = a.bucketDeltas[idx];
        bVal = b.bucketDeltas[idx];
      } else {
        const idx = Number(sortKey.slice("value-".length));
        aVal = a.bucketValues[idx];
        bVal = b.bucketValues[idx];
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [filteredRows, sortKey, sortAsc, heroIdMap]);

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

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronsUpDown className="size-3 opacity-30" />;
    return sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
  };

  const ariaSort = (...keys: SortKey[]): "ascending" | "descending" | undefined => {
    if (!keys.includes(sortKey)) return undefined;
    return sortAsc ? "ascending" : "descending";
  };

  const handleKeyDown = (key: SortKey) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSort(key);
    }
  };

  if (allLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center py-16">
        <LoadingLogo />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          How each hero's stats shift as players accumulate matches on them. Deltas and the trend line compare every
          experience tier against <span className="font-medium text-foreground">Beginner</span>.
        </p>
        <div className="relative w-full sm:max-w-56">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search heroes…"
            className="pl-8"
            aria-label="Search heroes"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <SortableHead
                className="min-w-40"
                active={ariaSort("name")}
                onSort={() => handleSort("name")}
                onKeyDown={handleKeyDown("name")}
              >
                Hero
                {sortIcon("name")}
              </SortableHead>
              {EXPERIENCE_BUCKETS.map((bucket, i) => (
                <TableHead
                  key={bucket.label}
                  className="text-center select-none"
                  aria-sort={ariaSort(`value-${i}`, `delta-${i}`)}
                >
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSort(`value-${i}`)}
                      className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
                    >
                      {bucket.label}
                      {sortIcon(`value-${i}`)}
                    </button>
                    <span className="text-[10px] font-normal text-muted-foreground">{bucket.sublabel}</span>
                    {i !== BASELINE_BUCKET ? (
                      <button
                        type="button"
                        onClick={() => handleSort(`delta-${i}`)}
                        className="inline-flex cursor-pointer items-center gap-0.5 text-[10px] font-normal text-muted-foreground hover:text-foreground"
                      >
                        {"Δ"} vs Beginner
                        {sortIcon(`delta-${i}`)}
                      </button>
                    ) : (
                      <span className="text-[10px] font-normal text-muted-foreground/60">baseline</span>
                    )}
                  </div>
                </TableHead>
              ))}
              <SortableHead
                className="text-center"
                active={ariaSort("trend")}
                onSort={() => handleSort("trend")}
                onKeyDown={handleKeyDown("trend")}
                center
              >
                Trend
                {sortIcon("trend")}
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={EXPERIENCE_BUCKETS.length + 3} className="py-10 text-center text-muted-foreground">
                  No heroes match "{deferredSearch}".
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row, index) => (
                <TableRow key={row.heroId} className="hover:bg-muted/40">
                  <TableCell className="text-center font-semibold text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <HeroImage heroId={row.heroId} />
                      <HeroName heroId={row.heroId} />
                    </div>
                  </TableCell>
                  {row.bucketValues.map((val, i) => (
                    // eslint-disable-next-line react/no-array-index-key -- key is EXPERIENCE_BUCKETS[i].label, not raw index
                    <TableCell key={EXPERIENCE_BUCKETS[i].label} className="text-center tabular-nums">
                      {bucketLoading[i] ? (
                        <Skeleton className="mx-auto h-4 w-12" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <BucketTooltip
                            entry={row.bucketEntries[i]}
                            heroStat={heroStat}
                            bucketLabel={EXPERIENCE_BUCKETS[i].label}
                          >
                            <span className="font-medium">{formatValue(val)}</span>
                          </BucketTooltip>
                          {i !== BASELINE_BUCKET &&
                            (baselineLoading ? (
                              <Skeleton className="h-4 w-10" />
                            ) : (
                              <DeltaTooltip
                                baselineEntry={row.bucketEntries[BASELINE_BUCKET]}
                                bucketEntry={row.bucketEntries[i]}
                                bucketLabel={EXPERIENCE_BUCKETS[i].label}
                                heroStat={heroStat}
                              >
                                <DeltaBadge delta={row.bucketDeltas[i]} isPercent={isPercentStat} />
                              </DeltaTooltip>
                            ))}
                        </div>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center">
                      <Sparkline values={row.bucketValues} trend={row.trend} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortableHead({
  children,
  className,
  active,
  onSort,
  onKeyDown,
  center,
}: {
  children: React.ReactNode;
  className?: string;
  active: "ascending" | "descending" | undefined;
  onSort: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  center?: boolean;
}) {
  return (
    <TableHead
      className={cn("cursor-pointer select-none", className)}
      aria-sort={active}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex w-full cursor-pointer items-center gap-1 hover:text-foreground",
          center && "justify-center",
        )}
      >
        {children}
      </button>
    </TableHead>
  );
}

function DeltaBadge({ delta, isPercent }: { delta: number | null; isPercent: boolean }) {
  if (delta === null) return <span className="text-xs text-muted-foreground/40">—</span>;
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const cls = {
    up: "bg-green-500/10 text-green-500",
    down: "bg-red-500/10 text-red-500",
    flat: "bg-muted text-muted-foreground",
  }[dir];
  const sign = delta > 0 ? "+" : "";
  const text = isPercent
    ? `${sign}${delta.toFixed(1)}%`
    : `${sign}${delta.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums", cls)}
    >
      {dir === "up" && <ArrowUp className="size-3" />}
      {dir === "down" && <ArrowDown className="size-3" />}
      {dir === "flat" && <Minus className="size-3" />}
      {text}
    </span>
  );
}

// Inline trajectory of a hero's stat across the experience tiers. Direction is colored
// to match the delta badges (increase = green, decrease = red), without judging good/bad.
function Sparkline({ values, trend }: { values: (number | null)[]; trend: number | null }) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);

  if (points.length < 2) {
    return <span className="text-xs text-muted-foreground/40">—</span>;
  }

  const w = 84;
  const h = 28;
  const pad = 4;
  const n = values.length;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const x = (i: number) => pad + (n === 1 ? 0.5 : i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - 2 * pad);

  const line = points.map((p, idx) => `${idx === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const area = `${line} L${x(points[points.length - 1].i)},${h - pad} L${x(points[0].i)},${h - pad} Z`;

  const colorClass =
    trend == null || trend === 0 ? "text-muted-foreground" : trend > 0 ? "text-green-500" : "text-red-500";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={colorClass}
      aria-label="Stat trajectory across experience tiers"
    >
      <title>Stat trajectory across experience tiers</title>
      <path d={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={1.8} fill="currentColor" />
      ))}
    </svg>
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
      <TooltipContent className="border border-border bg-popover p-3 text-popover-foreground shadow-md">
        <div className="flex flex-col gap-1 text-xs">
          <div className="mb-1 font-medium text-foreground">{bucketLabel}</div>
          <TooltipRow label="Matches" value={entry.matches.toLocaleString()} />
          <TooltipRow label="Win rate" value={`${winrate}%`} highlight={heroStat === "winrate"} />
          <div className="my-1 border-t border-border" />
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
  baselineEntry,
  bucketEntry,
  bucketLabel,
  heroStat,
  children,
}: {
  baselineEntry: AnalyticsHeroStats | null;
  bucketEntry: AnalyticsHeroStats | null;
  bucketLabel: string;
  heroStat: (typeof HERO_STATS)[number];
  children: React.ReactNode;
}) {
  if (!baselineEntry || !bucketEntry || baselineEntry === bucketEntry) return <>{children}</>;

  const baselineVal = hero_stats_transform(baselineEntry, heroStat);
  const bucketVal = hero_stats_transform(bucketEntry, heroStat);
  const isPercent = heroStat === "winrate";
  const diff = bucketVal - baselineVal;
  const pct = baselineVal !== 0 ? (diff / baselineVal) * 100 : null;

  const fmt = (v: number) => {
    if (isPercent) return `${v.toFixed(2)}%`;
    return v > 100 ? Math.round(v).toLocaleString() : v.toFixed(1);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="border border-border bg-popover p-3 text-popover-foreground shadow-md">
        <div className="flex flex-col gap-1 text-xs">
          <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
            {diff > 0 ? (
              <TrendingUp className="size-3.5 text-green-500" />
            ) : diff < 0 ? (
              <TrendingDown className="size-3.5 text-red-500" />
            ) : (
              <Minus className="size-3.5 text-muted-foreground" />
            )}
            Beginner → {bucketLabel}
          </div>
          <TooltipRow label="Beginner" value={fmt(baselineVal)} />
          <TooltipRow label={bucketLabel} value={fmt(bucketVal)} />
          <div className="my-1 border-t border-border" />
          <TooltipRow label="Difference" value={fmt(diff)} />
          {pct !== null && <TooltipRow label="Relative" value={`${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`} />}
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
