import { useQuery } from "@tanstack/react-query";
import { EllipsisVertical, Hourglass, Link, ListPlus, Plus, Route } from "lucide-react";
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsNumberLiteral,
  parseAsString,
  parseAsStringLiteral,
  throttle,
  useQueryState,
} from "nuqs";
import { memo, startTransition, useMemo, useState } from "react";

import { HeroName } from "~/components/domain/assets/HeroName";
import { ITEM_SLOT_COLOR } from "~/components/domain/assets/item-slot-color";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import {
  BuildChoice,
  BuildChoiceHeader,
  BuildChoiceList,
  BuildBoard,
  BuildBudget,
  BuildSlot,
  BuildSlotItem,
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
import {
  BuildEconomy,
  compactSouls,
  type EconomyItem,
  gameClock,
  soulsAt,
  useSoulCurve,
} from "~/components/features/items/BuildEconomy";
import { BuildHeroChooser } from "~/components/features/items/BuildHeroChooser";
import { SavedBuildsMenu, SaveBuildButton } from "~/components/features/items/BuildSaves";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { Delta } from "~/components/ui/delta";
import { Field } from "~/components/ui/field";
import { Grid } from "~/components/ui/grid";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ProgressBar, ProgressBarSegment } from "~/components/ui/progress-bar";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import type { Dayjs } from "~/dayjs";
import { useHeroById } from "~/hooks/useAssetById";
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
import { itemStatsQueryOptions } from "~/queries/item-stats-query";

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

// A neighbouring row lights up for the pointed-at one only if at least this share of its buyers bought both.
const LINK_MIN_SHARE = 0.1;
// The best win rate build takes only items bought by at least this share of the players it follows.
const SUGGEST_MIN_SHARE = 0.15;
// Where each time phase ends, in seconds: a stage's budget is the souls earned by then (the last, open one at 45m).
const STAGE_ENDS = [540, 1200, 1800, 2700] as const;
// The shop's categories, in its order, with their colors.
const CATEGORIES = [
  { slot: "weapon", label: "Weapon", color: ITEM_SLOT_COLOR.weapon },
  { slot: "vitality", label: "Vitality", color: ITEM_SLOT_COLOR.vitality },
  { slot: "spirit", label: "Spirit", color: ITEM_SLOT_COLOR.spirit },
] as const;
// Selling refunds half an item's price.
const SELL_REFUND = 0.5;
const AT_ONCE = { limitUrlUpdates: throttle(50) };

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
  /** Its buyers' average net worth when they bought it in this stage. */
  netWorthAtBuy: number;
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
const StagePicker = memo(function StagePicker({
  stage,
  onPick,
  display = "full",
}: {
  stage: Stage;
  onPick: (key: string) => void;
  /** `full`: "All items" across the list's width. `icon`: a plus, in a stage card of the build. */
  display?: "full" | "icon";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {display === "icon" ? (
          <Button variant="ghost" size="icon-xs" aria-label={`Add item, ${stage.title}`}>
            <Plus />
          </Button>
        ) : (
          <Button variant="ghost" size="xs" className="w-full" aria-label={`All items, ${stage.title}`}>
            <ListPlus />
            All items
          </Button>
        )}
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

// The item an empty stage of the build suggests is bought by at least this share of the build's players.
const NEXT_MIN_SHARE = 0.1;

/**
 * The item an empty stage of the build suggests: the best win rate (pulled toward the build's, see SHRINK_SHARE)
 * among the items a good part of the build's players buy there, other than those in `taken` (an item is owned once).
 */
function nextPick(view: View, column: number, taken: Set<number>): Choice | undefined {
  let best: Choice | undefined;
  for (const choice of view.byKey.values()) {
    if (choice.column !== column || taken.has(choice.itemId) || choice.pickRate < NEXT_MIN_SHARE) continue;
    if (!best || choice.score > best.score) best = choice;
  }
  return best;
}

/** A picked item's price and what its buyers do with it later: "3,200 · sold 62% ~24:10". */
function saleLine(
  price: number,
  sale: { share: number | null; at: number | null } | undefined,
  component: boolean,
): string {
  const parts = [count(price)];
  if (sale?.share != null && sale.share >= 0.05) {
    parts.push(
      `${component ? "replaced" : "sold"} ${percent(sale.share, 0)}${sale.at != null ? ` ~${gameClock(sale.at)}` : ""}`,
    );
  }
  return parts.join(" · ");
}

// The swaps a picked item's menu offers, and the share of the build's players an alternative needs.
const SWAP_COUNT = 3;
const SWAP_MIN_SHARE = 0.1;

/**
 * The menu of a picked item: keep it, sell it in a later stage, swap it for another item of its stage, or take it out
 * of the build. The swaps are ranked on the build without this item (`without`, fetched while the menu is open): with
 * it, every other item's numbers would come from players who bought both.
 */
function ItemPlan({
  name,
  column,
  stages,
  isStreetBrawl,
  sellColumn,
  without,
  taken,
  onSell,
  onSwap,
  onRemove,
}: {
  name: string;
  column: number;
  stages: Stage[];
  isStreetBrawl: boolean;
  sellColumn: number | null;
  without: ReturnType<typeof itemFlowQueryOptions>;
  /** Items the build already holds: never offered as a swap. */
  taken: Set<number>;
  onSell: (column: number | null) => void;
  onSwap: (itemId: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useQuery({ ...without, enabled: open, placeholderData: undefined });
  const swaps = useMemo(() => {
    if (!data) return [];
    const games = Math.max(1, data.summary.matches);
    const reference = data.summary.matches > 0 ? data.summary.wins / data.summary.matches : 0.5;
    const shrink = Math.max(SHRINK_MIN_GAMES, data.summary.matches * SHRINK_SHARE);
    return data.nodes
      .filter((n) => n.column === column && !taken.has(n.item_id) && n.matches / games >= SWAP_MIN_SHARE)
      .map((n) => {
        const winRate = isStreetBrawl ? n.wins / Math.max(1, n.matches) : n.adjusted_win_rate;
        return { itemId: n.item_id, winRate, score: (winRate * n.matches + reference * shrink) / (n.matches + shrink) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, SWAP_COUNT);
  }, [data, column, taken, isStreetBrawl]);
  const choose = (action: () => void) => {
    action();
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Plan for ${name}`}>
          <EllipsisVertical />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={`Plan for ${name}`}
        className="flex w-72 max-w-(--radix-popover-content-available-width) flex-col gap-1 p-1"
      >
        <OptionRow selected={sellColumn == null} onClick={() => choose(() => onSell(null))}>
          Keep
        </OptionRow>
        {stages.map((stage) => (
          <OptionRow
            key={stage.column}
            selected={sellColumn === stage.column}
            onClick={() => choose(() => onSell(stage.column))}
          >
            Sell at {stageLabel(stage.column, isStreetBrawl)}
          </OptionRow>
        ))}
        <Separator />
        {isPending ? (
          <LoadingState size="sm" text="Finding swaps…" label="swaps" />
        ) : swaps.length === 0 ? (
          <EmptyState variant="inline" title="No swap" />
        ) : (
          swaps.map((swap) => (
            <OptionRow
              key={swap.itemId}
              leading={<ItemImage itemId={swap.itemId} alt="" className="size-6" />}
              trailing={<span className="text-xs tabular-nums">{percent(swap.winRate)}</span>}
              onClick={() => choose(() => onSwap(swap.itemId))}
            >
              Swap for <ItemName itemId={swap.itemId} />
            </OptionRow>
          ))
        )}
        <Separator />
        <OptionRow onClick={() => choose(onRemove)}>Remove</OptionRow>
      </PopoverContent>
    </Popover>
  );
}

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
  // Planned sales: `${column}:${itemId}:${sellColumn}`, the stage a picked item is sold in.
  const [storedSells, setSells] = useQueryState("build_sell", parseAsArrayOf(parseAsString).withDefault([]));
  // The page's hero filter, set when a saved build of another hero is opened.
  const [, setHero] = useQueryState("hero", parseAsInteger);
  const { hero } = useHeroById(heroId ?? -1);
  const [pointed, setPointed] = useState<string | null>(null);
  // The stage a narrow screen shows (index into the stages); a wide one shows every stage.
  const [shownStage, setShownStage] = useState(0);

  const isStreetBrawl = gameMode === "street_brawl";
  const columnCount = isStreetBrawl ? STREET_BRAWL_ROUNDS : PHASE_COUNT;
  // A pick from the other mode's stages (Street Brawl round 7 in a four-phase normal game) is not this mode's to send.
  const path = useMemo(
    () => storedPath.filter((key) => /^\d+:\d+$/.test(key) && parseKey(key).column < columnCount),
    [storedPath, columnCount],
  );
  const pathSet = useMemo(() => new Set(path), [path]);
  // A change of the build re-renders every stage in a transition, so the press paints first (312 ms on a 4x-throttled
  // phone before). The URL update is throttled rather than debounced, which would hold the value outside the
  // transition (see ItemsPage).
  const changePath = (update: string[] | null | ((prev: string[]) => string[] | null)) =>
    startTransition(() => void setPath(update, AT_ONCE));
  const planSale = (key: string, sellColumn: number | null) =>
    startTransition(
      () =>
        void setSells(
          (prev) => [
            ...prev.filter((entry) => !entry.startsWith(`${key}:`)),
            ...(sellColumn != null ? [`${key}:${sellColumn}`] : []),
          ],
          AT_ONCE,
        ),
    );
  const toggle = (key: string) => {
    // A removed item takes its sale plan with it, so picking it again starts without one.
    if (pathSet.has(key)) planSale(key, null);
    changePath((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  // The stage each picked item is sold in; a plan for an item no longer picked, or for a stage not after its own, is
  // dropped.
  const sellOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of storedSells) {
      const [column, itemId, sellColumn] = entry.split(":").map(Number);
      const key = `${column}:${itemId}`;
      if (pathSet.has(key) && sellColumn > column && sellColumn < columnCount) map.set(key, sellColumn);
    }
    return map;
  }, [storedSells, pathSet, columnCount]);

  const { minUnixTimestamp, maxUnixTimestamp } = useNormalizedTimeRange(minDate, maxDate);
  // The build flow answer for a build path, with the page's filters.
  const flowQuery = (keys: string[]) =>
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
      lockedItemIds: keys.map((key) => parseKey(key).itemId),
      lockedColumns: keys.map((key) => parseKey(key).column),
    });
  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useQuery(flowQuery(path));
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
  const slotOf = useMemo(
    () => new Map((upgrades ?? []).map((item) => [item.id, item.item_slot_type ?? undefined])),
    [upgrades],
  );
  // Items another item is built from: their sales count the purchases merged into that upgrade as well.
  const isComponent = useMemo(() => {
    const classNames = new Set((upgrades ?? []).flatMap((item) => item.component_items ?? []));
    return new Set((upgrades ?? []).filter((item) => classNames.has(item.class_name)).map((item) => item.id));
  }, [upgrades]);
  // How often and when the hero's players sell each item, and the souls they have earned over the game (the economy
  // panel reads the same two answers).
  const economyFilters = {
    heroId,
    gameMode,
    matchMode,
    minRankId,
    maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
  };
  const { data: itemStats } = useQuery(
    itemStatsQueryOptions({
      heroIds: heroId != null ? String(heroId) : undefined,
      gameMode,
      matchMode,
      minAverageBadge: minRankId,
      maxAverageBadge: maxRankId,
      minUnixTimestamp: minUnixTimestamp ?? 0,
      maxUnixTimestamp,
    }),
  );
  const salesOf = useMemo(
    () =>
      new Map(
        (itemStats ?? []).map((row) => [
          row.item_id,
          {
            share: row.sold != null && row.matches > 0 ? row.sold / row.matches : null,
            at: row.avg_sell_time_s > 0 ? row.avg_sell_time_s : null,
          },
        ]),
      ),
    [itemStats],
  );
  const { points: soulCurve } = useSoulCurve(economyFilters);

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
      // Once the build holds all of one, it has nothing to add (and would only repeat the picks).
    ].filter((s) => s.path.length > 1 && s.path.some((c) => !c.selected));
  }, [view]);

  // The build the economy panel prices: the reader's picks, or the most common build before there are any.
  const economyItems = useMemo((): EconomyItem[] => {
    if (path.length > 0) {
      return path.map((key) => {
        const { column, itemId } = parseKey(key);
        return {
          key,
          itemId,
          column,
          cost: costOf.get(itemId) ?? 0,
          netWorthAtBuy: view?.byKey.get(key)?.netWorthAtBuy ?? null,
          sellColumn: sellOf.get(key) ?? null,
        };
      });
    }
    if (!view) return [];
    return suggestPath(view, "common").map((c) => ({
      key: c.key,
      itemId: c.itemId,
      column: c.column,
      cost: costOf.get(c.itemId) ?? 0,
      netWorthAtBuy: c.netWorthAtBuy,
      sellColumn: null,
    }));
  }, [path, view, costOf, sellOf]);

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
  const categoryCost = new Map<string, number>();
  for (const key of path) {
    const { itemId } = parseKey(key);
    const slot = slotOf.get(itemId);
    if (slot) categoryCost.set(slot, (categoryCost.get(slot) ?? 0) + (costOf.get(itemId) ?? 0));
  }
  const duration = Math.round(summary.avg_duration_s);
  // Without a build the win rate is read against 50%. With one, against all games, colored only when its 95% interval
  // clears them; the ± beside the change says how sure it is (115 games at 80.9% are +30 points, but ±7).
  const buildTone: Tone =
    path.length === 0
      ? // Compare the printed tenth of a percent, so 49.99% shows as an even 50.0%, not a red one.
        toneOf(Math.round(winRate * 1000), 500)
      : wrLow > baseWinRate
        ? "positive"
        : wrHigh < baseWinRate
          ? "negative"
          : "muted";
  // Per stage what the build has spent by its end (purchases, less the refunds of its sales) and what the hero's players
  // have earned by then. Street Brawl rounds reset their souls, so they have no such budget.
  const budgets =
    soulCurve && !isStreetBrawl
      ? view.stages.map((stage) => {
          let spent = 0;
          for (const key of path) {
            const { column, itemId } = parseKey(key);
            const price = costOf.get(itemId) ?? 0;
            if (column <= stage.column) spent += price;
            const sold = sellOf.get(key);
            if (sold != null && sold <= stage.column) spent -= price * SELL_REFUND;
          }
          return {
            spent,
            available: soulsAt(soulCurve, STAGE_ENDS[stage.column] ?? STAGE_ENDS[STAGE_ENDS.length - 1]),
          };
        })
      : null;
  const heldItems = new Set(path.map((key) => parseKey(key).itemId));
  // What each pick adds: the build's players who took it against those who, all else the same, did not. Read from
  // `leave_one_out`, which an API before it lacks. Colored only when the gap clears its 95% margin.
  const leaveOneOut = (
    data as typeof data & {
      leave_one_out?: { item_id: number; column: number; wins: number; matches: number }[];
    }
  ).leave_one_out;
  const impactOf = new Map<string, { delta: number; sure: boolean }>();
  for (const entry of leaveOneOut ?? []) {
    const otherWins = entry.wins - summary.wins;
    const otherMatches = entry.matches - summary.matches;
    if (summary.matches === 0 || otherMatches <= 0) continue;
    const pWith = summary.wins / summary.matches;
    const pWithout = otherWins / otherMatches;
    const se = Math.sqrt((pWith * (1 - pWith)) / summary.matches + (pWithout * (1 - pWithout)) / otherMatches);
    impactOf.set(`${entry.column}:${entry.item_id}`, {
      delta: pWith - pWithout,
      sure: Math.abs(pWith - pWithout) > 1.96 * se,
    });
  }
  // What each empty stage suggests: never an item the build holds or an earlier stage already suggests.
  const nextPicks = new Map<number, Choice>();
  const taken = new Set(path.map((key) => parseKey(key).itemId));
  for (const stage of view.stages) {
    if (path.some((key) => parseKey(key).column === stage.column)) continue;
    const next = nextPick(view, stage.column, taken);
    if (next) {
      nextPicks.set(stage.column, next);
      taken.add(next.itemId);
    }
  }
  // A build nobody played in these filters: its numbers are not zeros but missing.
  const noGames = summary.matches === 0;
  // A Street Brawl answer can have fewer rounds than the stage that was shown.
  const shownIndex = Math.min(shownStage, view.stages.length - 1);

  return (
    <Stack gap={4}>
      {heroId == null && <BuildHeroChooser onPick={(next) => startTransition(() => void setHero(next, AT_ONCE))} />}
      <Panel>
        {/* Named for its hero, so a build over every hero's games does not pass for one hero's. */}
        <PanelHeader
          title={heroId != null ? <>Your {<HeroName heroId={heroId} />} build</> : "Your build · all heroes"}
          icon={Route}
          size="sm"
        >
          <Inline gap={1}>
            <SavedBuildsMenu
              onOpen={(build) =>
                startTransition(() => {
                  if (build.heroId !== heroId) void setHero(build.heroId, AT_ONCE);
                  void setPath(build.path.length > 0 ? build.path : null, AT_ONCE);
                  void setSells(build.sells.length > 0 ? build.sells : null, AT_ONCE);
                })
              }
            />
            {path.length > 0 && (
              <SaveBuildButton
                defaultName={`${hero?.name ?? "My"} build`}
                heroId={heroId}
                path={path}
                sells={[...sellOf].map(([key, column]) => `${key}:${column}`)}
              />
            )}
            {/* Whole builds to start from or complete the started one with; once one has nothing to add it goes. */}
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.label}
                variant="subtle"
                size="sm"
                aria-label={`${suggestion.label}: ${suggestion.path.map((c) => nameOf.get(c.itemId) ?? "Item").join(", ")}`}
                onClick={() =>
                  changePath((prev) => [
                    ...prev,
                    ...suggestion.path.filter((c) => !prev.includes(c.key)).map((c) => c.key),
                  ])
                }
              >
                {suggestion.label}
                {suggestion.path.map((choice) => (
                  <ItemImage key={choice.key} itemId={choice.itemId} className="size-5" />
                ))}
              </Button>
            ))}
            {path.length > 0 && (
              <>
                <CopyButton variant="ghost" size="xs" icon={Link} text={() => window.location.href}>
                  Copy link
                </CopyButton>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    changePath(null);
                    startTransition(() => void setSells(null, AT_ONCE));
                  }}
                >
                  Clear
                </Button>
              </>
            )}
          </Inline>
        </PanelHeader>
        <PanelBody className="@container">
          <Stack gap={3}>
            {/* While another build loads, its numbers are not known yet: the old ones would read as the new build's. */}
            <StatGroup
              variant="plain"
              size="xs"
              aria-busy={switching || undefined}
              className="grid-cols-2 gap-x-6 @md:grid-cols-4"
            >
              <Stat
                label="Win rate"
                value={switching ? <Skeleton className="h-6 w-16" /> : noGames ? null : percent(winRate)}
                tone={switching ? undefined : buildTone}
                sub={
                  switching ? (
                    <Skeleton className="h-4 w-20" />
                  ) : noGames ? undefined : path.length === 0 ? (
                    `±${((wrHigh - wrLow) * 50).toFixed(1)} pts`
                  ) : (
                    <>
                      {Math.round((winRate - baseWinRate) * 1000) === 0 ? (
                        "+0.0"
                      ) : (
                        <Delta value={(winRate - baseWinRate) * 100} format="number" />
                      )}{" "}
                      ±{((wrHigh - wrLow) * 50).toFixed(1)} vs all
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
            {/* What the build spends per shop category, always drawn so the first pick does not shift the board. */}
            <div className="flex flex-col gap-1.5">
              <ProgressBar variant="thin" max={Math.max(1, cost)} className="w-full">
                {CATEGORIES.map((category) => (
                  <ProgressBarSegment
                    key={category.slot}
                    value={categoryCost.get(category.slot) ?? 0}
                    color={category.color}
                  />
                ))}
              </ProgressBar>
              <ChartLegend>
                {CATEGORIES.map((category) => (
                  <ChartLegendItem key={category.slot} color={category.color} shape="square">
                    {category.label} {count(categoryCost.get(category.slot) ?? 0)}
                  </ChartLegendItem>
                ))}
              </ChartLegend>
            </div>
            <BuildBoard aria-label="Build by stage">
              {view.stages.map((stage, index) => {
                const held = path.filter((key) => parseKey(key).column === stage.column);
                const soldHere = path.filter((key) => sellOf.get(key) === stage.column);
                return (
                  <BuildSlot
                    key={stage.column}
                    label={stage.title}
                    meta={stageCost.get(stage.column) ? count(stageCost.get(stage.column) ?? 0) : undefined}
                    action={
                      stage.candidates.length > 0 ? (
                        <StagePicker stage={stage} onPick={toggle} display="icon" />
                      ) : undefined
                    }
                    footer={
                      budgets ? (
                        <BuildBudget
                          spent={budgets[index]?.spent ?? 0}
                          available={budgets[index]?.available ?? 0}
                          format={compactSouls}
                        />
                      ) : undefined
                    }
                  >
                    {held.map((key) => {
                      const { itemId } = parseKey(key);
                      const name = nameOf.get(itemId) ?? "Item";
                      const sale = salesOf.get(itemId);
                      const sellColumn = sellOf.get(key);
                      return (
                        <BuildSlotItem
                          key={key}
                          media={<ItemImage itemId={itemId} className="size-8" />}
                          name={<ItemName itemId={itemId} />}
                          meta={
                            <>
                              {impactOf.has(key) && (
                                <>
                                  <Delta
                                    value={(impactOf.get(key)?.delta ?? 0) * 100}
                                    format="number"
                                    unit=" pts"
                                    polarity={impactOf.get(key)?.sure ? "higher-is-better" : "neutral"}
                                  />
                                  {" · "}
                                </>
                              )}
                              {sellColumn != null
                                ? `${count(costOf.get(itemId) ?? 0)} · sold ${stageLabel(sellColumn, isStreetBrawl)}`
                                : saleLine(costOf.get(itemId) ?? 0, sale, isComponent.has(itemId))}
                            </>
                          }
                          actions={
                            <ItemPlan
                              name={name}
                              column={stage.column}
                              without={flowQuery(path.filter((k) => k !== key))}
                              taken={heldItems}
                              onSwap={(next) => {
                                planSale(key, null);
                                changePath((prev) => [...prev.filter((k) => k !== key), `${stage.column}:${next}`]);
                              }}
                              stages={view.stages.filter((s) => s.column > stage.column)}
                              isStreetBrawl={isStreetBrawl}
                              sellColumn={sellColumn ?? null}
                              onSell={(column) => planSale(key, column)}
                              onRemove={() => {
                                planSale(key, null);
                                toggle(key);
                              }}
                            />
                          }
                        />
                      );
                    })}
                    {held.length === 0 &&
                      soldHere.length === 0 &&
                      (() => {
                        const next = nextPicks.get(stage.column);
                        if (!next) return null;
                        return (
                          <BuildSlotItem
                            key={`${next.key}:next`}
                            state="suggested"
                            media={<ItemImage itemId={next.itemId} className="size-8" />}
                            name={<ItemName itemId={next.itemId} />}
                            meta={`${percent(next.winRate)} WR · ${percent(next.pickRate, 0)} buy`}
                            actions={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Add ${nameOf.get(next.itemId) ?? "item"} to ${stage.title}`}
                                onClick={() => toggle(next.key)}
                              >
                                <Plus />
                              </Button>
                            }
                          />
                        );
                      })()}
                    {soldHere.map((key) => {
                      const { itemId } = parseKey(key);
                      return (
                        <BuildSlotItem
                          key={`${key}:sold`}
                          state="sold"
                          media={<ItemImage itemId={itemId} className="size-8" />}
                          name={<ItemName itemId={itemId} />}
                          meta={`+${count((costOf.get(itemId) ?? 0) * SELL_REFUND)} back`}
                        />
                      );
                    })}
                  </BuildSlot>
                );
              })}
            </BuildBoard>
          </Stack>
        </PanelBody>
      </Panel>

      <FilterBar variant="toolbar" title="Add items" aria-label="Item list controls">
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
              <Button variant="outline" size="sm" onClick={() => changePath((prev) => prev.slice(0, -1))}>
                Remove the last item
              </Button>
            }
          />
        ) : (
          // A narrow container shows one stage at a time behind a switcher; a wide one shows them side by side.
          <Stack gap={3} className="@container">
            <div className="@2xl:hidden">
              <Segmented aria-label="Stage" value={String(shownIndex)} onValueChange={(v) => setShownStage(Number(v))}>
                {view.stages.map((stage, index) => (
                  <SegmentedItem key={stage.column} value={String(index)}>
                    {isStreetBrawl ? `R${stage.column + 1}` : stage.title}
                  </SegmentedItem>
                ))}
              </Segmented>
            </div>
            <Grid columns={{ base: 1, lg: 2, xl: 4 }} gap={4}>
              {view.stages.map((stage, index) => (
                <BuildStage
                  key={stage.column}
                  className={index === shownIndex ? undefined : "hidden @2xl:flex"}
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
                          // Only a link a good part of the pointed-at item's buyers took stands out; the rest fade.
                          const found = near ? linked.links.get(choice.key) : undefined;
                          const link = found && found.share >= LINK_MIN_SHARE ? found : undefined;
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
                                  label: `${percent(link.share)} ${after ? "next" : "before"}`,
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
                              onClick={() => {
                                // On a narrow screen a pick in the shown stage moves on to the next one, the way a
                                // build is read; a wide one shows every stage and ignores it.
                                if (!choice.selected && index === shownIndex && index + 1 < view.stages.length) {
                                  setShownStage(index + 1);
                                }
                                toggle(choice.key);
                              }}
                              onPointerEnter={() => startTransition(() => setPointed(choice.key))}
                              onPointerLeave={() => startTransition(() => setPointed(null))}
                              onFocus={() => startTransition(() => setPointed(choice.key))}
                              onBlur={() => startTransition(() => setPointed(null))}
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
          </Stack>
        )}
      </div>
      {!isStreetBrawl && economyItems.length > 0 && (
        <BuildEconomy
          title={path.length > 0 ? "Souls for your build" : "Souls for the most common build"}
          items={economyItems}
          heroId={heroId}
          gameMode={gameMode}
          matchMode={matchMode}
          minRankId={minRankId}
          maxRankId={maxRankId}
          minUnixTimestamp={minUnixTimestamp ?? 0}
          maxUnixTimestamp={maxUnixTimestamp}
        />
      )}
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
    // A picked item was bought by every game of the build, so its raw win rate is the build's own; the adjusted one
    // (reweighted by net worth at purchase) would read as a second, different win rate for the same games.
    const winRate = isStreetBrawl || path.has(key) ? raw : node.adjusted_win_rate;
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
      netWorthAtBuy: node.avg_net_worth_at_buy,
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
    // The lists offer what to add: the picks are on the build's board, not repeated here at a trivial 100% bought.
    const choices = all.filter((c) => !c.selected).slice(0, perColumn);
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
 * went on. It reads every choice of a stage, not the sorted and cut list on screen, so the sort does not change it.
 */
function suggestPath(view: View, by: "common" | "winning"): Choice[] {
  const path: Choice[] = [];
  for (const stage of view.stages) {
    const from = path.at(-1);
    const all = [...view.byKey.values()].filter((c) => c.column === stage.column);
    let next = all.filter((c) => c.selected).sort((a, b) => b.matches - a.matches)[0];
    if (!next && !from) {
      next =
        by === "common"
          ? all.sort((a, b) => b.matches - a.matches)[0]
          : all.filter((c) => c.pickRate >= SUGGEST_MIN_SHARE).sort((a, b) => b.score - a.score)[0];
    } else if (!next && from) {
      let best = Number.NEGATIVE_INFINITY;
      for (const [key, link] of view.links.get(from.key) ?? []) {
        const choice = view.byKey.get(key);
        if (!choice || choice.column !== stage.column) continue;
        // The winning build only takes a step a good part of the previous item's buyers took: a chain of rare steps
        // ends on a hundred games that won 80%.
        if (by === "winning" && link.matches < from.matches * SUGGEST_MIN_SHARE) continue;
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
