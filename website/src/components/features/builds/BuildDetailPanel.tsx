import { GitCompareArrows, Hammer } from "lucide-react";
import { useState } from "react";

import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { useBuildItemUsage, useSkillOrder } from "~/components/features/builds/build-hooks";
import { BuildCompareDialog } from "~/components/features/builds/BuildCompareDialog";
import { BuildItemTile } from "~/components/features/builds/BuildItemTile";
import { Panel, PanelHeader, PanelScrollArea, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { CopyButton } from "~/components/ui/copy-button";
import { InfoTip } from "~/components/ui/info-tip";
import { day } from "~/dayjs";
import type { BuildPerformanceTotals } from "~/lib/build-performance";
import { type BuildRow, buildCategoryName, buildLanguageName } from "~/lib/build-stats";
import { formatPercent } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { BuildPurchaseFilters } from "~/queries/hero-build-stats-query";
import type { SteamProfile } from "~/queries/steam-queries";

/**
 * A category's name, and what its author wrote about it behind an info mark. A long name wraps to a second line
 * instead of being cut: authors put what to do in it ("Ordered of importance, buy what you need").
 */
function CategoryTitle({ name, description }: { name: string; description: string | null }) {
  if (!description) return <span className="whitespace-normal">{name}</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 whitespace-normal">
      <span className="min-w-0">{name}</span>
      <InfoTip label={`About ${name}`} content={description} />
    </span>
  );
}

/** One build as written: who made it, the items of each of its categories and its skill order. */
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
    <Panel className={cn("flex flex-col", className)}>
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
        {/* Named, not an icon alone: comparing two builds is the way into the details for those who want them. */}
        {rows.length > 1 && (
          <Button variant="ghost" size="xs" className="ms-auto" onClick={() => setComparing(true)}>
            <GitCompareArrows aria-hidden="true" />
            Compare
          </Button>
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
      <PanelScrollArea className="@container relative">
        {meta ? (
          <>
            {/* Two columns of groups once the panel is wide enough, so more of the build shows without a scroll. Each
                group spans a name row and an icon row of the grid, so a name that wraps lowers its neighbour's icons
                with its own and the two rows of icons stay level. */}
            <div className="grid @md:grid-cols-2">
              {meta.categories
                .filter((category) => category.itemIds.length > 0)
                .map((category, index) => (
                  <section
                    key={`${category.name}|${category.itemIds.join()}`}
                    className="row-span-2 grid grid-rows-subgrid"
                  >
                    <PanelSection
                      variant="label"
                      className="self-end"
                      title={
                        <CategoryTitle
                          name={buildCategoryName(category.name) ?? "Items"}
                          description={category.description}
                        />
                      }
                    >
                      {/* What the numbers under the icons are, named once over the first group. It takes the room
                          the group's name leaves and wraps in it, so a narrow column breaks this line rather than
                          "Early Game". */}
                      {index === 0 && <span className="min-w-0 grow basis-0 text-end">Bought in % of matches</span>}
                    </PanelSection>
                    <ul className="flex flex-wrap content-start gap-1 px-3 py-1.5">
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
            {/* There from the first paint where the build has an order: while the hero's abilities load, the grid
                waits at its final size, so the panel (and the row it sets the height of) does not grow. */}
            {(slotAbilities.length > 0 ? skillOrder.length > 0 : meta.abilityOrder.length > 0) && (
              <section className="flex flex-col">
                <PanelSection variant="label" title="Skill order" />
                <div className="px-3 py-1.5">
                  <AbilityOrderGrid
                    size="sm"
                    loading={slotAbilities.length === 0}
                    abilityIds={slotAbilities}
                    steps={(slotAbilities.length > 0 ? skillOrder : meta.abilityOrder).map((abilityId) => ({
                      abilityId,
                    }))}
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
      </PanelScrollArea>
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
