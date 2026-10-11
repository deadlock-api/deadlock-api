import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Hourglass, ListPlus, Route } from "lucide-react";
import { parseAsArrayOf, parseAsNumberLiteral, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Fragment, memo, useMemo, useState } from "react";

import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import {
  BuildChoice,
  BuildChoiceHeader,
  BuildChoiceList,
  BuildPath,
  BuildPathItem,
  BuildPathStep,
  BuildStage,
} from "~/components/domain/graph/BuildFlow";
import {
  ItemGrid,
  ItemGridSearch,
  ItemGridTier,
  ItemGridTile,
  ItemSlotTabs,
} from "~/components/domain/selectors/ItemGrid";
import { useItemPicker } from "~/components/domain/selectors/useItemPicker";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { Field } from "~/components/ui/field";
import { Grid } from "~/components/ui/grid";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import type { Dayjs } from "~/dayjs";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { TONE_TEXT, toneOf, type Tone } from "~/lib/tone";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemPricePerTierQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import {
  ITEM_FLOW_DEFAULT_PER_COLUMN,
  ITEM_FLOW_PER_COLUMN_OPTIONS,
  itemFlowQueryOptions,
  type ItemFlowStats,
} from "~/queries/item-flow-query";

const PHASE_INTERVAL_S = 600;
const PHASE_COUNT = 4;
// Street brawl stages are rounds rather than time phases.
const STREET_BRAWL_ROUNDS = 8;
// Must match TIME_PHASE_BOUNDARIES on the API (0-9m, 9-20m, 20-30m, 30m+).
const TIME_PHASE_LABELS = ["0–9m", "9–20m", "20–30m", "30m+"] as const;
// Where the win rate bar under each choice reaches its end, in points from the build's own win rate.
const CHANGE_SCALE = 10;
// Below this share of games reaching a stage, its header marks the stage as one of long games.
const LATE_REACH = 0.8;
// The win rate sort counts every choice as if it also had 2% of the build's games (at least 100) at the build's own win
// rate: 26 wins of 30 games (a T4 bought by players already far ahead) then ranks below 62% from thousands.
const SHRINK_SHARE = 0.02;
const SHRINK_MIN_GAMES = 100;

const SORT_OPTIONS = [
  { value: "pickrate", label: "Most bought" },
  { value: "winrate", label: "Win rate" },
] as const;

function stageLabel(column: number, isStreetBrawl: boolean): string {
  if (isStreetBrawl) return `Round ${column + 1}`;
  return TIME_PHASE_LABELS[column] ?? `Stage ${column + 1}`;
}

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const count = (value: number) => value.toLocaleString("en-US");

/** A build path entry in the URL: `${column}:${itemId}`. */
function parseKey(key: string): { column: number; itemId: number } {
  const [column, itemId] = key.split(":").map(Number);
  return { column, itemId };
}

interface BuildFlowExplorerProps {
  heroId: number | null;
  minRankId?: number;
  maxRankId?: number;
  minDate?: Dayjs;
  maxDate?: Dayjs;
  minMatches?: number | null;
  gameMode?: GameMode;
  matchMode?: MatchMode;
}

interface Choice {
  key: string;
  column: number;
  itemId: number;
  matches: number;
  wins: number;
  /** The headline: net-worth adjusted in normal games, raw in Street Brawl. */
  winRate: number;
  /** The 95% interval of `winRate`: the raw Wilson interval moved by the adjustment. */
  interval: readonly [number, number];
  /** `winRate` pulled toward the build's own by a share of its games: what the win rate sort ranks by. */
  score: number;
  tone: Tone;
  /** Share of the build's games that bought it in this stage. */
  pickRate: number;
  /** `pickRate` against the stage's most bought choice, for the bar. */
  pickShare: number;
  selected: boolean;
}

interface Stage {
  column: number;
  title: string;
  /** Share of all games that bought anything in the stage. */
  reached: number;
  choices: Choice[];
  /** Every item of the stage that is not in the build, for the full picker. */
  candidates: { id: number; winRate: number; pickRate: number }[];
}

interface Link {
  matches: number;
  /** Share of the source choice's buyers that went on to buy the target. */
  share: number;
}

/** The stage's items as a single-choice item picker: slot tabs, tiers, and each item's win rate under its name. */
function StagePickerBody({
  candidates,
  onPick,
}: {
  candidates: Stage["candidates"];
  onPick: (itemId: number) => void;
}) {
  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
  const items = useMemo(() => {
    const byId = new Map((upgrades ?? []).map((item) => [item.id, item]));
    return candidates.flatMap((c) => byId.get(c.id) ?? []);
  }, [upgrades, candidates]);
  const stats = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const picker = useItemPicker({
    items,
    value: null,
    onValueChange: (itemId) => {
      if (itemId !== null) onPick(itemId);
    },
    // Few enough items that every slot fits one list, by tier, the most bought first.
    defaultSlot: "all",
  });
  return (
    <>
      <div className="p-2">
        <ItemGridSearch picker={picker} />
      </div>
      <Separator />
      <ItemSlotTabs picker={picker}>
        <ItemGrid picker={picker} aria-label="Items bought at this stage">
          {picker.groups.map((group) => (
            <ItemGridTier key={group.tier} tier={group.tier} cost={group.cost}>
              {group.items.map((item) => {
                const c = stats.get(item.id);
                return (
                  <ItemGridTile
                    key={item.id}
                    item={item}
                    title={
                      c ? `${item.name}: ${percent(c.winRate)} win rate, ${percent(c.pickRate)} bought` : undefined
                    }
                  >
                    {c && <span className={TONE_TEXT[toneOf(c.winRate, 0.5)]}>{percent(c.winRate)} WR</span>}
                  </ItemGridTile>
                );
              })}
            </ItemGridTier>
          ))}
        </ItemGrid>
      </ItemSlotTabs>
    </>
  );
}

/**
 * "All items" under a stage's list: every item bought there, to add one that is not in the top rows. No count: the
 * server's trimmed answer holds only the shown rows, so it would print 8 and then jump to the real number.
 */
const StagePicker = memo(function StagePicker({ stage, onPick }: { stage: Stage; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="w-full" aria-label={`All items, ${stage.title}`}>
          <ListPlus />
          All items
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        aria-label={`All items, ${stage.title}`}
        className="w-96 max-w-(--radix-popover-content-available-width) p-0"
      >
        <StagePickerBody
          candidates={stage.candidates}
          onPick={(itemId) => {
            onPick(`${stage.column}:${itemId}`);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
});

export function BuildFlowExplorer({
  heroId,
  minRankId,
  maxRankId,
  minDate,
  maxDate,
  minMatches,
  gameMode,
  matchMode,
}: BuildFlowExplorerProps) {
  // View controls persisted in the URL (shareable), prefixed `flow_` to avoid clashing with the page's other filters.
  const [perColumn, setPerColumn] = useQueryState(
    "flow_top",
    parseAsNumberLiteral(ITEM_FLOW_PER_COLUMN_OPTIONS).withDefault(ITEM_FLOW_DEFAULT_PER_COLUMN),
  );
  // `winrate_adj` is the old name of the win rate sort, still in shared links.
  const [storedSort, setSortBy] = useQueryState(
    "flow_sort",
    parseAsStringLiteral(["pickrate", "winrate", "winrate_adj"] as const).withDefault("pickrate"),
  );
  const sortBy = storedSort === "pickrate" ? "pickrate" : "winrate";
  // The build, scoped to a stage: `${column}:${itemId}`. In the URL so a build can be shared as a link.
  const [storedPath, setPath] = useQueryState("build_path", parseAsArrayOf(parseAsString).withDefault([]));
  const [pointed, setPointed] = useState<string | null>(null);

  const isStreetBrawl = gameMode === "street_brawl";
  const columnCount = isStreetBrawl ? STREET_BRAWL_ROUNDS : PHASE_COUNT;
  // A pick from the other mode's stages (Street Brawl round 7 in a four-phase normal game) is not this mode's to send.
  const path = useMemo(
    () => storedPath.filter((key) => /^\d+:\d+$/.test(key) && parseKey(key).column < columnCount),
    [storedPath, columnCount],
  );
  const pathSet = useMemo(() => new Set(path), [path]);
  const toggle = (key: string) =>
    void setPath((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useQuery(
    itemFlowQueryOptions({
      heroIds: heroId != null ? String(heroId) : undefined,
      gameMode,
      matchMode,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
      minMatches: minMatches ?? undefined,
      phaseIntervalS: PHASE_INTERVAL_S,
      phaseCount: columnCount,
      lockedItemIds: path.map((key) => parseKey(key).itemId),
      lockedColumns: path.map((key) => parseKey(key).column),
    }),
  );
  const { data: upgrades } = useQuery(itemUpgradesQueryOptions);
  const { data: pricePerTier } = useQuery(itemPricePerTierQueryOptions);
  // The shop price of the item's tier, from the generic data; the item's own cost until that list is loaded.
  const costOf = useMemo(
    () =>
      new Map(
        (upgrades ?? []).map((item) => [item.id, pricePerTier?.[item.item_tier ?? 0] || (item.cost ?? 0)] as const),
      ),
    [upgrades, pricePerTier],
  );
  const nameOf = useMemo(() => new Map((upgrades ?? []).map((item) => [item.id, item.name ?? "Item"])), [upgrades]);

  const view = useMemo(
    () => (data ? buildView(data, { path: pathSet, columnCount, perColumn, sortBy, isStreetBrawl }) : null),
    [data, pathSet, columnCount, perColumn, sortBy, isStreetBrawl],
  );

  // What the pointed-at choice links to in the stages on either side of it, and how strongly.
  const linked = useMemo(() => {
    if (!pointed || !view) return null;
    const source = view.byKey.get(pointed);
    if (!source) return null;
    const links = new Map<string, Link>();
    for (const [key, link] of view.links.get(pointed) ?? []) {
      links.set(key, { matches: link.matches, share: link.matches / Math.max(1, source.matches) });
    }
    return { column: source.column, links };
  }, [pointed, view]);

  // Whole builds to start from, or to complete the started one with: they keep the reader's picks.
  const suggestions = useMemo(() => {
    if (!view) return [];
    return [
      { label: "Most common", path: suggestPath(view, "common") },
      { label: "Best win rate", path: suggestPath(view, "winning") },
    ].filter((s) => s.path.length > 1 && s.path.some((c) => !c.selected));
  }, [view]);

  // Dim the stages only while another build's answer loads; a refresh of the shown one keeps them as they are.
  const switching = isFetching && isPlaceholderData;

  if (isLoading) return <LoadingState label="build flow" align="center" />;
  if (isError && !data) {
    return <ErrorState title="The build flow did not load" retrying={isFetching} onRetry={() => void refetch()} />;
  }
  if (!data || !view) return null;

  const { summary, baseline } = data;
  const winRate = summary.matches > 0 ? summary.wins / summary.matches : 0;
  const baseWinRate = baseline.matches > 0 ? baseline.wins / baseline.matches : 0;
  const [wrLow, wrHigh] = wilsonScoreInterval(summary.wins, summary.matches);
  // What the build's picks cost, per stage and in all.
  const stageCost = new Map<number, number>();
  for (const key of path) {
    const { column, itemId } = parseKey(key);
    stageCost.set(column, (stageCost.get(column) ?? 0) + (costOf.get(itemId) ?? 0));
  }
  const cost = [...stageCost.values()].reduce((sum, n) => sum + n, 0);
  const duration = Math.round(summary.avg_duration_s);
  // A build nobody played in these filters: its numbers are not zeros but missing.
  const noGames = summary.matches === 0;

  return (
    <Stack gap={4}>
      <Panel>
        <PanelHeader title="Your build" icon={Route} size="sm">
          {path.length > 0 && (
            <Button variant="ghost" size="xs" onClick={() => void setPath(null)}>
              Clear
            </Button>
          )}
        </PanelHeader>
        <PanelBody className="@container">
          <div className="grid items-center gap-4 @4xl:grid-cols-[minmax(0,1fr)_auto]">
            <Stack gap={2}>
              <BuildPath aria-label="Build path">
                {view.stages.map((stage) => (
                  <BuildPathStep
                    key={stage.column}
                    label={stage.title}
                    meta={stageCost.get(stage.column) ? count(stageCost.get(stage.column) ?? 0) : undefined}
                  >
                    {path
                      .filter((key) => parseKey(key).column === stage.column)
                      .map((key) => {
                        const { itemId } = parseKey(key);
                        return (
                          <BuildPathItem
                            key={key}
                            media={<ItemImage itemId={itemId} className="size-8" />}
                            aria-label={`Remove ${nameOf.get(itemId) ?? "item"} from ${stage.title}`}
                            onClick={() => toggle(key)}
                          />
                        );
                      })}
                  </BuildPathStep>
                ))}
              </BuildPath>
              {suggestions.length > 0 && (
                <Inline gap={2}>
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion.label}
                      variant="subtle"
                      size="sm"
                      aria-label={`${suggestion.label}: ${suggestion.path.map((c) => nameOf.get(c.itemId) ?? "Item").join(", ")}`}
                      onClick={() =>
                        void setPath((prev) => [
                          ...prev,
                          ...suggestion.path.filter((c) => !prev.includes(c.key)).map((c) => c.key),
                        ])
                      }
                    >
                      {suggestion.label}
                      {suggestion.path.map((choice, index) => (
                        <Fragment key={choice.key}>
                          {index > 0 && <ChevronRight className="size-3" />}
                          <ItemImage itemId={choice.itemId} className="size-5" />
                        </Fragment>
                      ))}
                    </Button>
                  ))}
                </Inline>
              )}
            </Stack>
            {/* While another build loads, its numbers are not known yet: the old ones would read as the new build's. */}
            <StatGroup
              variant="plain"
              size="xs"
              aria-busy={switching || undefined}
              className="grid-cols-2 gap-x-6 @md:grid-cols-4 @4xl:grid-cols-2"
            >
              <Stat
                label="Win rate"
                value={switching ? <Skeleton className="h-6 w-16" /> : noGames ? null : percent(winRate)}
                // Compare the printed tenth of a percent, so 49.99% shows as an even 50.0%, not a red one.
                tone={switching ? undefined : toneOf(Math.round(winRate * 1000), 500)}
                sub={
                  switching ? (
                    <Skeleton className="h-4 w-20" />
                  ) : noGames ? undefined : path.length === 0 ? (
                    `±${((wrHigh - wrLow) * 50).toFixed(1)} pts`
                  ) : Math.round((winRate - baseWinRate) * 1000) === 0 ? (
                    "+0.0 pts vs all"
                  ) : (
                    <>
                      <Delta value={(winRate - baseWinRate) * 100} format="number" unit=" pts" /> vs all
                    </>
                  )
                }
              />
              <Stat
                label="Games"
                value={switching ? <Skeleton className="h-6 w-16" /> : count(summary.matches)}
                sub={
                  path.length === 0 ? undefined : switching ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    `${percent(summary.matches / Math.max(1, baseline.matches))} of all`
                  )
                }
              />
              <Stat
                label="Game length"
                value={
                  switching ? (
                    <Skeleton className="h-6 w-12" />
                  ) : noGames ? null : (
                    `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
                  )
                }
              />
              {/* The cost is the picked items' own, known before the build's games load. */}
              <Stat
                label={path.length > 0 ? "Build cost" : "Avg KDA"}
                value={
                  path.length > 0 ? (
                    count(cost)
                  ) : switching ? (
                    <Skeleton className="h-6 w-20" />
                  ) : (
                    [summary.total_kills, summary.total_deaths, summary.total_assists]
                      .map((n) => (n / Math.max(1, summary.matches)).toFixed(1))
                      .join(" / ")
                  )
                }
              />
            </StatGroup>
          </div>
        </PanelBody>
      </Panel>

      <FilterBar variant="toolbar" title="Items by stage" aria-label="Build flow controls">
        <Field label="Sort" orientation="horizontal">
          <Segmented value={sortBy} onValueChange={setSortBy} width="hug">
            {SORT_OPTIONS.map((option) => (
              <SegmentedItem key={option.value} value={option.value}>
                {option.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
        <Field label="Show" orientation="horizontal">
          <Segmented
            value={String(perColumn)}
            onValueChange={(v) => setPerColumn(Number(v) as (typeof ITEM_FLOW_PER_COLUMN_OPTIONS)[number])}
            width="hug"
          >
            {ITEM_FLOW_PER_COLUMN_OPTIONS.map((n) => (
              <SegmentedItem key={n} value={String(n)}>
                {n}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
      </FilterBar>

      <div className="relative">
        {switching && (
          <LoadingState
            label="build flow"
            className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-24"
          />
        )}
        {noGames && !switching ? (
          <EmptyState
            title="No games with this build"
            action={
              <Button variant="outline" size="sm" onClick={() => void setPath((prev) => prev.slice(0, -1))}>
                Remove the last item
              </Button>
            }
          />
        ) : (
          <Grid columns={{ base: 1, sm: 2, xl: 4 }} gap={4}>
            {view.stages.map((stage) => (
              <BuildStage
                key={stage.column}
                title={stage.title}
                meta={
                  // A stage most games never reach (30m+) shows long games only, whose win rates run high.
                  stage.reached < LATE_REACH ? (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Hourglass className="size-3" aria-hidden="true" />
                      {percent(stage.reached, 0)} of games
                    </span>
                  ) : (
                    `${percent(stage.reached, 0)} of games`
                  )
                }
                aria-busy={switching || undefined}
              >
                {stage.choices.length === 0 ? (
                  <EmptyState variant="inline" title="No purchases" />
                ) : (
                  <>
                    <BuildChoiceHeader start="Item · bought · cost" end="Win rate" />
                    <BuildChoiceList aria-label={`Items bought at ${stage.title}`}>
                      {stage.choices.map((choice) => {
                        const near = linked != null && Math.abs(linked.column - choice.column) === 1;
                        const link = near ? linked.links.get(choice.key) : undefined;
                        const after = linked != null && choice.column > linked.column;
                        return (
                          <BuildChoice
                            key={choice.key}
                            media={<ItemImage itemId={choice.itemId} className="size-8" />}
                            name={<ItemName itemId={choice.itemId} className="line-clamp-2 whitespace-normal" />}
                            share={choice.pickShare}
                            meta={percent(choice.pickRate)}
                            price={costOf.get(choice.itemId) ? count(costOf.get(choice.itemId) ?? 0) : undefined}
                            link={
                              link && {
                                // Of the pointed-at item's buyers: bought this one in the stage after it, or before.
                                label: `${percent(link.share, 0)} ${after ? "next" : "before"}`,
                                share: link.share,
                              }
                            }
                            value={percent(choice.winRate)}
                            tone={choice.tone}
                            change={{
                              value: (choice.winRate - winRate) * 100,
                              scale: CHANGE_SCALE,
                              interval: [(choice.interval[0] - winRate) * 100, (choice.interval[1] - winRate) * 100],
                            }}
                            selected={choice.selected}
                            aria-label={`${nameOf.get(choice.itemId) ?? "Item"}: bought ${percent(choice.pickRate)}, win rate ${percent(choice.winRate)}`}
                            relation={!near ? "none" : link ? "linked" : "unlinked"}
                            onClick={() => toggle(choice.key)}
                            onPointerEnter={() => setPointed(choice.key)}
                            onPointerLeave={() => setPointed(null)}
                            onFocus={() => setPointed(choice.key)}
                            onBlur={() => setPointed(null)}
                          />
                        );
                      })}
                    </BuildChoiceList>
                  </>
                )}
                {stage.candidates.length > 0 && <StagePicker stage={stage} onPick={toggle} />}
              </BuildStage>
            ))}
          </Grid>
        )}
      </div>
    </Stack>
  );
}

interface View {
  stages: Stage[];
  byKey: Map<string, Choice>;
  /** Per choice, the choices in the neighbouring stages bought by the same players, both ways. */
  links: Map<string, Map<string, { matches: number; wins: number }>>;
  /** Each choice's win rate pulled toward the build's own, for ranking: see SHRINK_SHARE. */
  shrink: (wins: number, matches: number) => number;
}

function buildView(
  data: ItemFlowStats,
  {
    path,
    columnCount,
    perColumn,
    sortBy,
    isStreetBrawl,
  }: {
    path: Set<string>;
    columnCount: number;
    perColumn: number;
    sortBy: "pickrate" | "winrate";
    isStreetBrawl: boolean;
  },
): View {
  const population = Math.max(1, data.summary.matches);
  const reference = data.summary.matches > 0 ? data.summary.wins / data.summary.matches : 0.5;
  const allGames = Math.max(1, data.baseline.matches);
  const shrink = Math.max(SHRINK_MIN_GAMES, data.summary.matches * SHRINK_SHARE);

  const toChoice = (node: ItemFlowStats["nodes"][number]): Choice => {
    const key = `${node.column}:${node.item_id}`;
    const raw = node.matches > 0 ? node.wins / node.matches : 0;
    const winRate = isStreetBrawl ? raw : node.adjusted_win_rate;
    const [low, high] = wilsonScoreInterval(node.wins, node.matches);
    const interval = [low + winRate - raw, high + winRate - raw] as const;
    // Colored only when the interval clears the build's own win rate: a choice that may well be even stays neutral.
    const tone: Tone = interval[0] > reference ? "positive" : interval[1] < reference ? "negative" : "muted";
    return {
      key,
      column: node.column,
      itemId: node.item_id,
      matches: node.matches,
      wins: node.wins,
      winRate,
      interval,
      score: (winRate * node.matches + reference * shrink) / (node.matches + shrink),
      tone,
      pickRate: node.matches / population,
      pickShare: 0,
      selected: path.has(key),
    };
  };

  const byColumn = new Map<number, Choice[]>();
  const byKey = new Map<string, Choice>();
  for (const node of data.nodes) {
    if (node.column >= columnCount) continue;
    const choice = toChoice(node);
    byKey.set(choice.key, choice);
    const list = byColumn.get(node.column);
    if (list) list.push(choice);
    else byColumn.set(node.column, [choice]);
  }

  const compare =
    sortBy === "winrate"
      ? (a: Choice, b: Choice) => b.score - a.score
      : (a: Choice, b: Choice) => b.matches - a.matches;

  // Street Brawl rounds past the last one anybody reached are left out; the four time phases always show.
  const lastColumn = isStreetBrawl
    ? Math.max(0, ...byColumn.keys(), ...[...path].map((key) => parseKey(key).column))
    : columnCount - 1;
  const stages: Stage[] = [];
  for (let column = 0; column <= lastColumn; column++) {
    const all = (byColumn.get(column) ?? []).slice().sort(compare);
    const chosen = all.filter((c) => c.selected);
    const choices = [...chosen, ...all.filter((c) => !c.selected).slice(0, perColumn)];
    const top = Math.max(0, ...choices.map((c) => c.pickRate));
    for (const c of choices) c.pickShare = top > 0 ? c.pickRate / top : 0;
    stages.push({
      column,
      title: stageLabel(column, isStreetBrawl),
      reached: (data.reached_per_column[column] ?? 0) / allGames,
      choices,
      candidates: all
        .filter((c) => !c.selected)
        .sort((a, b) => b.matches - a.matches)
        .map((c) => ({ id: c.itemId, winRate: c.winRate, pickRate: c.pickRate })),
    });
  }

  const links = new Map<string, Map<string, { matches: number; wins: number }>>();
  const addLink = (from: string, to: string, link: { matches: number; wins: number }) => {
    const map = links.get(from);
    if (map) map.set(to, link);
    else links.set(from, new Map([[to, link]]));
  };
  for (const edge of data.edges) {
    const from = `${edge.from_column}:${edge.from_item_id}`;
    const to = `${edge.from_column + 1}:${edge.to_item_id}`;
    const link = { matches: edge.matches, wins: edge.wins };
    addLink(from, to, link);
    addLink(to, from, link);
  }

  return {
    stages,
    byKey,
    links,
    shrink: (wins, matches) => (wins + reference * shrink) / (matches + shrink),
  };
}

/**
 * A whole build, one item per stage, followed through the links: the most bought first item and then, stage by stage,
 * what its buyers bought most next (`common`), or the same by win rate pulled toward the build's (`winning`). A stage
 * with a pick of the reader's keeps it, so a started build is completed rather than replaced. Ends early where nobody
 * went on.
 */
function suggestPath(view: View, by: "common" | "winning"): Choice[] {
  const path: Choice[] = [];
  for (const stage of view.stages) {
    const from = path.at(-1);
    const picked = stage.choices.filter((c) => c.selected).sort((a, b) => b.matches - a.matches)[0];
    let next: Choice | undefined = picked;
    if (!next && !from) {
      next = [...stage.choices].sort((a, b) => (by === "common" ? b.matches - a.matches : b.score - a.score))[0];
    } else if (!next && from) {
      let best = Number.NEGATIVE_INFINITY;
      for (const [key, link] of view.links.get(from.key) ?? []) {
        const choice = view.byKey.get(key);
        if (!choice || choice.column !== stage.column) continue;
        const rank = by === "common" ? link.matches : view.shrink(link.wins, link.matches);
        if (rank > best) {
          best = rank;
          next = choice;
        }
      }
    }
    if (!next) break;
    path.push(next);
  }
  return path;
}
