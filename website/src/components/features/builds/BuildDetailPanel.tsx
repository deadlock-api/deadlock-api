import { GitCompareArrows, Hammer, Info } from "lucide-react";
import { useState } from "react";

import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { ITEM_SLOT_COLOR } from "~/components/domain/assets/item-slot-color";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { useBuildItemUsage, useItemPrices, useSkillOrder } from "~/components/features/builds/build-hooks";
import { BuildCompareDialog } from "~/components/features/builds/BuildCompareDialog";
import { BuildItemTile } from "~/components/features/builds/BuildItemTile";
import { ChartLegend, ChartLegendItem } from "~/components/patterns/charts/ChartLegend";
import { Panel, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar, ProgressBarSegment } from "~/components/ui/progress-bar";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { day } from "~/dayjs";
import type { BuildPerformanceTotals } from "~/lib/build-performance";
import {
  BUILD_SLOT_LABEL,
  BUILD_SLOTS,
  type BuildMeta,
  type BuildRow,
  buildCategoryName,
  buildLanguageName,
  buildSlotCost,
} from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";
import type { SteamProfile } from "~/queries/steam-queries";

/** A category's name, and what its author wrote about it behind an info mark. */
function CategoryTitle({ name, description }: { name: string; description: string | null }) {
  if (!description) return name;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="truncate">{name}</span>
      <Tooltip content={description}>
        <TooltipTarget aria-label={`About ${name}`} className="inline-flex shrink-0 items-center">
          <Info aria-hidden="true" className="size-3.5" />
        </TooltipTarget>
      </Tooltip>
    </span>
  );
}

/** One build as written: who made it, how it did, the items of each of its categories and its skill order. */
/** How the build's souls split over the three shop categories: a gun build leans weapon, a caster build spirit. */
function BuildSlotSplit({ meta }: { meta: BuildMeta }) {
  const items = useItemPrices();
  // Before the prices load the total is 0: the bar stays an empty track and the shares placeholders.
  const { total, bySlot } = buildSlotCost(meta, items);
  return (
    <section className="flex flex-col">
      {/* No total: a build lists options beside what is bought, so its items' sum is no game's spending. */}
      <PanelSection variant="label" title="Souls by shop category" />
      <div className="flex flex-col gap-1.5 px-3 py-1.5 @md:flex-row @md:items-center @md:gap-4">
        <ProgressBar variant="thin" max={Math.max(1, total)} className="@md:min-w-0 @md:flex-1">
          {BUILD_SLOTS.map((slot) => (
            <ProgressBarSegment key={slot} value={bySlot[slot]} color={ITEM_SLOT_COLOR[slot]} />
          ))}
        </ProgressBar>
        <ChartLegend size="sm" label="Shop categories" className="shrink-0">
          {BUILD_SLOTS.map((slot) => (
            <ChartLegendItem key={slot} color={ITEM_SLOT_COLOR[slot]} shape="square">
              {BUILD_SLOT_LABEL[slot]}{" "}
              <span className="text-foreground tabular-nums">
                {total > 0 ? formatPercent(bySlot[slot] / total, 0) : <NoValue />}
              </span>
            </ChartLegendItem>
          ))}
        </ChartLegend>
      </div>
    </section>
  );
}

export function BuildDetailPanel({
  row,
  rows,
  performanceById,
  authorBuilds,
  onBuildIdChange,
  purchaseFilters,
  active,
  heroId,
  profile,
  pending,
  profilePending,
  className,
}: {
  row: BuildRow;
  /** Every listed build, to compare this one with. */
  rows: readonly BuildRow[];
  /** Every listed build's performance totals, by id. */
  performanceById: Readonly<Record<number, BuildPerformanceTotals>> | undefined;
  /** The author's other listed builds for this hero. */
  authorBuilds: readonly BuildRow[];
  onBuildIdChange: (buildId: number) => void;
  /** The page's match filters, for the purchases of the build's players. */
  purchaseFilters: BuildPurchaseFilters;
  /** False while the selection is still moving: the purchases are not asked for yet. */
  active: boolean;
  heroId: number;
  profile: SteamProfile | undefined;
  /** Build contents are still loading. */
  pending: boolean;
  profilePending: boolean;
  className?: string;
}) {
  const [comparing, setComparing] = useState(false);
  const { meta } = row;
  const {
    usage,
    pending: purchasesPending,
    stale: purchasesStale,
  } = useBuildItemUsage({ heroId, row, filters: purchaseFilters, active });
  const { slotAbilities, skillOrder } = useSkillOrder(heroId, row);
  const name = meta?.name ?? `Build ${row.hero_build_id}`;

  return (
    <Panel className={cn("flex h-120 flex-col", className)}>
      <PanelHeader title={name} icon={Hammer} size="sm">
        {meta && (
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <PlayerCell
              size="sm"
              accountId={meta.authorId}
              name={profile?.personaname}
              avatar={profile?.avatar}
              loading={profilePending && !profile}
            />
            <span className="whitespace-nowrap tabular-nums">
              v{meta.version} · {day.unix(meta.updatedAt).utc().format("MMM D, YYYY")}
              {meta.language !== 0 && ` · ${buildLanguageName(meta.language)}`}
            </span>
          </span>
        )}
        {rows.length > 1 && (
          <Tooltip content="Compare with another build">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Compare with another build"
              className="ms-auto"
              onClick={() => setComparing(true)}
            >
              <GitCompareArrows aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
        <CopyButton
          text={String(row.hero_build_id)}
          variant="ghost"
          size="xs"
          aria-label={`Copy build ID ${row.hero_build_id}`}
          className={rows.length > 1 ? undefined : "ms-auto"}
        >
          <span className="tabular-nums">ID {row.hero_build_id}</span>
        </CopyButton>
      </PanelHeader>
      <div className={cn(SCROLLBAR_THIN, "@container relative flex min-h-0 flex-1 flex-col overflow-y-auto")}>
        {meta ? (
          <>
            <BuildSlotSplit meta={meta} />
            {/* Two columns of groups once the panel is wide enough, so more of the build shows without a scroll. */}
            <div className="grid @lg:grid-cols-2">
              {meta.categories
                .filter((category) => category.itemIds.length > 0)
                .map((category, index) => (
                  <section key={`${category.name}|${category.itemIds.join()}`} className="flex flex-col">
                    <PanelSection
                      variant="label"
                      title={
                        <CategoryTitle
                          name={buildCategoryName(category.name) ?? "Items"}
                          description={category.description}
                        />
                      }
                    >
                      {/* What the numbers under the icons are, named once over the first group. */}
                      {index === 0 && <span className="shrink-0 whitespace-nowrap">bought in % of matches</span>}
                    </PanelSection>
                    <ul className="flex flex-wrap gap-1 px-3 py-1.5">
                      {category.itemIds.map((itemId) => (
                        <li key={itemId}>
                          <BuildItemTile
                            itemId={itemId}
                            usage={usage?.byItem.get(itemId)}
                            // The last build's rates are of other items: its tiles wait under skeletons instead.
                            pending={purchasesPending || purchasesStale}
                            note={category.notes[itemId]}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
            {skillOrder.length > 0 && slotAbilities.length > 0 && (
              <section className="flex flex-col">
                <PanelSection variant="label" title="Skill order" />
                <div className="px-3 py-1.5">
                  <AbilityOrderGrid
                    size="sm"
                    abilityIds={slotAbilities}
                    steps={skillOrder.map((abilityId) => ({ abilityId }))}
                  />
                </div>
              </section>
            )}
            {authorBuilds.length > 0 && (
              <section className="flex flex-col">
                <PanelSection variant="label" title="More by this author" />
                <ul className="flex flex-col py-1">
                  {authorBuilds.map((build) => (
                    <li key={build.hero_build_id}>
                      <Button
                        variant="row"
                        className="flex items-center justify-between gap-3 px-3 py-1 text-xs"
                        onClick={() => onBuildIdChange(build.hero_build_id)}
                      >
                        <span className="min-w-0 truncate">{build.meta?.name ?? `Build ${build.hero_build_id}`}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {build.matches.toLocaleString("en-US")} · {formatPercent(build.winRate)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : pending ? (
          <LoadingState variant="skeleton" size="sm" />
        ) : (
          <EmptyState variant="plain" title="This build is no longer published" />
        )}
      </div>
      {comparing && (
        <BuildCompareDialog
          open={comparing}
          onOpenChange={setComparing}
          build={row}
          rows={rows}
          performance={performanceById}
        />
      )}
    </Panel>
  );
}
