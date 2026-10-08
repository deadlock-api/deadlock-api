import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Delta } from "~/components/ui/delta";
import { formatPercent } from "~/lib/format";
import type { EntityChange } from "~/lib/patch-deltas";
import type { SlimUpgrade } from "~/queries/asset-queries";

type Mover = EntityChange & { item?: SlimUpgrade };

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "Win rate" for heroes (ranked by its change), "In builds" for items (ranked by their change in builds). */
const METRICS = {
  winRate: { change: "Change", value: "Win rate" },
  pickRate: { change: "Change", value: "In builds" },
} as const;

/**
 * One side of a patch's biggest changes: the heroes or items that gained, or lost, the most. The first row labels the
 * numbers; the rest stay one line tall.
 */
export function PatchMoverPanel({
  title,
  movers,
  metric,
}: {
  title: string;
  movers: readonly Mover[];
  /** Which change ranked them: a hero's win rate, or an item's share of builds. */
  metric: keyof typeof METRICS;
}) {
  const labels = METRICS[metric];
  return (
    <Panel>
      <PanelHeader title={title} size="sm" />
      <PanelBody className="flex-1">
        {movers.length === 0 ? (
          <EmptyState variant="inline" title="No change big enough to list" />
        ) : (
          <RankedEntityList density="compact">
            {movers.map((mover, index) => {
              const labelDisplay = index === 0 ? "visible" : "hidden";
              return (
                <RankedEntityRow
                  key={mover.id}
                  rank={index + 1}
                  entity={mover.item ? { item: mover.item } : { heroId: mover.id }}
                  meta={`${COMPACT.format(mover.matches)} matches`}
                >
                  <RankedEntityMetric
                    label={labels.change}
                    labelDisplay={labelDisplay}
                    value={<Delta value={metric === "winRate" ? mover.winRateDelta : mover.pickRateDelta} unit=" pp" />}
                  />
                  <RankedEntityMetric
                    label={labels.value}
                    labelDisplay={labelDisplay}
                    value={formatPercent(metric === "winRate" ? mover.winRate : mover.pickRate)}
                  />
                </RankedEntityRow>
              );
            })}
          </RankedEntityList>
        )}
      </PanelBody>
    </Panel>
  );
}
