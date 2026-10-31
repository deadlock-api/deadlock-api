import { useQuery } from "@tanstack/react-query";
import { ListOrdered } from "lucide-react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { useRef, useState } from "react";

import { ItemSelector } from "~/components/domain/selectors/ItemSelector";
import { BuildSummaryStats } from "~/components/features/builds/BuildSummaryStats";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import type { TriState } from "~/components/patterns/filter-bar/TriStateSelector";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { useListNavigation } from "~/components/ui/hooks/use-list-navigation";
import { sortParams, useSort } from "~/components/ui/hooks/use-sort";
import { NoValue } from "~/components/ui/no-value";
import { DivergingBar } from "~/components/ui/rate-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "~/components/ui/table";
import { day } from "~/dayjs";
import { useHeroById } from "~/hooks/useAssetById";
import { type BuildIdChoice, type BuildLookupResult, parseBuildId, useBuildLookup } from "~/hooks/useBuildLookup";
import { BUILD_METRICS, type BuildMetric, type BuildPerformanceTotals } from "~/lib/build-performance";
import {
  buildMatchesItems,
  type BuildRow,
  type BuildSummary,
  type BuildTrend,
  buildLanguageName,
} from "~/lib/build-stats";
import { formatPercent, formatSignedPoints } from "~/lib/format";
import { toneOf } from "~/lib/tone";
import { cn, useDebouncedValue } from "~/lib/utils";
import type { HeroBuild } from "~/lib/wasm/hero-build";
import { heroBuildLookupQueryOptions } from "~/queries/hero-build-stats-query";
import type { SteamProfileMap } from "~/queries/steam-queries";

/** A column's sort key: one of the overview's, or `m:` and a metric's key. */
type SortKey = string;
const parseSortKey = parseAsString.withDefault("matches");
const parseQuery = parseAsString.withDefault("").withOptions({ history: "replace" });
const parseSortDir = parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc");

const VIEWS = ["overview", "combat", "economy"] as const;
type View = (typeof VIEWS)[number];
const parseView = parseAsStringLiteral(VIEWS).withDefault("overview");

/**
 * Where a column that gives way is hidden: `compact` below a phone-wide table (all but one metric of a view go, so a
 * build's name keeps its room), `narrow` below a mid-size table, `wide` below a wide one.
 */
const HIDE_BELOW = {
  compact: "hidden @sm/builds:table-cell",
  // From 42rem: below it a desktop's two-thirds list (~35rem) kept five metrics and cut the build names to "Parzeli…".
  narrow: "hidden @2xl/builds:table-cell",
  wide: "hidden @3xl/builds:table-cell",
} as const;

/** The metric columns of the two performance views; `hide` columns give way as the table narrows. */
const VIEW_METRICS: Record<
  Exclude<View, "overview">,
  { metric: BuildMetric; label: string; hide?: keyof typeof HIDE_BELOW }[]
> = {
  combat: [
    { metric: metricByKey("kda"), label: "KDA" },
    // Sorted by kills; the cell shows the K / D / A triple.
    { metric: metricByKey("kills"), label: "Kills", hide: "wide" },
    { metric: metricByKey("damagePerMin"), label: "Dmg/min", hide: "compact" },
    { metric: metricByKey("accuracy"), label: "Accuracy", hide: "narrow" },
    { metric: metricByKey("critRate"), label: "Headshots", hide: "narrow" },
  ],
  economy: [
    { metric: metricByKey("soulsPerMin"), label: "Souls/min" },
    { metric: metricByKey("lastHits"), label: "Last hits", hide: "compact" },
    { metric: metricByKey("objectiveDamage"), label: "Obj. dmg", hide: "compact" },
    { metric: metricByKey("level"), label: "Level", hide: "narrow" },
    { metric: metricByKey("duration"), label: "Length", hide: "narrow" },
  ],
};

function metricByKey(key: string): BuildMetric {
  const metric = BUILD_METRICS.find((candidate) => candidate.key === key);
  if (!metric) throw new Error(`Unknown build metric ${key}`);
  return metric;
}

interface Column {
  key: SortKey;
  label: string;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "matches", label: "Matches" },
  { key: "players", label: "Players", className: "hidden @2xl/builds:table-cell" },
  { key: "winRate", label: "Win rate" },
  {
    key: "vsAverage",
    label: "Vs. all builds",
    className: "hidden @md/builds:table-cell",
  },
  {
    key: "trend",
    label: "Pick trend 7d",
    className: "hidden @2xl/builds:table-cell",
  },
  { key: "updated", label: "Updated", className: "hidden @3xl/builds:table-cell" },
];

const sortValue: Record<string, (row: BuildRow, trend: BuildTrend | undefined) => number> = {
  matches: (row) => row.matches,
  players: (row) => row.players,
  winRate: (row) => row.winRate,
  vsAverage: (row) => row.vsAverage,
  trend: (_, trend) => trend?.change ?? 0,
  updated: (row) => row.meta?.updatedAt ?? 0,
};

/** Search text without case or accents, so "Pokemon" finds "Pokémon". */
function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** How long typing must rest before a build ID that is not in the list is looked up. */
const LOOKUP_DELAY_MS = 300;

/** Where the bar beside a win rate reaches its edge: ten points over or under the average. */
const VS_AVERAGE_SCALE = 0.1;

/** Every played build, sortable; a row press shows it in the detail panel. */
export function BuildTable({
  heroId,
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
  onBuildFound,
  onUnpublishedBuild,
  onBuildHover,
  highlightedId = null,
  className,
}: {
  /** The hero the listed builds are for. */
  heroId: number;
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
  /**
   * The search also finds a build by its ID or a game code (Enter): one that is not in the list, perhaps another
   * hero's, goes here. Without it the search only filters the list.
   */
  onBuildFound?: (choice: BuildIdChoice) => void;
  /** A game code searched for whose build is not published. */
  onUnpublishedBuild?: (build: HeroBuild) => void;
  /** The build under the pointer, null when it leaves the list: the chart lights its dot. */
  onBuildHover?: (buildId: number | null) => void;
  /** The build whose dot the chart's pointer is on: its row is marked. */
  highlightedId?: number | null;
  className?: string;
}) {
  const sort = useSort<SortKey>(
    sortParams(useQueryState("sort", parseSortKey), useQueryState("dir", parseSortDir), { history: "replace" }),
  );
  // In the URL like the sort and the item filter, so a shared link keeps the search too.
  const [query, setQuery] = useQueryState("q", parseQuery);
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
    holdHeight(next.size > 0 || query.trim() !== "");
    void setItemParams({ with_items: ids("included"), without_items: ids("excluded") });
  };
  // A search or an item filter keeps the list as tall as it was without them: the list's height sets its row's, and a
  // narrowing that shrank it would move the page below with every key. Read once, in the handler that starts it.
  const panelRef = useRef<HTMLDivElement>(null);
  const [heldHeight, setHeldHeight] = useState<number | null>(null);
  const holdHeight = (narrowing: boolean) => {
    if (!narrowing) setHeldHeight(null);
    else if (heldHeight === null && panelRef.current) setHeldHeight(panelRef.current.getBoundingClientRect().height);
  };
  const [view, setView] = useQueryState("columns", parseView.withOptions({ history: "replace" }));
  const metricColumns = view === "overview" ? [] : VIEW_METRICS[view];
  const columns: Column[] =
    view === "overview"
      ? COLUMNS
      : [
          // A metric view on a phone keeps the win rate and its one metric beside the name: the matches give way.
          { ...COLUMNS[0], className: HIDE_BELOW.compact },
          COLUMNS[2],
          ...metricColumns.map(({ metric, label, hide }) => ({
            key: `m:${metric.key}`,
            label,
            className: hide ? HIDE_BELOW[hide] : undefined,
          })),
        ];
  const sign = sort.dir === "desc" ? -1 : 1;
  // A hand-edited `sort` naming no metric sorts by matches, as an unknown column key does.
  const sortMetric = sort.sortKey.startsWith("m:")
    ? BUILD_METRICS.find((metric) => metric.key === sort.sortKey.slice(2))
    : undefined;
  const value = (row: BuildRow) => {
    if (sortMetric) {
      const totals = performance?.[row.hero_build_id];
      return (totals && sortMetric.value(totals)) ?? Number.NEGATIVE_INFINITY;
    }
    return (sortValue[sort.sortKey] ?? sortValue.matches)(row, trends?.get(row.hero_build_id));
  };
  // A build ID typed into the search: the list's own build is filtered to; one the list does not hold (another hero's,
  // or one these filters leave out) is looked up once typing rests and offered above the list.
  const typedId = parseBuildId(query);
  const exactRow = typedId === null ? undefined : rows.find((row) => row.hero_build_id === typedId);
  const lookupId = useDebouncedValue(exactRow ? null : typedId, LOOKUP_DELAY_MS);
  const lookupQuery = useQuery({
    ...heroBuildLookupQueryOptions(lookupId ?? 0),
    enabled: onBuildFound !== undefined && lookupId !== null && lookupId === typedId,
  });
  const found = !exactRow && lookupQuery.data?.buildId === typedId ? lookupQuery.data : null;
  // Until the lookup answers, an empty list says it is looking rather than that nothing matches.
  const lookingUp =
    onBuildFound !== undefined &&
    typedId !== null &&
    !exactRow &&
    !found &&
    (lookupId !== typedId || lookupQuery.isFetching);
  const { hero: foundHero } = useHeroById(found?.heroId ?? 0);
  // A found build is shown with the list whole again: the search did its job.
  const showFound = (choice: BuildIdChoice) => {
    holdHeight(itemParams.with_items.length > 0 || itemParams.without_items.length > 0);
    void setQuery(null);
    onBuildFound?.({ buildId: choice.buildId, heroId: choice.heroId });
  };
  const { lookUp } = useBuildLookup({ onFound: showFound, onUnpublishedBuild });
  // What Enter found wrong, for the text it was pressed on: editing the search clears it.
  const [searchProblem, setSearchProblem] = useState<{ query: string; message: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const problem = searchProblem?.query === query ? searchProblem.message : null;
  const submitSearch = async () => {
    if (exactRow) {
      onBuildIdChange(exactRow.hero_build_id);
      return;
    }
    if (!onBuildFound || !query.trim()) return;
    const text = query;
    setSearching(true);
    const result = await lookUp(text).catch((): BuildLookupResult => ({
      status: "problem",
      message: "The build could not be looked up, try again",
    }));
    setSearching(false);
    if (result.status === "problem") setSearchProblem({ query: text, message: result.message });
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
    ? byText.filter((row) => buildMatchesItems(row.meta, itemParams.with_items, itemParams.without_items))
    : byText;
  const sorted = [...shown].sort(
    (a, b) => sign * (value(a) - value(b)) || b.matches - a.matches || a.hero_build_id - b.hero_build_id,
  );
  const navigation = useListNavigation({
    count: sorted.length,
    value: sorted.findIndex((row) => row.hero_build_id === selectedId),
    onValueChange: (index) => onBuildIdChange(sorted[index].hero_build_id),
  });

  return (
    // The table scrolls inside the panel once the list passes the row's cap; beside it the build details take its
    // height.
    <Panel
      ref={panelRef}
      className={cn("@container/builds flex flex-col", className)}
      style={heldHeight === null ? undefined : { minHeight: heldHeight }}
    >
      <PanelHeader title="Builds" icon={ListOrdered} size="sm">
        <BuildSummaryStats summary={summary} heroWinRate={heroWinRate} />
        {/* One width whatever it holds, like the search: a pick that widened it re-wrapped the header under the
            open menu. A longer summary truncates. */}
        <ItemSelector
          selection="tri-state"
          size="sm"
          value={itemStates}
          onValueChange={setItemStates}
          className="w-36"
        />
        <SearchInput
          value={query}
          onValueChange={(next) => {
            holdHeight(next.trim() !== "" || filteringItems);
            void setQuery(next);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void submitSearch();
          }}
          loading={searching}
          loadingLabel="Finding the build"
          enterKeyHint="search"
          placeholder="Search name or build ID…"
          aria-label="Search builds by name, author or build ID; Enter finds a build ID or game code of any hero"
          // Names, handles and IDs, not prose: no autocorrect or spellcheck.
          kind="identifier"
          size="sm"
          className="w-full @sm:ms-auto @sm:w-60"
        />
        <Segmented size="sm" width="hug" value={view} onValueChange={setView} aria-label="Columns">
          <SegmentedItem value="overview">Overview</SegmentedItem>
          <SegmentedItem value="combat">Combat</SegmentedItem>
          <SegmentedItem value="economy">Economy</SegmentedItem>
        </Segmented>
      </PanelHeader>
      <Table density="dense" height="scroll" aria-label={`Builds, ${view} columns`}>
        <TableHeader position="sticky">
          <TableRow>
            {/* The rank gives way first on a phone: the order already says it. */}
            <TableHead tone="muted" className={cn("w-8 text-end", HIDE_BELOW.compact)}>
              #
            </TableHead>
            <TableHead tone="muted">Build</TableHead>
            {columns.map(({ key, label, className }) => (
              <SortableHeader
                key={key}
                label={label}
                sortKey={key}
                activeSortKey={sort.sortKey}
                sortDir={sort.dir}
                align="end"
                size="sm"
                tone="muted"
                className={className}
                onSortChange={sort.toggle}
              />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody onKeyDown={navigation.onKeyDown} onPointerLeave={() => onBuildHover?.(null)}>
          {(found || problem) && (
            <TableEmptyRow colSpan={columns.length + 2} aria-live="polite">
              {found ? (
                <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                  <span>
                    Build {found.buildId}
                    {found.name && <> “{found.name}”</>}{" "}
                    {found.heroId === heroId
                      ? "is not in this list under these filters."
                      : foundHero
                        ? `is ${/^[aeiou]/i.test(foundHero.name) ? "an" : "a"} ${foundHero.name} build.`
                        : "is another hero's build."}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => showFound(found)}>
                    Show build
                  </Button>
                </span>
              ) : (
                problem
              )}
            </TableEmptyRow>
          )}
          {sorted.map((row, index) => {
            const selected = row.hero_build_id === selectedId;
            const author = row.meta ? profiles[row.meta.authorId] : undefined;
            const average = row.winRate - row.vsAverage;
            return (
              <TableRow
                key={row.hero_build_id}
                data-interactive=""
                data-state={selected ? "active" : row.hero_build_id === highlightedId ? "selected" : undefined}
                onPointerEnter={() => onBuildHover?.(row.hero_build_id)}
                onClick={(event) => {
                  onBuildIdChange(row.hero_build_id);
                  // A click on the row's cells focuses its button, so the arrow keys go on from here.
                  event.currentTarget.querySelector<HTMLElement>("[data-list-index]")?.focus({ preventScroll: true });
                }}
              >
                <TableCell className={cn("text-end text-xs text-muted-foreground tabular-nums", HIDE_BELOW.compact)}>
                  {index + 1}
                </TableCell>
                <TableRowHeader className="w-full max-w-0">
                  <div className="flex min-w-0 flex-col">
                    {/* Always the button, so every row keeps its place in the list's keyboard model; while the
                        build's name loads, a skeleton stands in for it and the ID names it. */}
                    <Button
                      variant="text"
                      size="inline"
                      aria-current={selected || undefined}
                      {...navigation.getItemProps(index)}
                      title={row.meta?.name}
                      className={cn(
                        "max-w-full justify-start text-start",
                        row.meta ? "block truncate font-medium" : !metaPending && "text-muted-foreground",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        onBuildIdChange(row.hero_build_id);
                      }}
                    >
                      {row.meta ? (
                        row.meta.name
                      ) : metaPending ? (
                        <>
                          <Skeleton className="h-5 w-40" />
                          <span className="sr-only">Build {row.hero_build_id}</span>
                        </>
                      ) : (
                        `Build ${row.hero_build_id}`
                      )}
                    </Button>
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
                </TableRowHeader>
                <TableCell className={cn("text-end tabular-nums", view !== "overview" && HIDE_BELOW.compact)}>
                  {row.matches.toLocaleString("en-US")}
                </TableCell>
                {view === "overview" && (
                  <TableCell className="hidden text-end text-muted-foreground tabular-nums @2xl/builds:table-cell">
                    {row.players.toLocaleString("en-US")}
                  </TableCell>
                )}
                {/* The number a row is read for: the rest of the row supports it. */}
                <TableCell className="text-end font-semibold tabular-nums">{formatPercent(row.winRate)}</TableCell>
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
                      {/* The bar beside the number, so the number sits on the row's line with the others. */}
                      <div className="ms-auto flex w-32 items-center justify-end gap-2 @5xl/builds:w-44">
                        <DivergingBar
                          value={row.vsAverage}
                          interval={[row.interval[0] - average, row.interval[1] - average]}
                          label={`95% range ${formatSignedPoints(row.interval[0] - average)} to ${formatSignedPoints(row.interval[1] - average)}`}
                          scale={VS_AVERAGE_SCALE}
                          tone={toneOf(verdictSign(row))}
                          className="min-w-0 flex-1"
                        />
                        <Delta
                          value={row.vsAverage}
                          unit=" pp"
                          significant={row.verdict !== "even"}
                          zero="visible"
                          className="w-16 shrink-0 justify-end"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-end text-xs tabular-nums @2xl/builds:table-cell">
                      {trendsPending ? (
                        <Skeleton className="ms-auto h-4 w-12" />
                      ) : (
                        <Delta
                          value={trends?.get(row.hero_build_id)?.change}
                          unit=" pp"
                          polarity="neutral"
                          sign="arrow"
                          zero="visible"
                          className="justify-end"
                        />
                      )}
                    </TableCell>
                    <TableCell className="hidden text-end text-xs whitespace-nowrap text-muted-foreground tabular-nums @3xl/builds:table-cell">
                      {row.meta ? day.unix(row.meta.updatedAt).utc().format("MMM D, YYYY") : ""}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
          {sorted.length === 0 && !found && !problem && (
            <TableEmptyRow colSpan={columns.length + 2}>
              {lookingUp
                ? `Looking for build ${typedId}…`
                : needle
                  ? `No build matches “${query}”`
                  : "No build lists these items"}
            </TableEmptyRow>
          )}
        </TableBody>
        {/* Also while searching or filtering: the totals stay the baseline, and the table keeps its chrome. */}
        <TableFooter position="sticky">
          <TableRow>
            <TableCell className={HIDE_BELOW.compact} />
            <TableCell className="text-xs text-muted-foreground">All builds</TableCell>
            <TableCell className={cn("text-end tabular-nums", view !== "overview" && HIDE_BELOW.compact)}>
              {summary.matches.toLocaleString("en-US")}
            </TableCell>
            {view === "overview" && <TableCell className="hidden @2xl/builds:table-cell" />}
            <TableCell className="text-end tabular-nums">{formatPercent(summary.winRate)}</TableCell>
            {metricColumns.map(({ metric, hide }) => (
              <TableCell key={metric.key} className={cn("text-end tabular-nums", hide && HIDE_BELOW[hide])}>
                <MetricValue metric={metric} totals={averagePerformance ?? undefined} pending={performancePending} />
              </TableCell>
            ))}
            {view === "overview" && (
              <>
                <TableCell className="hidden @md/builds:table-cell" />
                <TableCell className="hidden @2xl/builds:table-cell" />
                <TableCell className="hidden @3xl/builds:table-cell" />
              </>
            )}
          </TableRow>
        </TableFooter>
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
