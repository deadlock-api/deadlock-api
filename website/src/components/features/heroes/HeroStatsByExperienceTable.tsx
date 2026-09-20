import { useQueries, useQuery } from "@tanstack/react-query";
import type { AnalyticsHeroStats } from "deadlock_api_client";
import { ArrowDown, ArrowUp, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs";
import { useDeferredValue, useMemo, useState } from "react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import type { GameMode } from "~/components/domain/selectors/GameModeSelector";
import type { MatchMode } from "~/components/domain/selectors/MatchModeSelector";
import { SortableHeader, SortButton, ariaSort } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { Panel } from "~/components/patterns/panel/Panel";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Badge } from "~/components/ui/badge";
import { PanelTooltip, TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";
import { SearchInput } from "~/components/ui/search-input";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { CACHE_DURATIONS } from "~/constants/cache";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { api } from "~/lib/api";
import { formatSignedPercent } from "~/lib/format";
import { TONE_TEXT, toneOf } from "~/lib/tone";
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

const SORT_KEYS: SortKey[] = [
  "name",
  "trend",
  ...EXPERIENCE_BUCKETS.flatMap((_, i): SortKey[] => [`value-${i}`, `delta-${i}`]),
];

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
  matchMode?: MatchMode;
}

export function HeroStatsByExperienceTable({
  heroStat,
  minRankId,
  maxRankId,
  minHeroMatches,
  minDate,
  maxDate,
  gameMode,
  matchMode,
}: HeroStatsByExperienceTableProps) {
  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);

  const bucketData = useQueries({
    combine: (queries) => queries.map((query) => query.data),
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
        matchMode,
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

  const anyLoaded = bucketData.some((data) => data != null);
  const allLoading = !anyLoaded || isLoadingAssetsHeroes;
  const bucketLoading = bucketData.map((data) => data == null);
  const baselineLoading = bucketLoading[BASELINE_BUCKET];

  const isPercentStat = heroStat === "winrate";

  const heroRows = useMemo<HeroRow[]>(() => {
    if (!anyLoaded) return [];

    const heroIds = new Set<number>();
    for (const data of bucketData) {
      for (const entry of data || []) {
        heroIds.add(entry.hero_id);
      }
    }

    const rows: HeroRow[] = [];

    for (const heroId of heroIds) {
      const bucketEntries = EXPERIENCE_BUCKETS.map((_, i) => {
        const entry = bucketData[i]?.find((e) => e.hero_id === heroId);
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
  }, [anyLoaded, bucketData, heroStat]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [sortKey, setSortKey] = useQueryState("exp_sort_key", parseAsStringLiteral(SORT_KEYS).withDefault("trend"));
  const [sortAsc, setSortAsc] = useQueryState("exp_sort_asc", parseAsBoolean.withDefault(false));

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
    if (val === null) return <span className="text-muted-foreground">-</span>;
    if (isPercentStat) return `${val.toFixed(1)}%`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
  };

  const sortDir = sortAsc ? "asc" : "desc";

  if (allLoading) {
    return <LoadingState label="hero stats by experience" align="center" />;
  }

  const heroCells = new Map(
    heroRows.map((row) => [
      row.heroId,
      <>
        <TableCell data-pinned>
          <HeroCell heroId={row.heroId} />
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
      </>,
    ]),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          How each hero's stats shift as players accumulate matches on them. Deltas and the trend line compare every
          experience tier against <span className="font-medium text-foreground">Beginner</span>.
        </p>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search heroes…"
          aria-label="Search heroes"
          className="w-full sm:max-w-56"
        />
      </div>

      <Panel>
        <Table>
          <TableHeader tone="muted">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <SortableHeader
                label="Hero"
                sortKey="name"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="start"
                className="min-w-40"
                data-pinned
              />
              {EXPERIENCE_BUCKETS.map((bucket, i) => (
                <TableHead
                  key={bucket.label}
                  className="text-center select-none"
                  aria-sort={ariaSort(sortKey === `value-${i}` || sortKey === `delta-${i}`, sortDir)}
                >
                  <div className="flex flex-col items-center gap-1">
                    <SortButton
                      active={sortKey === `value-${i}`}
                      sortDir={sortDir}
                      onClick={() => handleSort(`value-${i}`)}
                    >
                      {bucket.label}
                    </SortButton>
                    <span className="text-3xs font-normal text-muted-foreground">{bucket.sublabel}</span>
                    {i !== BASELINE_BUCKET ? (
                      <SortButton
                        active={sortKey === `delta-${i}`}
                        sortDir={sortDir}
                        onClick={() => handleSort(`delta-${i}`)}
                        className="text-3xs font-normal text-muted-foreground"
                      >
                        {"Δ"} vs Beginner
                      </SortButton>
                    ) : (
                      <span className="text-3xs font-normal text-muted-foreground">baseline</span>
                    )}
                  </div>
                </TableHead>
              ))}
              <SortableHeader
                label="Trend"
                sortKey="trend"
                activeSortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableEmptyRow colSpan={EXPERIENCE_BUCKETS.length + 3}>No heroes match "{deferredSearch}".</TableEmptyRow>
            ) : (
              sortedRows.map((row, index) => (
                <TableRow key={row.heroId}>
                  <TableCell className="text-center font-semibold text-muted-foreground">{index + 1}</TableCell>
                  {heroCells.get(row.heroId)}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function DeltaBadge({ delta, isPercent }: { delta: number | null; isPercent: boolean }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">—</span>;
  // Rounded to the displayed precision so the arrow and sign agree with the printed value.
  const rounded = Math.round(delta * 10) / 10;
  const tone = toneOf(rounded);
  const sign = rounded > 0 ? "+" : "";
  const text = isPercent
    ? `${sign}${rounded.toFixed(1)}%`
    : `${sign}${rounded.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  return (
    <Badge variant={tone === "neutral" ? "muted" : tone} size="sm" shape="square">
      {tone === "positive" && <ArrowUp />}
      {tone === "negative" && <ArrowDown />}
      {tone === "neutral" && <Minus />}
      {text}
    </Badge>
  );
}

// Inline trajectory of a hero's stat across the experience tiers. Direction is colored
// to match the delta badges (increase = green, decrease = red), without judging good/bad.
function Sparkline({ values, trend }: { values: (number | null)[]; trend: number | null }) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);

  if (points.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
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

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={TONE_TEXT[toneOf(trend)]}
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
  const netWorth = Math.round(entry.total_net_worth / entry.matches).toLocaleString("en-US");

  return (
    <PanelTooltip
      content={
        <>
          <TooltipHeader title={bucketLabel} />
          <TooltipStats>
            <TooltipRow label="Matches" value={entry.matches.toLocaleString("en-US")} />
            <TooltipRow label="Win rate" value={`${winrate}%`} highlight={heroStat === "winrate"} />
          </TooltipStats>
          <TooltipStats>
            <TooltipRow label="Kills/match" value={kills} highlight={heroStat === "kills_per_match"} />
            <TooltipRow label="Deaths/match" value={deaths} highlight={heroStat === "deaths_per_match"} />
            <TooltipRow label="Assists/match" value={assists} highlight={heroStat === "assists_per_match"} />
            <TooltipRow label="Net worth/match" value={netWorth} highlight={heroStat === "net_worth_per_match"} />
          </TooltipStats>
        </>
      }
    >
      <span>{children}</span>
    </PanelTooltip>
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
    return v > 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
  };

  return (
    <PanelTooltip
      content={
        <>
          <TooltipHeader
            lead={
              diff > 0 ? (
                <TrendingUp className="size-3.5 text-positive" />
              ) : diff < 0 ? (
                <TrendingDown className="size-3.5 text-negative" />
              ) : (
                <Minus className="size-3.5 text-muted-foreground" />
              )
            }
            title={`Beginner → ${bucketLabel}`}
          />
          <TooltipStats>
            <TooltipRow label="Beginner" value={fmt(baselineVal)} />
            <TooltipRow label={bucketLabel} value={fmt(bucketVal)} />
          </TooltipStats>
          <TooltipStats>
            <TooltipRow label="Difference" value={fmt(diff)} />
            {pct !== null && <TooltipRow label="Relative" value={formatSignedPercent(pct / 100)} />}
          </TooltipStats>
        </>
      }
    >
      <span>{children}</span>
    </PanelTooltip>
  );
}

function TooltipRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <TooltipStat label={label} value={value} className={highlight ? "font-bold" : undefined} />;
}
