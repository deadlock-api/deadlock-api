import { ListOrdered } from "lucide-react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useState } from "react";

import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { BuildSummaryStats } from "~/components/features/builds/BuildSummaryStats";
import { CHART_COLOR } from "~/components/patterns/charts/theme";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { useListNavigation } from "~/components/ui/hooks/use-list-navigation";
import { sortParams, useSort } from "~/components/ui/hooks/use-sort";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { BUILD_METRICS, type BuildMetric, type BuildPerformanceTotals } from "~/lib/build-performance";
import { buildItemIds, type BuildRow, type BuildSummary, type BuildTrend, buildLanguageName } from "~/lib/build-stats";
import { formatPercent, formatShare, formatSignedPercent } from "~/lib/format";
import { TONE_TEXT, toneOf } from "~/lib/tone";
import { cn } from "~/lib/utils";
import type { SteamProfileMap } from "~/queries/steam-queries";

/** A column's sort key: one of the overview's, or `m:` and a metric's key. */
type SortKey = string;
const parseSortKey = parseAsString.withDefault("matches");
const parseSortDir = parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc");

const VIEWS = ["overview", "combat", "economy"] as const;
type View = (typeof VIEWS)[number];
const parseView = parseAsStringLiteral(VIEWS).withDefault("overview");

/** Where a column that gives way first is hidden: `narrow` below a mid-size table, `wide` below a wide one. */
const HIDE_BELOW = { narrow: "hidden @lg/builds:table-cell", wide: "hidden @3xl/builds:table-cell" } as const;

/** The metric columns of the two performance views; `hide` columns give way as the table narrows. */
const VIEW_METRICS: Record<
  Exclude<View, "overview">,
  { metric: BuildMetric; label: string; hide?: keyof typeof HIDE_BELOW }[]
> = {
  combat: [
    { metric: metricByKey("kda"), label: "KDA" },
    { metric: metricByKey("kills"), label: "K / D / A", hide: "wide" },
    { metric: metricByKey("damagePerMin"), label: "Dmg/min" },
    { metric: metricByKey("accuracy"), label: "Accuracy", hide: "narrow" },
    { metric: metricByKey("critRate"), label: "Headshots", hide: "narrow" },
  ],
  economy: [
    { metric: metricByKey("soulsPerMin"), label: "Souls/min" },
    { metric: metricByKey("lastHits"), label: "Last hits" },
    { metric: metricByKey("objectiveDamage"), label: "Obj. dmg" },
    { metric: metricByKey("level"), label: "Level", hide: "narrow" },
    { metric: metricByKey("duration"), label: "Length", hide: "narrow" },
  ],
};

function metricByKey(key: string): BuildMetric {
  const metric = BUILD_METRICS.find((candidate) => candidate.key === key);
  if (!metric) throw new Error(`Unknown build metric ${key}`);
  return metric;
}

const COLUMNS: { key: SortKey; label: string; name: string; className?: string }[] = [
  { key: "matches", label: "Matches", name: "matches" },
  { key: "players", label: "Players", name: "players", className: "hidden @lg/builds:table-cell" },
  { key: "winRate", label: "Win rate", name: "win rate" },
  {
    key: "lowerBound",
    label: "Vs. avg",
    name: "confidence above the average",
    className: "hidden @md/builds:table-cell",
  },
  {
    key: "trend",
    label: "7d trend",
    name: "share change in the last 7 days",
    className: "hidden @lg/builds:table-cell",
  },
  { key: "updated", label: "Updated", name: "last update", className: "hidden @xl/builds:table-cell" },
];

const sortValue: Record<string, (row: BuildRow, trend: BuildTrend | undefined) => number> = {
  matches: (row) => row.matches,
  players: (row) => row.players,
  winRate: (row) => row.winRate,
  lowerBound: (row) => row.interval[0],
  trend: (_, trend) => trend?.change ?? 0,
  updated: (row) => row.meta?.updatedAt ?? 0,
};

/** Search text without case or accents, so "Pokemon" finds "Pokémon". */
function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Where the bar beside a win rate reaches its edge: ten points over or under the average. */
const VS_AVERAGE_SCALE = 0.1;

/** Every played build, sortable; a row press shows it in the detail panel. */
export function BuildTable({
  rows,
  trends,
  trendsPending,
  performance,
  performancePending,
  averagePerformance,
  summary,
  heroWinRate,
  profiles,
  metaPending,
  profilesPending,
  selectedId,
  onBuildIdChange,
}: {
  rows: readonly BuildRow[];
  /** Null while the recent window loads or when it has no matches. */
  trends: ReadonlyMap<number, BuildTrend> | null;
  trendsPending: boolean;
  /** Every build's performance totals, by id; undefined while they load. */
  performance: Readonly<Record<number, BuildPerformanceTotals>> | undefined;
  performancePending: boolean;
  /** Every listed build's totals pooled, for the footer. */
  averagePerformance: BuildPerformanceTotals | null;
  summary: BuildSummary;
  heroWinRate?: number;
  profiles: SteamProfileMap;
  metaPending: boolean;
  profilesPending: boolean;
  selectedId: number;
  onBuildIdChange: (buildId: number) => void;
}) {
  const sort = useSort<SortKey>(
    sortParams(useQueryState("sort", parseSortKey), useQueryState("dir", parseSortDir), { history: "replace" }),
  );
  const [query, setQuery] = useState("");
  // In the URL like the page's filters, so a shared link keeps them. One update sets both lists.
  const [itemParams, setItemParams] = useQueryStates(
    {
      with_items: parseAsArrayOf(parseAsInteger).withDefault([]),
      without_items: parseAsArrayOf(parseAsInteger).withDefault([]),
    },
    { history: "replace" },
  );
  const itemStates = new Map<number, TriState>([
    ...itemParams.with_items.map((id): [number, TriState] => [id, "included"]),
    ...itemParams.without_items.map((id): [number, TriState] => [id, "excluded"]),
  ]);
  const setItemStates = (next: Map<number, TriState>) => {
    const ids = (state: TriState) => {
      const matching = [...next].filter(([, s]) => s === state).map(([id]) => id);
      return matching.length > 0 ? matching : null;
    };
    void setItemParams({ with_items: ids("included"), without_items: ids("excluded") });
  };
  const [view, setView] = useQueryState("columns", parseView.withOptions({ history: "replace" }));
  const metricColumns = view === "overview" ? [] : VIEW_METRICS[view];
  const columns =
    view === "overview"
      ? COLUMNS
      : [
          COLUMNS[0],
          COLUMNS[2],
          ...metricColumns.map(({ metric, label, hide }) => ({
            key: `m:${metric.key}`,
            label,
            name: metric.label.toLowerCase(),
            className: hide ? HIDE_BELOW[hide] : undefined,
          })),
        ];
  const sign = sort.dir === "desc" ? -1 : 1;
  const sortMetric = sort.sortKey.startsWith("m:") ? metricByKey(sort.sortKey.slice(2)) : undefined;
  const value = (row: BuildRow) => {
    if (sortMetric) {
      const totals = performance?.[row.hero_build_id];
      return (totals && sortMetric.value(totals)) ?? Number.NEGATIVE_INFINITY;
    }
    return (sortValue[sort.sortKey] ?? sortValue.matches)(row, trends?.get(row.hero_build_id));
  };
  const needle = fold(query.trim());
  const byText = needle
    ? rows.filter((row) => {
        const author = row.meta ? profiles[row.meta.authorId]?.personaname : undefined;
        return [row.meta?.name, author, String(row.hero_build_id)].some((text) => text && fold(text).includes(needle));
      })
    : rows;
  // Builds that list every included item and none of the excluded ones; without contents a build cannot qualify.
  const filteringItems = itemParams.with_items.length > 0 || itemParams.without_items.length > 0;
  const shown = filteringItems
    ? byText.filter((row) => {
        if (!row.meta) return false;
        const listed = new Set(buildItemIds(row.meta));
        return (
          itemParams.with_items.every((id) => listed.has(id)) && !itemParams.without_items.some((id) => listed.has(id))
        );
      })
    : byText;
  const sorted = [...shown].sort(
    (a, b) => sign * (value(a) - value(b)) || b.matches - a.matches || a.hero_build_id - b.hero_build_id,
  );
  const maxShare = Math.max(...rows.map((row) => row.share));
  const navigation = useListNavigation({
    count: sorted.length,
    value: sorted.findIndex((row) => row.hero_build_id === selectedId),
    onValueChange: (index) => onBuildIdChange(sorted[index].hero_build_id),
  });

  return (
    // The table scrolls inside the panel, so the panel keeps one height beside the build details.
    <Panel className="@container/builds flex flex-col *:data-[slot=table-container]:max-h-136">
      <PanelHeader title="Builds" icon={ListOrdered} size="sm">
        <BuildSummaryStats summary={summary} heroWinRate={heroWinRate} />
        <ItemSelector selection="tri-state" size="sm" value={itemStates} onValueChange={setItemStates} />
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Name, author or ID"
          aria-label="Filter builds by name, author or ID"
          size="sm"
          className="w-full @sm:ms-auto @sm:w-60"
        />
        <Segmented size="sm" width="hug" value={view} onValueChange={setView} aria-label="Columns">
          <SegmentedItem value="overview">Overview</SegmentedItem>
          <SegmentedItem value="combat">Combat</SegmentedItem>
          <SegmentedItem value="economy">Economy</SegmentedItem>
        </Segmented>
      </PanelHeader>
      <Table density="dense" aria-label="Builds by matches and win rate">
        <TableHeader position="sticky">
          <TableRow>
            <TableHead className="w-8 text-end text-xs text-muted-foreground">#</TableHead>
            <TableHead className="text-xs text-muted-foreground">Build</TableHead>
            {columns.map(({ key, label, name, className }) => (
              <SortableHeader
                key={key}
                label={label}
                sortKey={key}
                activeSortKey={sort.sortKey}
                sortDir={sort.dir}
                align="end"
                size="sm"
                className={cn("text-xs text-muted-foreground", className)}
                sortLabel={`Sort by ${name}`}
                onSortChange={sort.toggle}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody onKeyDown={navigation.onKeyDown}>
          {sorted.map((row, index) => {
            const selected = row.hero_build_id === selectedId;
            const author = row.meta ? profiles[row.meta.authorId] : undefined;
            const average = row.winRate - row.vsAverage;
            return (
              <TableRow
                key={row.hero_build_id}
                data-interactive=""
                data-state={selected ? "active" : undefined}
                onClick={(event) => {
                  onBuildIdChange(row.hero_build_id);
                  // A click on the row's cells focuses its button, so the arrow keys go on from here.
                  event.currentTarget.querySelector<HTMLElement>("[data-list-index]")?.focus({ preventScroll: true });
                }}
              >
                <TableCell className="text-end text-xs text-muted-foreground tabular-nums">{index + 1}</TableCell>
                <TableCell className="w-full max-w-0">
                  <div className="flex min-w-0 flex-col">
                    {row.meta ? (
                      <Button
                        variant="text"
                        size="inline"
                        aria-current={selected || undefined}
                        data-list-index={index}
                        title={row.meta.name}
                        className="block max-w-full justify-start truncate text-start font-medium"
                        onClick={(event) => {
                          event.stopPropagation();
                          onBuildIdChange(row.hero_build_id);
                        }}
                      >
                        {row.meta.name}
                      </Button>
                    ) : metaPending ? (
                      <Skeleton className="h-5 w-40" />
                    ) : (
                      <Button
                        variant="text"
                        size="inline"
                        aria-current={selected || undefined}
                        data-list-index={index}
                        className="justify-start text-muted-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          onBuildIdChange(row.hero_build_id);
                        }}
                      >
                        Build {row.hero_build_id}
                      </Button>
                    )}
                    <span className="truncate text-xs text-muted-foreground">
                      {row.meta ? (
                        <>
                          {author?.personaname ?? (profilesPending ? "…" : `Player ${row.meta.authorId}`)}
                          {row.meta.language !== 0 && ` · ${buildLanguageName(row.meta.language)}`}
                        </>
                      ) : (
                        `#${row.hero_build_id}`
                      )}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-end">
                  <div className="ms-auto flex w-16 flex-col items-end gap-1 tabular-nums">
                    <span>{row.matches.toLocaleString("en-US")}</span>
                    <ProgressBar
                      variant="thin"
                      value={maxShare > 0 ? row.share / maxShare : 0}
                      color={CHART_COLOR.share}
                      aria-label={`${formatShare(row.share)} of build matches`}
                      className="w-full"
                    />
                  </div>
                </TableCell>
                {view === "overview" && (
                  <TableCell className="hidden text-end tabular-nums @lg/builds:table-cell">
                    {row.players.toLocaleString("en-US")}
                  </TableCell>
                )}
                <TableCell className="text-end tabular-nums">{formatPercent(row.winRate)}</TableCell>
                {metricColumns.map(({ metric, hide }) => (
                  <TableCell key={metric.key} className={cn("text-end tabular-nums", hide && HIDE_BELOW[hide])}>
                    <MetricValue
                      metric={metric}
                      totals={performance?.[row.hero_build_id]}
                      pending={performancePending}
                    />
                  </TableCell>
                ))}
                {view === "overview" && (
                  <>
                    <TableCell className="hidden text-end @md/builds:table-cell">
                      <div className="ms-auto flex w-20 flex-col items-end gap-1">
                        <span className={cn("text-xs tabular-nums", TONE_TEXT[toneOf(verdictSign(row))])}>
                          {formatSignedPercent(row.vsAverage)}
                        </span>
                        <DivergingBar
                          value={row.vsAverage}
                          interval={[row.interval[0] - average, row.interval[1] - average]}
                          scale={VS_AVERAGE_SCALE}
                          className="w-full"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-end text-xs tabular-nums @lg/builds:table-cell">
                      {trendsPending ? (
                        <Skeleton className="ms-auto h-4 w-12" />
                      ) : (
                        <Delta
                          value={trends?.get(row.hero_build_id)?.change}
                          unit=" pp"
                          polarity="neutral"
                          sign="arrow"
                          className="justify-end"
                        />
                      )}
                    </TableCell>
                    <TableCell className="hidden text-end text-xs whitespace-nowrap text-muted-foreground tabular-nums @xl/builds:table-cell">
                      {row.meta ? day.unix(row.meta.updatedAt).utc().format("MMM D, YYYY") : ""}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableEmptyRow colSpan={columns.length + 2}>
              {needle ? `No build matches “${query}”` : "No build lists these items"}
            </TableEmptyRow>
          )}
        </TableBody>
        {!needle && !filteringItems && (
          <TableFooter>
            <TableRow>
              <TableCell />
              <TableCell className="text-xs text-muted-foreground">All builds</TableCell>
              <TableCell className="text-end tabular-nums">{summary.matches.toLocaleString("en-US")}</TableCell>
              {view === "overview" && <TableCell className="hidden @lg/builds:table-cell" />}
              <TableCell className="text-end tabular-nums">{formatPercent(summary.winRate)}</TableCell>
              {metricColumns.map(({ metric, hide }) => (
                <TableCell key={metric.key} className={cn("text-end tabular-nums", hide && HIDE_BELOW[hide])}>
                  <MetricValue metric={metric} totals={averagePerformance ?? undefined} pending={performancePending} />
                </TableCell>
              ))}
              {view === "overview" && (
                <>
                  <TableCell className="hidden @md/builds:table-cell" />
                  <TableCell className="hidden @lg/builds:table-cell" />
                  <TableCell className="hidden @xl/builds:table-cell" />
                </>
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </Panel>
  );
}

/** A difference is colored only when the whole interval is on one side of the average. */
function verdictSign(row: BuildRow): number {
  return row.verdict === "above" ? 1 : row.verdict === "below" ? -1 : 0;
}

/** A build's value of one metric in a table cell, a K / D / A triple for the kills column. */
function MetricValue({
  metric,
  totals,
  pending,
}: {
  metric: BuildMetric;
  totals: BuildPerformanceTotals | undefined;
  pending: boolean;
}) {
  if (!totals) return pending ? <Skeleton className="ms-auto h-4 w-12" /> : <NoValue />;
  if (metric.key === "kills") {
    // Totals only come with at least one match, so the divisor is never 0.
    const per = (total: number) => (total / totals.matches).toFixed(1);
    return (
      <span className="whitespace-nowrap">
        {per(totals.total_kills)} / {per(totals.total_deaths)} / {per(totals.total_assists)}
      </span>
    );
  }
  const value = metric.value(totals);
  return value === null ? <NoValue /> : metric.format(value);
}
