import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Hourglass, Link, Plus, Route, TriangleAlert } from "lucide-react";
import { parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringLiteral, throttle, useQueryState } from "nuqs";
import { memo, startTransition, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
import { useHeroSkillPath } from "~/components/domain/graph/HeroSkillOrder";
import {
  ItemGrid,
  ItemGridSearch,
  ItemGridTier,
  ItemGridTile,
  ItemSlotTabs,
} from "~/components/domain/selectors/ItemGrid";
import { useItemPicker } from "~/components/domain/selectors/useItemPicker";
import { BuildCompleter } from "~/components/features/items/BuildCompleter";
import {
  BuildEconomy,
  BuildPurchases,
  compactSouls,
  type EconomyItem,
  soulsAt,
  useBuildEconomy,
} from "~/components/features/items/BuildEconomy";
import { BuildHeroChooser } from "~/components/features/items/BuildHeroChooser";
import { SavedBuildsMenu, SaveBuildButton } from "~/components/features/items/BuildSaves";
import { BuildSkillOrder } from "~/components/features/items/BuildSkillOrder";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { Delta } from "~/components/ui/delta";
import { Field } from "~/components/ui/field";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ProgressBar, ProgressBarSegment } from "~/components/ui/progress-bar";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { SortButton } from "~/components/ui/sort-button";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import type { Dayjs } from "~/dayjs";
import { useHeroById } from "~/hooks/useAssetById";
import { useNormalizedTimeRange } from "~/hooks/useNormalizedTimeRange";
import { type BuildFocus, type BuildGoal, completeBuild } from "~/lib/build-completer";
import type { GameMode, MatchMode } from "~/lib/game-mode";
import { TONE_TEXT, toneOf, type Tone } from "~/lib/tone";
import { wilsonScoreInterval } from "~/lib/wilson";
import { itemPricePerTierQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { ITEM_FLOW_DEFAULT_PER_COLUMN, itemFlowQueryOptions, type ItemFlowStats } from "~/queries/item-flow-query";
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
// Every player starts with nine item slots and unlocks up to three flex slots over the game, at times the build sets
// (minutes, `build_flex`); these are where they start.
const BASE_SLOTS = 9;
const DEFAULT_FLEX_MINUTES = [10, 20, 30];
// An auto-completed build adds at most this many items, each bought by at least this many of the build's players.
const COMPLETE_MAX_ITEMS = 20;
const COMPLETE_MIN_GAMES = 200;
const COMPLETE_FALLBACK_GAMES = 50;
// The most items an auto-completed build holds by each stage's end (then capped by the open slots).
const COMPLETE_HELD_BY_STAGE = [4, 7, 10];
// Under this many games a build shows no win rate at all.
const MIN_RATE_GAMES = 30;
// Under this many games a build's win rate is marked as resting on few games.
const FEW_GAMES = 100;
// Selling refunds half an item's price.
const SELL_REFUND = 0.5;
const EMPTY_PATH: string[] = [];
// Items each stage's list shows, the ones the server's first answer holds.
const PER_STAGE = ITEM_FLOW_DEFAULT_PER_COLUMN;
const AT_ONCE = { limitUrlUpdates: throttle(50) };

function stageLabel(column: number, isStreetBrawl: boolean): string {
  if (isStreetBrawl) return `Round ${column + 1}`;
  return TIME_PHASE_LABELS[column] ?? `Stage ${column + 1}`;
}

/**
 * The low end of a win rate's 95% interval once `shrink` games at `reference` are added to its own: the least it may
 * be, with a small sample pulled toward the reference first. `wins` may be fractional (an adjusted rate's).
 */
function confidentRate(wins: number, matches: number, reference: number, shrink: number): number {
  return wilsonScoreInterval(wins + reference * shrink, matches + shrink)[0];
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
  /**
   * The least `score` may be: the low end of its 95% interval. A perfect record from a dozen games is pulled to the
   * build's rate before the interval is taken, so it does not outrank a good one from hundreds (12 of 12 ranks at 49%,
   * 66% of 300 at 58%). Suggestions, swaps and the confident completion rank by it.
   */
  confident: number;
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
  candidates: { id: number; winRate: number; pickRate: number; matches: number }[];
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
                    {/* Colored only from a sample that can carry it: a rate from a dozen games stays quiet. */}
                    {c && (
                      <span
                        className={c.matches >= FEW_GAMES ? TONE_TEXT[toneOf(c.winRate, 0.5)] : "text-muted-foreground"}
                      >
                        {percent(c.winRate)} WR
                      </span>
                    )}
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
 * Every item bought in a stage, to add one that is not in its list: the plus in the stage card's header (`icon`), and
 * an "Add item" row under a full list (`row`).
 */
const StagePicker = memo(function StagePicker({
  stage,
  onPick,
  display = "icon",
}: {
  stage: Stage;
  onPick: (key: string) => void;
  display?: "icon" | "row";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {display === "row" ? (
          <Button variant="ghost" size="xs" className="w-full" aria-label={`Add item, ${stage.title}`}>
            <Plus />
            Add item
          </Button>
        ) : (
          <Button variant="ghost" size="icon-xs" aria-label={`Add item, ${stage.title}`}>
            <Plus />
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
// Street Brawl spreads its purchases over more rounds, so a late round rarely has an item a tenth of players buy.
const NEXT_MIN_SHARE_BRAWL = 0.05;

/**
 * The item an empty stage of the build suggests: the best win rate by the least it may be (`Choice.confident`) among the items a good part of the build's players buy there, other than those in `taken` (an item is owned
 * once).
 */
function nextPick(view: View, column: number, taken: Set<number>, minShare = NEXT_MIN_SHARE): Choice | undefined {
  let best: Choice | undefined;
  for (const choice of view.byKey.values()) {
    if (choice.column !== column || taken.has(choice.itemId) || choice.pickRate < minShare) continue;
    if (!best || choice.confident > best.confident) best = choice;
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
    // Short enough for a quarter-width card: "sold 8% 35m", "upgraded 94% 8m".
    parts.push(
      `${component ? "upgraded" : "sold"} ${percent(sale.share, 0)}${sale.at != null ? ` ${Math.round(sale.at / 60)}m` : ""}`,
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
  moveTo,
  onMove,
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
  /** The stages it can move to, the keyboard's way of dragging it there. */
  moveTo: Stage[];
  onMove: (column: number) => void;
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
        // Raw: the players who bought it here are exactly the swapped build's, so this is the win rate it will show.
        const winRate = n.wins / Math.max(1, n.matches);
        return {
          itemId: n.item_id,
          winRate,
          games: n.matches,
          // Ranked by the least the win rate may be, as Complete build's confident pick (see `Choice.confident`): a
          // rate from a few dozen games does not outrank one from hundreds.
          score: confidentRate(n.wins, n.matches, reference, shrink),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, SWAP_COUNT);
  }, [data, column, taken]);
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
        // Beside the item rather than over it: it opens to the right of its menu button where there is room.
        side="right"
        align="start"
        aria-label={`Plan for ${name}`}
        className="flex w-72 max-w-(--radix-popover-content-available-width) flex-col gap-1 p-1"
      >
        {stages.length > 0 && (
          // When the build sells it: a single choice, kept open so the change shows (a round's number in Street
          // Brawl, whose eight rounds do not fit by name).
          <Field label={isStreetBrawl ? "Sell in round" : "Sell"} className="p-1">
            <Segmented
              size="sm"
              value={sellColumn == null ? "keep" : String(sellColumn)}
              onValueChange={(next) => onSell(next === "keep" ? null : Number(next))}
            >
              <SegmentedItem value="keep">Keep</SegmentedItem>
              {stages.map((stage) => (
                <SegmentedItem key={stage.column} value={String(stage.column)}>
                  {isStreetBrawl ? stage.column + 1 : stageLabel(stage.column, isStreetBrawl)}
                </SegmentedItem>
              ))}
            </Segmented>
          </Field>
        )}
        <Separator />
        {isPending ? (
          // Three rows' height, the swaps' own, so the menu does not jump when they land.
          <div aria-busy="true" aria-label="Finding swaps" className="flex flex-col gap-1">
            {Array.from({ length: SWAP_COUNT }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : swaps.length === 0 ? (
          <EmptyState variant="inline" title="No swap" />
        ) : (
          swaps.map((swap) => (
            <OptionRow
              key={swap.itemId}
              leading={<ItemImage itemId={swap.itemId} alt="" className="size-6" />}
              // On its own line under the name, which keeps the menu's width on a phone.
              description={`${percent(swap.winRate)} WR · ${count(swap.games)} games`}
              onClick={() => choose(() => onSwap(swap.itemId))}
            >
              Swap for <ItemName itemId={swap.itemId} />
            </OptionRow>
          ))
        )}
        <Separator />
        {/* Buttons, not a choice: a move takes the item, and this menu, to another stage's card. */}
        <div className="flex flex-wrap items-center gap-1 p-1">
          <div className="flex flex-wrap items-center gap-1">
            <span aria-hidden="true" className="pe-1 type-caption text-muted-foreground">
              Move to
            </span>
            {moveTo.map((stage) => (
              <Button
                key={stage.column}
                variant="outline"
                size="xs"
                aria-label={`Move to ${stageLabel(stage.column, isStreetBrawl)}`}
                onClick={() => choose(() => onMove(stage.column))}
              >
                {isStreetBrawl ? stage.column + 1 : stageLabel(stage.column, isStreetBrawl)}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="xs" className="ms-auto" onClick={() => choose(onRemove)}>
            Remove
          </Button>
        </div>
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
  // Items each stage lists; the rest are a search away in its picker.
  const perColumn = PER_STAGE;
  // `winrate_adj` is the old name of the win rate sort, still in shared links.
  const [storedSort, setSortBy] = useQueryState(
    "flow_sort",
    parseAsStringLiteral(["pickrate", "winrate", "winrate_adj"] as const).withDefault("pickrate"),
  );
  const sortBy = storedSort === "pickrate" ? "pickrate" : "winrate";
  // The build, scoped to a stage: `${column}:${itemId}`. In the URL so a build can be shared as a link.
  const [storedPathRaw, setPathRaw] = useQueryState("build_path", parseAsArrayOf(parseAsString).withDefault([]));
  // The mode a build was made in: its stages are that mode's (time phases or rounds), so another mode starts empty
  // rather than reading them as its own. Links from before carry none and are normal-mode builds.
  const [buildMode, setBuildMode] = useQueryState("build_mode", parseAsString);
  const modeKey = gameMode === "street_brawl" ? "street_brawl" : "normal";
  const storedPath = (buildMode ?? "normal") === modeKey ? storedPathRaw : EMPTY_PATH;
  const setPath = (
    update: string[] | null | ((prev: string[]) => string[] | null),
    options?: Parameters<typeof setPathRaw>[1],
  ) => {
    void setPathRaw(
      typeof update === "function" ? (prev) => update((buildMode ?? "normal") === modeKey ? prev : []) : update,
      options,
    );
    void setBuildMode(modeKey === "normal" ? null : modeKey, options);
  };
  // Planned sales: `${column}:${itemId}:${sellColumn}`, the stage a picked item is sold in.
  const [storedSells, setSells] = useQueryState("build_sell", parseAsArrayOf(parseAsString).withDefault([]));
  // The page's hero filter, set when a saved build of another hero is opened.
  const [, setHero] = useQueryState("hero", parseAsInteger);
  const { hero } = useHeroById(heroId ?? -1);
  const [storedFlex, setFlex] = useQueryState(
    "build_flex",
    parseAsArrayOf(parseAsInteger).withDefault(DEFAULT_FLEX_MINUTES),
  );
  // Three times in order within the plotted game; a malformed list falls back to the defaults.
  const flexMinutes = useMemo(
    () =>
      storedFlex.length === 3 && storedFlex.every((m) => Number.isFinite(m))
        ? storedFlex.map((m) => Math.min(Math.max(m, 0), 45)).sort((a, b) => a - b)
        : DEFAULT_FLEX_MINUTES,
    [storedFlex],
  );
  const [pointed, setPointed] = useState<string | null>(null);
  // The completion running, by the control that started it: "complete", or a one-press build's label.
  const [completing, setCompleting] = useState<string | null>(null);
  const boardRef = useRef<HTMLOListElement>(null);
  // The reader's skill order, ability ids by upgrade; without it the build takes its players' most common one.
  const [storedSkills, setSkills] = useQueryState("build_skills", parseAsArrayOf(parseAsInteger));
  const queryClient = useQueryClient();
  // The picked item being dragged to another stage, and the stage it is over.
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<number | null>(null);

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
    startTransition(() => setPath(update, AT_ONCE));
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
  // Moves a picked item to another stage. Its sale plan stays if the sale still comes after its new stage.
  const move = (key: string, column: number) => {
    const { itemId } = parseKey(key);
    const moved = `${column}:${itemId}`;
    if (moved === key) return;
    const sale = sellOf.get(key);
    startTransition(() => {
      void setSells(
        (prev) => [
          ...prev.filter((entry) => !entry.startsWith(`${key}:`) && !entry.startsWith(`${moved}:`)),
          ...(sale != null && sale > column ? [`${moved}:${sale}`] : []),
        ],
        AT_ONCE,
      );
      setPath((prev) => [...prev.filter((k) => k !== key && k !== moved), moved], AT_ONCE);
    });
  };

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
  // The hero's items without the build (the page's default answer, usually cached): what a stage's picker offers once
  // the build is so narrow that the stage has no purchases of its own.
  const { data: unbuilt } = useQuery({ ...flowQuery([]), enabled: path.length > 0 });
  const fallbackCandidates = useMemo(() => {
    const byColumn = new Map<number, Stage["candidates"]>();
    if (!unbuilt) return byColumn;
    const games = Math.max(1, unbuilt.summary.matches);
    for (const node of [...unbuilt.nodes].sort((a, b) => b.matches - a.matches)) {
      const list = byColumn.get(node.column) ?? [];
      list.push({
        id: node.item_id,
        winRate: node.wins / Math.max(1, node.matches),
        pickRate: node.matches / games,
        matches: node.matches,
      });
      byColumn.set(node.column, list);
    }
    return byColumn;
  }, [unbuilt]);
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
  // Per item the items it is built from, which buying it takes out of their slots.
  const componentsOf = useMemo(() => {
    const idByClass = new Map((upgrades ?? []).map((item) => [item.class_name, item.id]));
    return new Map(
      (upgrades ?? []).map((item) => [
        item.id,
        (item.component_items ?? []).flatMap((name) => idByClass.get(name) ?? []),
      ]),
    );
  }, [upgrades]);
  // Per picked item the pick it is built into: a later or same-stage pick whose components include it.
  const mergedInto = useMemo(() => {
    const map = new Map<string, string>();
    for (const key of path) {
      const { column, itemId } = parseKey(key);
      const into = path.find((other) => {
        const o = parseKey(other);
        return other !== key && o.column >= column && (componentsOf.get(o.itemId) ?? []).includes(itemId);
      });
      if (into) map.set(key, into);
    }
    return map;
  }, [path, componentsOf]);
  // What each pick costs the build: an upgrade bought onto a component the build holds pays only the difference.
  const payOf = useMemo(() => {
    const pay = new Map<string, number>();
    for (const key of path) {
      const own = costOf.get(parseKey(key).itemId) ?? 0;
      const credit = path
        .filter((other) => mergedInto.get(other) === key)
        .reduce((sum, other) => sum + (costOf.get(parseKey(other).itemId) ?? 0), 0);
      pay.set(key, Math.max(0, own - credit));
    }
    return (key: string) => pay.get(key) ?? costOf.get(parseKey(key).itemId) ?? 0;
  }, [path, mergedInto, costOf]);
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
      // They replace the build, so they stay offered whatever it holds.
    ].filter((s) => s.path.length > 1);
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
          cost: payOf(key),
          price: costOf.get(itemId) ?? 0,
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
      price: costOf.get(c.itemId) ?? 0,
      netWorthAtBuy: c.netWorthAtBuy,
      sellColumn: null,
    }));
  }, [path, view, costOf, sellOf, payOf]);
  // The souls chart and the buy order read the build on the hero's soul curve; the stage budgets read the curve.
  const economy = useBuildEconomy({ items: economyItems, ...economyFilters });
  const soulCurve = economy.curve.points;

  // The skill order of the players who bought the build's items (the hero's overall one without picks): the panel at
  // the end shows it, and the souls timeline places its upgrades.
  const skillRequest = {
    gameMode: "normal" as const,
    matchMode,
    minAverageBadge: minRankId,
    maxAverageBadge: maxRankId,
    minUnixTimestamp: minUnixTimestamp ?? 0,
    maxUnixTimestamp,
    minMatches: 10,
    includeItemIds: path.length > 0 ? [...new Set(path.map((key) => parseKey(key).itemId))] : undefined,
  };
  const {
    path: skillPath,
    slotAbilities,
    orderQuery: skillQuery,
  } = useHeroSkillPath(heroId ?? 0, skillRequest, undefined, heroId != null && !isStreetBrawl);
  // The build's skill order: the reader's (`build_skills`, abilities of this hero only) or the most common one.
  const commonSkills = useMemo(() => skillPath?.steps.map((step) => step.abilityId) ?? [], [skillPath]);
  const skillOrder = useMemo(
    () =>
      storedSkills && storedSkills.length > 0 && storedSkills.every((id) => slotAbilities.includes(id))
        ? storedSkills
        : commonSkills,
    [storedSkills, slotAbilities, commonSkills],
  );

  // Dim the stages only while another build's answer loads; a refresh of the shown one keeps them as they are.
  const switching = isFetching && isPlaceholderData;

  if (isLoading) return <LoadingState label="build flow" align="center" />;
  if (isError && !data) {
    return <ErrorState title="The build flow did not load" retrying={isFetching} onRetry={() => void refetch()} />;
  }
  if (!data || !view) return null;

  const { summary, baseline } = data;
  const winRate = summary.matches > 0 ? summary.wins / summary.matches : 0;
  // What the build is compared with: the games that reached its last stage, where the API reports their wins (late
  // stages hold long games only, which flatter any build ending there); all games otherwise.
  const lastColumn = Math.max(0, ...path.map((key) => parseKey(key).column));
  // Optional in the schema: answers cached from before the API had it lack it.
  const reachedWins = data.reached_wins_per_column?.[lastColumn];
  const reachedGames = data.reached_per_column[lastColumn];
  const reachedBase = lastColumn > 0 && reachedWins != null && reachedGames > 0;
  const baseWinRate = reachedBase
    ? reachedWins / reachedGames
    : baseline.matches > 0
      ? baseline.wins / baseline.matches
      : 0;
  const baseLabel = reachedBase ? `vs ${stageLabel(lastColumn, isStreetBrawl)} games` : "vs all";
  const [wrLow, wrHigh] = wilsonScoreInterval(summary.wins, summary.matches);
  // What the build spends, per stage and in all: its picks at what they cost on top of their components, less the
  // refund of a sale in the stage it is sold in (as the budgets and the souls panel count it).
  const stageCost = new Map<number, number>();
  for (const key of path) {
    const { column, itemId } = parseKey(key);
    stageCost.set(column, (stageCost.get(column) ?? 0) + payOf(key));
    const sold = sellOf.get(key);
    if (sold != null) stageCost.set(sold, (stageCost.get(sold) ?? 0) - (costOf.get(itemId) ?? 0) * SELL_REFUND);
  }
  const cost = [...stageCost.values()].reduce((sum, n) => sum + n, 0);
  const categoryCost = new Map<string, number>();
  for (const key of path) {
    const { itemId } = parseKey(key);
    const slot = slotOf.get(itemId);
    if (slot) categoryCost.set(slot, (categoryCost.get(slot) ?? 0) + payOf(key));
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
            if (column <= stage.column) spent += payOf(key);
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
  // What each pick adds: the build's players who took it against those who, all else the same, did not, from
  // `leave_one_out`. Colored only when the gap clears its 95% margin.
  const leaveOneOut = data.leave_one_out;
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
    const next = nextPick(view, stage.column, taken, isStreetBrawl ? NEXT_MIN_SHARE_BRAWL : NEXT_MIN_SHARE);
    if (next) {
      nextPicks.set(stage.column, next);
      taken.add(next.itemId);
    }
  }
  // Per stage the items the build holds at its end (sold ones and ones built into a later pick free their slot) against
  // the slots open by then.
  const slotUse = view.stages.map((stage) => {
    const end = STAGE_ENDS[stage.column] ?? STAGE_ENDS[STAGE_ENDS.length - 1];
    const used = path.filter((key) => {
      if (parseKey(key).column > stage.column) return false;
      const sold = sellOf.get(key);
      const into = mergedInto.get(key);
      return !(sold != null && sold <= stage.column) && !(into && parseKey(into).column <= stage.column);
    }).length;
    return { used, open: BASE_SLOTS + flexMinutes.filter((m) => m * 60 <= end).length };
  });
  // Completes the build one item at a time on the build's own data: each step reads the players of the build so far,
  // so an item is only added if enough of them bought it too, and the finished build still has games behind it.
  // `from` is the build to complete: the current one, or empty for a one-press build that replaces it. `control` names
  // the button pressed, which shows the work.
  const complete = async (focus: BuildFocus, goal: BuildGoal, from: string[] = path, control = "complete") => {
    if (!budgets) return;
    setCompleting(control);
    try {
      const current = [...from];
      for (let step = 0; step < COMPLETE_MAX_ITEMS; step++) {
        // oxlint-disable-next-line no-await-in-loop -- each step reads the answer for the build the last step made
        const answer = await queryClient.query(flowQuery(current));
        const stepView = buildView(answer, {
          path: new Set(current),
          columnCount,
          perColumn,
          sortBy,
          isStreetBrawl,
        });
        // The build's own players first (at least 200, then 50 of them bought the item): a build no one played has no
        // win rate to show, so the completion goes as far as the games do.
        // A confident build stops at 200: its win rate is to rest on games, not a streak of 50.
        const tiers = [
          [...stepView.byKey.values()].filter((c) => c.matches >= COMPLETE_MIN_GAMES),
          ...(goal === "confident"
            ? []
            : [[...stepView.byKey.values()].filter((c) => c.matches >= COMPLETE_FALLBACK_GAMES)]),
        ];
        let next: string | undefined;
        for (const choices of tiers) {
          [next] = completeBuild({
            stages: view.stages.map((stage, index) => ({
              column: stage.column,
              available: budgets[index].available,
              // Paced like a real build, so cheap early items do not take the slots late ones need.
              slots: Math.min(slotUse[index].open, COMPLETE_HELD_BY_STAGE[index] ?? slotUse[index].open),
            })),
            // The least each item's win rate may be, for the confident goal.
            choices: choices.map((c) => ({ ...c, lowerBound: c.confident })),
            path: current,
            priceOf: (id) => costOf.get(id) ?? 0,
            categoryOf: (id) => slotOf.get(id),
            componentsOf: (id) => componentsOf.get(id) ?? [],
            focus,
            goal,
          });
          if (next) break;
        }
        if (!next) break;
        current.push(next);
        // On the board as it is found, so the build fills in while the next step loads (its answer is the one the
        // board then reads, fetched once).
        changePath([...current]);
      }
      if (current.length > from.length) {
        const before = path;
        const open = view.stages.filter((stage) => !current.some((key) => parseKey(key).column === stage.column));
        toast(
          from.length === 0 && before.length > 0
            ? `Replaced the build: ${current.length} items`
            : `Added ${current.length - before.length} items`,
          {
            description:
              open.length > 0
                ? `Too few games go on to ${open.map((stage) => stage.title).join(", ")} with this build`
                : undefined,
            // Gone after a few seconds rather than covering the board while the build is refined.
            duration: 5000,
            action: { label: "Undo", onClick: () => changePath(before.length > 0 ? before : null) },
          },
        );
      } else {
        toast("No item to add: too few players of this build bought more");
      }
    } finally {
      setCompleting(null);
    }
  };
  // A win rate from a handful of games (13, 1) reads like a fact; under this many it is not shown.
  const tooFewGames = summary.matches < MIN_RATE_GAMES;
  // A build nobody played in these filters: its numbers are not zeros but missing.
  const noGames = summary.matches === 0;

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
          <Inline gap={3}>
            {/* Whole builds to start from or complete the started one with, before the build's own actions. */}
            <Inline gap={2}>
              {/* Street Brawl rounds have no souls budget to complete a build against. */}
              {!isStreetBrawl && (
                <BuildCompleter
                  disabled={!budgets}
                  busy={completing === "complete"}
                  onComplete={(focus, goal) => void complete(focus, goal)}
                />
              )}
              {/* One-press builds in place of the current one (with Undo): Complete build from empty, balanced, by most bought or
                  confidently by win rate. Street Brawl, without a souls budget, takes the path of one item a round. */}
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.label}
                  variant="subtle"
                  size="sm"
                  disabled={completing != null}
                  loading={completing === suggestion.label}
                  onClick={() => {
                    if (budgets) {
                      void complete(
                        "balanced",
                        // The best win rate by the least it may be: a perfect record from a few games does not make the build.
                        suggestion.label === "Most common" ? "popular" : "confident",
                        [],
                        suggestion.label,
                      );
                      return;
                    }
                    // Street Brawl: the path of one item a round, in place of the build, with Undo.
                    const before = path;
                    changePath(suggestion.path.map((c) => c.key));
                    toast(`${suggestion.label} build`, {
                      action: { label: "Undo", onClick: () => changePath(before.length > 0 ? before : null) },
                    });
                  }}
                >
                  {suggestion.label}
                </Button>
              ))}
            </Inline>
            <Inline gap={1}>
              <SavedBuildsMenu
                onOpen={(build) =>
                  startTransition(() => {
                    if (build.heroId !== heroId) void setHero(build.heroId, AT_ONCE);
                    setPath(build.path.length > 0 ? build.path : null, AT_ONCE);
                    void setSells(build.sells.length > 0 ? build.sells : null, AT_ONCE);
                    void setFlex(build.flex ?? null, AT_ONCE);
                    void setSkills(build.skills ?? null, AT_ONCE);
                  })
                }
              />
              {path.length > 0 && (
                <SaveBuildButton
                  defaultName={`${hero?.name ?? "My"} build`}
                  heroId={heroId}
                  path={path}
                  sells={[...sellOf].map(([key, column]) => `${key}:${column}`)}
                  flex={flexMinutes}
                  skills={storedSkills ?? undefined}
                />
              )}
              {path.length > 0 && (
                <>
                  <CopyButton variant="ghost" size="xs" icon={Link} text={() => window.location.href}>
                    Copy link
                  </CopyButton>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      // A build is a few dozen presses of work: clearing it can be taken back.
                      const before = { path, sells: storedSells, skills: storedSkills };
                      changePath(null);
                      startTransition(() => {
                        void setSells(null, AT_ONCE);
                        void setSkills(null, AT_ONCE);
                      });
                      toast("Cleared the build", {
                        action: {
                          label: "Undo",
                          onClick: () => {
                            changePath(before.path);
                            startTransition(() => {
                              void setSells(before.sells.length > 0 ? before.sells : null, AT_ONCE);
                              void setSkills(before.skills, AT_ONCE);
                            });
                          },
                        },
                      });
                    }}
                  >
                    Clear
                  </Button>
                </>
              )}
            </Inline>
          </Inline>
        </PanelHeader>
        <PanelBody className="@container">
          <Stack gap={3}>
            {/* The build's figures and, beside them where the panel is wide, its spending by shop category. */}
            <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:gap-8">
              {/* While another build loads, its numbers are not known yet: the old ones would read as the new build's. */}
              <StatGroup
                variant="plain"
                size="xs"
                aria-busy={switching || undefined}
                className="grid-cols-2 gap-x-6 @md:grid-cols-4 @3xl:flex @3xl:shrink-0 @3xl:gap-x-8"
              >
                <Stat
                  label="Win rate"
                  value={switching ? <Skeleton className="h-6 w-16" /> : tooFewGames ? null : percent(winRate)}
                  tone={switching ? undefined : buildTone}
                  sub={
                    switching ? (
                      <Skeleton className="h-4 w-20" />
                    ) : noGames ? undefined : tooFewGames ? (
                      `under ${MIN_RATE_GAMES} games`
                    ) : path.length === 0 ? (
                      `±${((wrHigh - wrLow) * 50).toFixed(1)} pts`
                    ) : (
                      <>
                        {Math.round((winRate - baseWinRate) * 1000) === 0 ? (
                          "+0.0"
                        ) : (
                          <Delta value={(winRate - baseWinRate) * 100} format="number" />
                        )}{" "}
                        ±{((wrHigh - wrLow) * 50).toFixed(1)} {baseLabel}
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
                    ) : summary.matches > 0 && summary.matches < FEW_GAMES ? (
                      // Too few games for the win rate beside it to mean much: said in the warning color with a mark.
                      <span className="inline-flex items-center gap-1 text-warning">
                        <TriangleAlert className="size-3" aria-hidden="true" />
                        few games · {percent(summary.matches / Math.max(1, baseline.matches))} of all
                      </span>
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
              <div className="flex min-w-0 flex-col-reverse gap-1.5 @3xl:flex-1">
                <ProgressBar variant="thin" max={Math.max(1, cost)} className="w-full min-w-0">
                  {CATEGORIES.map((category) => (
                    <ProgressBarSegment
                      key={category.slot}
                      value={categoryCost.get(category.slot) ?? 0}
                      color={category.color}
                    />
                  ))}
                </ProgressBar>
                <ChartLegend className="shrink-0">
                  {CATEGORIES.map((category) => (
                    <ChartLegendItem key={category.slot} color={category.color} shape="square">
                      {category.label} {count(categoryCost.get(category.slot) ?? 0)}
                    </ChartLegendItem>
                  ))}
                </ChartLegend>
              </div>
            </div>
            <BuildBoard aria-label="Build by stage" ref={boardRef}>
              {view.stages.map((stage, index) => {
                const held = path.filter((key) => parseKey(key).column === stage.column);
                // Every item of the stage for its picker: the build's players' first, then the hero's items the build
                // narrowed away, so a search always finds an item even when few games are left.
                const own = stage.candidates.filter((c) => !heldItems.has(c.id));
                const ownIds = new Set(own.map((c) => c.id));
                const pickable = [
                  ...own,
                  ...(fallbackCandidates.get(stage.column) ?? []).filter(
                    (c) => !heldItems.has(c.id) && !ownIds.has(c.id),
                  ),
                ];
                const soldHere = path.filter((key) => sellOf.get(key) === stage.column);
                // Earlier picks an item bought in this stage is built from: they leave their slot here.
                const mergedHere = path.flatMap((key) => {
                  const into = mergedInto.get(key);
                  return into && parseKey(into).column === stage.column && parseKey(key).column < stage.column
                    ? [{ key, into }]
                    : [];
                });
                return (
                  <BuildSlot
                    key={stage.column}
                    drop={dragged && dropColumn === stage.column ? "over" : "none"}
                    onDragOver={(event) => {
                      if (!dragged || parseKey(dragged).column === stage.column) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dropColumn !== stage.column) setDropColumn(stage.column);
                    }}
                    onDragLeave={(event) => {
                      // Chrome leaves `relatedTarget` empty when the pointer crosses into the card's own children:
                      // only a move onto another element clears the highlight (a drop or the drag's end clear it too).
                      const into = event.relatedTarget as Node | null;
                      if (into && !event.currentTarget.contains(into)) setDropColumn(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragged) move(dragged, stage.column);
                      setDragged(null);
                      setDropColumn(null);
                    }}
                    label={
                      <>
                        {stage.title}
                        {/* Only a stage most games never reach (30m+) says how many do: it shows long games only, whose
                            win rates run high. */}
                        {stage.reached < LATE_REACH && (
                          <span className="font-normal text-warning">
                            {" · "}
                            <Hourglass className="inline size-3 align-text-bottom" aria-hidden="true" />{" "}
                            {percent(stage.reached, 0)} of games
                          </span>
                        )}
                      </>
                    }
                    meta={
                      // At the card's top right: what the build has spent by the stage's end against the souls and
                      // slots a player has by then. Street Brawl rounds reset their souls: there, what the round costs.
                      budgets ? (
                        <BuildBudget
                          variant="inline"
                          spent={budgets[index]?.spent ?? 0}
                          available={budgets[index]?.available ?? 0}
                          slots={slotUse[index]}
                          format={compactSouls}
                        />
                      ) : !isStreetBrawl ? (
                        <Skeleton className="h-4 w-32" />
                      ) : stageCost.get(stage.column) ? (
                        count(stageCost.get(stage.column) ?? 0)
                      ) : undefined
                    }
                    action={
                      pickable.length > 0 ? (
                        <StagePicker stage={{ ...stage, candidates: pickable }} onPick={toggle} />
                      ) : undefined
                    }
                    footer={
                      <>
                        {/* What the stage's players buy, to add from, in the stage's own card. */}
                        <BuildStage
                          title={`Add items, ${stage.title}`}
                          titleDisplay="hidden"
                          surface="inset"
                          aria-busy={switching || undefined}
                        >
                          {stage.choices.length === 0 ? (
                            <EmptyState variant="inline" title="No purchases" />
                          ) : (
                            <>
                              {/* The column names sort every stage's list: by how many buy an item, or by its win rate. */}
                              <BuildChoiceHeader
                                aria-hidden={false}
                                start={
                                  <>
                                    Add ·{" "}
                                    <SortButton
                                      active={sortBy === "pickrate"}
                                      sortDir="desc"
                                      aria-pressed={sortBy === "pickrate"}
                                      aria-label="Sort by bought"
                                      onClick={() => void setSortBy("pickrate")}
                                    >
                                      bought
                                    </SortButton>
                                  </>
                                }
                                end={
                                  <SortButton
                                    align="end"
                                    active={sortBy === "winrate"}
                                    sortDir="desc"
                                    aria-pressed={sortBy === "winrate"}
                                    aria-label="Sort by win rate"
                                    onClick={() => void setSortBy("winrate")}
                                  >
                                    Win rate
                                  </SortButton>
                                }
                              />
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
                                      media={<ItemImage itemId={choice.itemId} className="size-7" />}
                                      name={
                                        <ItemName
                                          itemId={choice.itemId}
                                          className="line-clamp-2 whitespace-normal @md:whitespace-nowrap"
                                        />
                                      }
                                      share={choice.pickShare}
                                      meta={percent(choice.pickRate)}
                                      price={
                                        costOf.get(choice.itemId) ? (
                                          // Past what the stage has left once the build's spending is paid, it reads as a loss.
                                          budgets &&
                                          (costOf.get(choice.itemId) ?? 0) >
                                            budgets[index].available - budgets[index].spent ? (
                                            <span className="inline-flex items-center gap-0.5 text-negative">
                                              <TriangleAlert className="size-3" aria-label="Over the stage's souls" />
                                              {count(costOf.get(choice.itemId) ?? 0)}
                                            </span>
                                          ) : (
                                            count(costOf.get(choice.itemId) ?? 0)
                                          )
                                        ) : undefined
                                      }
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
                                        interval: [
                                          (choice.interval[0] - winRate) * 100,
                                          (choice.interval[1] - winRate) * 100,
                                        ],
                                      }}
                                      selected={choice.selected}
                                      aria-label={`${nameOf.get(choice.itemId) ?? "Item"}: bought ${percent(choice.pickRate)}, win rate ${percent(choice.winRate)}`}
                                      relation={!near ? "none" : link ? "linked" : "unlinked"}
                                      onClick={() => {
                                        toggle(choice.key);
                                        // Far down a list the build is out of sight: say where the item went.
                                        const board = boardRef.current?.getBoundingClientRect();
                                        if (
                                          !choice.selected &&
                                          board &&
                                          (board.bottom < 0 || board.top > window.innerHeight)
                                        ) {
                                          toast(`${nameOf.get(choice.itemId) ?? "Item"} added to ${stage.title}`, {
                                            duration: 2500,
                                            action: { label: "Undo", onClick: () => toggle(choice.key) },
                                          });
                                        }
                                      }}
                                      onPointerEnter={() => startTransition(() => setPointed(choice.key))}
                                      onPointerLeave={() => startTransition(() => setPointed(null))}
                                      onFocus={() => startTransition(() => setPointed(choice.key))}
                                      onBlur={() => startTransition(() => setPointed(null))}
                                    />
                                  );
                                })}
                              </BuildChoiceList>
                              {/* A full list (there are more items than it shows): the stage's picker at its end too. */}
                              {stage.choices.length >= PER_STAGE && pickable.length > 0 && (
                                <StagePicker stage={{ ...stage, candidates: pickable }} onPick={toggle} display="row" />
                              )}
                            </>
                          )}
                        </BuildStage>
                      </>
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
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", key);
                            setDragged(key);
                          }}
                          onDragEnd={() => {
                            setDragged(null);
                            setDropColumn(null);
                          }}
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
                              {mergedInto.get(key) && parseKey(mergedInto.get(key) ?? "").column === stage.column
                                ? `${count(costOf.get(itemId) ?? 0)} · into ${nameOf.get(parseKey(mergedInto.get(key) ?? "").itemId) ?? "an upgrade"}`
                                : sellColumn != null
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
                              moveTo={view.stages.filter((s) => s.column !== stage.column)}
                              onMove={(column) => move(key, column)}
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
                            // The games beside the rate: a suggestion's rate from a few hundred games swings as the build changes.
                            meta={`${percent(next.wins / Math.max(1, next.matches))} WR · ${count(next.matches)} games`}
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
                    {mergedHere.map(({ key, into }) => {
                      const { itemId } = parseKey(key);
                      return (
                        <BuildSlotItem
                          key={`${key}:merged`}
                          state="sold"
                          media={<ItemImage itemId={itemId} className="size-8" />}
                          name={<ItemName itemId={itemId} />}
                          meta={`built into ${nameOf.get(parseKey(into).itemId) ?? "an upgrade"}`}
                        />
                      );
                    })}
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
            {noGames && !switching && (
              <EmptyState
                variant="plain"
                title="No games with this build"
                action={
                  <Button variant="outline" size="sm" onClick={() => changePath((prev) => prev.slice(0, -1))}>
                    Remove the last item
                  </Button>
                }
              />
            )}
          </Stack>
        </PanelBody>
      </Panel>

      {/* Under the build: the souls chart, and beside it where the page is wide the skill order over the buy order;
          the chart grows to the stack's height. Where it is narrower the two sit side by side under the chart. */}
      <div className="@container min-w-0">
        <div className="grid gap-4 @7xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {!isStreetBrawl && economyItems.length > 0 && (
            <BuildEconomy
              title={path.length > 0 ? "Souls for your build" : "Souls for the most common build"}
              economy={economy}
              skills={skillOrder.flatMap((abilityId, i) => {
                // The reader's order takes its upgrades at the times the common one's are taken, step by step.
                const at = skillPath?.steps[i]?.at;
                return at != null ? [{ level: i + 1, abilityId, at }] : [];
              })}
              abilities={slotAbilities}
              flexMinutes={flexMinutes}
              onFlexMinutesChange={(minutes) => startTransition(() => void setFlex(minutes, AT_ONCE))}
            />
          )}
          {!isStreetBrawl && (
            // Under the chart, side by side where there is room; beside it, one over the other.
            <div className="flex min-w-0 flex-col gap-4 @4xl:grid @4xl:grid-cols-2 @7xl:flex">
              {heroId != null && (
                // The build's skill order, starting from the most common one of its players.
                <BuildSkillOrder
                  heroId={heroId}
                  slotAbilities={slotAbilities}
                  order={skillOrder}
                  common={skillPath?.steps ?? []}
                  scope={path.length > 0 ? "most common with these items" : "most common"}
                  commonStats={skillPath ? { winRate: skillPath.winRate, matches: skillPath.matches } : null}
                  request={skillRequest}
                  loading={skillQuery.isPending}
                  onValueChange={(next) => startTransition(() => void setSkills(next, AT_ONCE))}
                />
              )}
              {economyItems.length > 0 && <BuildPurchases economy={economy} className="flex-1 only:col-span-2" />}
            </div>
          )}
        </div>
      </div>
    </Stack>
  );
}

interface View {
  stages: Stage[];
  byKey: Map<string, Choice>;
  /** Per choice, the choices in the neighbouring stages bought by the same players, both ways. */
  links: Map<string, Map<string, { matches: number; wins: number }>>;
  /** The least a win rate may be, a small sample pulled toward the build's own first: see `Choice.confident`. */
  confident: (wins: number, matches: number) => number;
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
      confident: confidentRate(winRate * node.matches, node.matches, reference, shrink),
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
        .map((c) => ({ id: c.itemId, winRate: c.winRate, pickRate: c.pickRate, matches: c.matches })),
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
    confident: (wins, matches) => confidentRate(wins, matches, reference, shrink),
  };
}

/**
 * A whole build, one item per stage, followed through the links: the most bought first item and then, stage by stage,
 * what its buyers bought most next (`common`), or the same by the least the win rate may be (`winning`). A stage
 * with a pick of the reader's keeps it, so a started build is completed rather than replaced. Ends early where nobody
 * went on. It reads every choice of a stage, not the sorted and cut list on screen, so the sort does not change it.
 */
function suggestPath(view: View, by: "common" | "winning"): Choice[] {
  const path: Choice[] = [];
  // An item is owned once: neither a pick of the reader's nor an earlier step of the path is suggested again.
  const taken = new Set([...view.byKey.values()].filter((c) => c.selected).map((c) => c.itemId));
  for (const stage of view.stages) {
    const from = path.at(-1);
    const all = [...view.byKey.values()].filter(
      (c) => c.column === stage.column && (c.selected || !taken.has(c.itemId)),
    );
    let next = all.filter((c) => c.selected).sort((a, b) => b.matches - a.matches)[0];
    if (!next && !from) {
      next =
        by === "common"
          ? all.sort((a, b) => b.matches - a.matches)[0]
          : all.filter((c) => c.pickRate >= SUGGEST_MIN_SHARE).sort((a, b) => b.confident - a.confident)[0];
    } else if (!next && from) {
      let best = Number.NEGATIVE_INFINITY;
      for (const [key, link] of view.links.get(from.key) ?? []) {
        const choice = view.byKey.get(key);
        if (!choice || choice.column !== stage.column || taken.has(choice.itemId)) continue;
        // The winning build only takes a step a good part of the previous item's buyers took: a chain of rare steps
        // ends on a hundred games that won 80%.
        if (by === "winning" && link.matches < from.matches * SUGGEST_MIN_SHARE) continue;
        const rank = by === "common" ? link.matches : view.confident(link.wins, link.matches);
        if (rank > best) {
          best = rank;
          next = choice;
        }
      }
    }
    if (!next) break;
    path.push(next);
    taken.add(next.itemId);
  }
  return path;
}
