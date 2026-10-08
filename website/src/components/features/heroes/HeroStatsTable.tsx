import { Link } from "@tanstack/react-router";
import { Crosshair, Skull, Sparkles, Swords, type LucideIcon } from "lucide-react";

import { HeroCell } from "~/components/domain/assets/HeroCell";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroDetailsTooltip } from "~/components/features/heroes/HeroDetailsTooltip";
import { HeroStatTrend } from "~/components/features/heroes/HeroStatTrend";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { Panel, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { ProgressBarSegment } from "~/components/ui/progress-bar";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { SortButton, ariaSort } from "~/components/ui/sort-button";
import { Inline, Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { findKey } from "~/lib/find-keys";
import { formatPercent } from "~/lib/format";
import { Z_SCORE_BR_WEIGHT, Z_SCORE_PR_WEIGHT, Z_SCORE_WR_WEIGHT } from "~/lib/hero-scoring";
import { heroSlug } from "~/lib/hero-slug";

import {
  type HeroStatsRowData,
  type HeroStatsTableFilters,
  type HeroStatsTableState,
  type HeroType,
  type HeroTypeGroupData,
  useHeroStatsTable,
} from "./useHeroStatsTable";

const COMPACT_MATCHES = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const HERO_TYPE_CONFIG: Record<HeroType, { label: string; color: string; icon: LucideIcon }> = {
  assassin: { label: "Assassin", color: "var(--chart-6)", icon: Skull },
  brawler: { label: "Brawler", color: "var(--chart-1)", icon: Swords },
  marksman: { label: "Marksman", color: "var(--chart-2)", icon: Crosshair },
  mystic: { label: "Mystic", color: "var(--chart-4)", icon: Sparkles },
};

/** The overall hero stats: one table, or one panel per hero type. Logic lives in `useHeroStatsTable`. */
export function HeroStatsTable({
  onClearNameQuery,
  ...filters
}: HeroStatsTableFilters & { onClearNameQuery?: () => void }) {
  const table = useHeroStatsTable(filters);

  if (table.isLoading) {
    return <LoadingState label="hero stats" align="center" />;
  }

  if (table.isError) {
    return (
      <ErrorState
        title="Unable to load hero stats"
        description="Your filters are still selected. Try loading the data again."
        retrying={table.retrying}
        onRetry={table.retry}
      />
    );
  }

  if (table.rows.length === 0) {
    return (
      <EmptyState
        title={table.hasData ? "No heroes match your search" : "No hero stats for these filters"}
        description={
          table.hasData
            ? "Try another hero name or clear your search."
            : "Try a wider date range, more ranks, or lower match requirements."
        }
        action={
          table.hasData &&
          onClearNameQuery && (
            <Button variant="outline" onClick={onClearNameQuery}>
              Clear search
            </Button>
          )
        }
      />
    );
  }

  if (table.groups) {
    return (
      <StaleOverlay active={table.isStale} label="hero stats" className="flex flex-col gap-4">
        {table.groups.map(
          (group) => group.visible.length > 0 && <HeroTypeGroup key={group.type} group={group} table={table} />,
        )}
      </StaleOverlay>
    );
  }

  return (
    <StaleOverlay active={table.isStale} label="hero stats" className="flex flex-col gap-3">
      <Table>
        <HeroStatsHeader table={table} />
        <TableBody>
          {table.rows.map(({ rank, hero }) => (
            <HeroStatsRow key={hero.row.hero_id} rank={rank} hero={hero} table={table} />
          ))}
        </TableBody>
      </Table>
    </StaleOverlay>
  );
}

function GroupStat({
  label,
  value,
  delta,
  polarity,
}: {
  label: string;
  value: number;
  delta?: number;
  polarity?: React.ComponentProps<typeof Delta>["polarity"];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{(value * 100).toFixed(1)}%</span>
      {delta !== undefined && <Delta value={delta} polarity={polarity} className="text-xs" />}
    </div>
  );
}

/** The panel of one hero type: its share of picks (or bans, or presence) and win rate, over its heroes' table. */
function HeroTypeGroup({ group, table }: { group: HeroTypeGroupData; table: HeroStatsTableState }) {
  const config = HERO_TYPE_CONFIG[group.type];
  return (
    <Panel>
      <PanelHeader
        icon={config.icon}
        accent={config.color}
        title={
          <>
            {config.label}{" "}
            <span className="font-normal text-muted-foreground">
              ({group.visible.length} of {group.heroes.length} heroes)
            </span>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <GroupStat label="Win Rate:" value={group.winRate} delta={group.winRateDelta} />
          {table.pickRateMode === "banRate" ? (
            <GroupStat label="Ban Rate:" value={group.banRate} delta={group.banRateDelta} polarity="lower-is-better" />
          ) : table.pickRateMode === "presence" ? (
            <GroupStat label="Presence Share:" value={group.presenceShare} delta={group.presenceShareDelta} />
          ) : (
            <GroupStat label="Pick Share:" value={group.pickShare} delta={group.pickShareDelta} />
          )}
        </div>
      </PanelHeader>
      <Table>
        <HeroStatsHeader table={table} />
        <TableBody>
          {group.visible.map(({ rank, hero }) => (
            <HeroStatsRow key={hero.row.hero_id} rank={rank} hero={hero} table={table} />
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function HeroStatsHeader({ table }: { table: HeroStatsTableState }) {
  const { sortKey, sortDir, onSort, pickRateMode, normalized } = table;
  // "desc" is the default direction of every column; for names it means A to Z, so the arrow and aria-sort both say
  // ascending.
  const heroSortDir = sortDir === "desc" ? "asc" : "desc";
  return (
    <TableHeader tone="muted">
      <TableRow>
        <TableHead className="w-1/100 text-center">#</TableHead>
        <TableHead
          aria-sort={ariaSort(sortKey === "hero", heroSortDir)}
          // A phone keeps the pinned column to the hero itself, so a swipe shows more than one stat column.
          className="w-1/100 @md/table:min-w-40"
          data-pinned
        >
          <SortButton active={sortKey === "hero"} sortDir={heroSortDir} align="start" onClick={() => onSort("hero")}>
            <span>Hero</span>
          </SortButton>
        </TableHead>
        <SortableHeader
          label="Win Rate"
          sortKey="winrate"
          activeSortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSort}
          className="w-19/100 text-center"
        />
        <TableHead aria-sort={ariaSort(sortKey === "pickRate", sortDir)} className="w-19/100 text-center">
          <Inline justify="center" wrap="nowrap" className="inline-flex">
            {table.hasBans ? (
              <Segmented
                size="sm"
                width="hug"
                // One line, so the column widens to fit it: wrapped into a fifth of the table, the switch stacked its
                // three options and made the whole header row 60-80px tall.
                className="flex-nowrap"
                aria-label="Pick rate column metric"
                value={pickRateMode}
                onValueChange={table.onPickRateModeChange}
              >
                <SegmentedItem value="pickRate" onClick={() => table.onPickRateModeClick("pickRate")}>
                  {normalized ? "Pick Rate (Norm.)" : "Pick Rate"}
                </SegmentedItem>
                <SegmentedItem value="banRate" onClick={() => table.onPickRateModeClick("banRate")}>
                  Ban Rate
                </SegmentedItem>
                <SegmentedItem value="presence" onClick={() => table.onPickRateModeClick("presence")}>
                  Presence
                </SegmentedItem>
              </Segmented>
            ) : (
              <span>{normalized ? "Pick Rate (Normalized)" : "Pick Rate"}</span>
            )}
            <SortButton
              active={sortKey === "pickRate"}
              sortDir={sortDir}
              onClick={() => onSort("pickRate")}
              aria-label={`Sort by ${pickRateMode === "presence" ? "presence" : pickRateMode === "banRate" ? "ban rate" : "pick rate"}`}
            />
          </Inline>
        </TableHead>
        <SortableHeader
          label="Z-Score"
          sortKey="zScore"
          activeSortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSort}
          className="w-19/100 text-center"
          description={
            <>
              Combines win rate, pick rate, and ban rate using z-scores (standard deviations from the mean). Weights:{" "}
              {Z_SCORE_WR_WEIGHT * 100}% win rate, {Z_SCORE_PR_WEIGHT * 100}% pick rate, {Z_SCORE_BR_WEIGHT * 100}% ban
              rate. Positive = above average, negative = below average.
            </>
          }
        />
        <SortableHeader
          label="Over/Under"
          sortKey="residual"
          activeSortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSort}
          className="w-19/100 text-center"
          description={
            <>
              How much a hero over- or underperforms relative to their draft prevalence. Uses LOESS smoothing (locally
              weighted regression) on log(presence) vs win rate, where presence = pick rate + ban rate. Weighted by
              sample size. Positive = overperforming, negative = underperforming for how often they appear in the draft.
            </>
          }
        />
        <TableHead className="w-1/20 text-center">Details</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function HeroStatsRow({ rank, hero, table }: { rank: number; hero: HeroStatsRowData; table: HeroStatsTableState }) {
  const { row, heroName } = hero;
  const { scales, trend } = table;
  const trendProps = {
    ...trend,
    heroId: row.hero_id,
    heroName: heroName ?? `Hero ${row.hero_id}`,
  };
  return (
    <TableRow data-find={findKey.hero(row.hero_id)}>
      <TableCell className="text-center font-semibold">{rank}</TableCell>
      <TableCell data-pinned>
        <Stack gap={1}>
          {table.heroLinkVariant === "test" && heroName !== undefined ? (
            <TextLink asChild tone="inherit" underline="dotted">
              <Link
                to="/analytics/heroes/$heroName"
                params={{ heroName: heroSlug(heroName) }}
                preload="intent"
                className="flex items-center gap-2"
              >
                <HeroImage heroId={row.hero_id} />
                <span className="truncate">{heroName}</span>
              </Link>
            </TextLink>
          ) : (
            <HeroCell heroId={row.hero_id} linkToDetail />
          )}
          {/* In a narrow table the sample size stays, shortened ("19K"): without it a phone lost how much a win rate
              rests on. The short form is generated content with empty alt text, so the page text (crawlers, screen
              readers, copy) holds the count once. */}
          <p
            data-compact={COMPACT_MATCHES.format(row.matches)}
            className="text-xs text-muted-foreground tabular-nums before:content-[attr(data-compact)_/_''] @md/table:before:content-none"
          >
            <span className="@max-md/table:sr-only">{row.matches.toLocaleString("en-US")} matches</span>
          </p>
        </Stack>
      </TableCell>
      <TableCell>
        <HeroStatTrend
          {...trendProps}
          stat="winRate"
          min={scales.winRate.min}
          max={scales.winRate.max}
          value={hero.winRate}
          color="var(--primary)"
          label={`${formatPercent(hero.winRate)} `}
          delta={hero.winRateDelta}
        />
      </TableCell>
      <TableCell>
        {table.pickRateMode === "presence" ? (
          <HeroStatTrend
            {...trendProps}
            stat="presence"
            min={scales.presence.min}
            max={scales.presence.max}
            value={hero.presence}
            label={
              <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                <span className="flex items-baseline gap-1">
                  <span className="text-chart-4">{(hero.pickRate * 100).toFixed(1)}%</span>
                  {hero.pickRateDelta !== undefined && <Delta value={hero.pickRateDelta} className="text-xs" />}
                </span>
                <span className="text-muted-foreground">+</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-chart-5">{(hero.banRate * 100).toFixed(1)}%</span>
                  {hero.banRateDelta !== undefined && <Delta value={hero.banRateDelta} className="text-xs" />}
                </span>
              </span>
            }
            delta={undefined}
          >
            <ProgressBarSegment value={hero.pickRate} color="var(--chart-4)" />
            <ProgressBarSegment value={hero.banRate} color="var(--chart-5)" />
          </HeroStatTrend>
        ) : table.pickRateMode === "banRate" ? (
          <HeroStatTrend
            {...trendProps}
            stat="banRate"
            min={scales.banRate.min}
            max={scales.banRate.max}
            value={hero.banRate}
            color="var(--chart-5)"
            label={`${(hero.banRate * 100).toFixed(1)}% `}
            delta={hero.banRateDelta}
          />
        ) : (
          <HeroStatTrend
            {...trendProps}
            stat="pickRate"
            min={scales.matches.min}
            max={scales.matches.max}
            value={row.matches}
            color="var(--chart-4)"
            label={`${Math.round((table.normalized ? hero.normalizedPickRate : hero.pickRate) * 100).toFixed(0)}% `}
            delta={table.normalized ? hero.normalizedPickRateDelta : hero.pickRateDelta}
          />
        )}
      </TableCell>
      <TableCell>
        <HeroStatTrend
          {...trendProps}
          stat="zScore"
          min={scales.zScore.min}
          max={scales.zScore.max}
          value={hero.zScore}
          color={hero.zScore >= 0 ? "var(--positive)" : "var(--negative)"}
          label={`${hero.zScore >= 0 ? "+" : ""}${hero.zScore.toFixed(2)}`}
          delta={hero.zScoreDelta}
          deltaFormat="number"
        />
      </TableCell>
      <TableCell>
        <HeroStatTrend
          {...trendProps}
          stat="residual"
          min={scales.residual.min}
          max={scales.residual.max}
          value={hero.residual}
          color={hero.residual >= 0 ? "var(--chart-3)" : "var(--muted-foreground)"}
          label={`${hero.residual >= 0 ? "+" : ""}${(hero.residual * 100).toFixed(2)}%`}
          delta={hero.residualDelta}
        />
      </TableCell>
      <TableCell className="text-center">
        <HeroDetailsTooltip
          row={row}
          heroName={heroName}
          sumMatches={table.sumMatches}
          pickrateMultiplier={table.pickrateMultiplier}
          gameMode={table.gameMode}
        />
      </TableCell>
    </TableRow>
  );
}
