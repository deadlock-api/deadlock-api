import { RankedEntityList, RankedEntityMetric, RankedEntityRow } from "~/components/domain/assets/RankedEntityList";
import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Delta } from "~/components/ui/delta";
import { TooltipStat, TooltipStats } from "~/components/ui/tooltip";
import { formatPercent } from "~/lib/format";
import type { EntityChange } from "~/lib/patch-deltas";
import type { SlimUpgrade } from "~/queries/asset-queries";

type Mover = EntityChange & { item?: SlimUpgrade };

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Heroes are ranked by their win rate change, items by their change in builds. */
const METRICS = {
  winRate: { delta: "winRateDelta", se: "winRateSE", value: "winRate", label: "Win rate" },
  pickRate: { delta: "pickRateDelta", se: "pickRateSE", value: "pickRate", label: "In builds" },
} as const;

/** Rows a panel lists, so the heroes and the items side by side stay about as tall. */
const MAX_ROWS = 6;

/** z of a 95% interval. */
const Z = 1.96;

/** A change in points, signed: "+5.4 pp". */
function points(delta: number): string {
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta * 100).toFixed(1)} pp`;
}

/** The numbers behind a row's bar: its value on both sides of the patch, the change with its 95% range, the sample. */
function MoverDetails({
  mover,
  metric,
  delta,
  se,
}: {
  mover: Mover;
  metric: keyof typeof METRICS;
  delta: number;
  se: number;
}) {
  const keys = METRICS[metric];
  const after = mover[keys.value];
  return (
    <TooltipStats variant="plain">
      <TooltipStat label={`${keys.label} before`} value={formatPercent(after - delta)} />
      <TooltipStat label={`${keys.label} after`} value={formatPercent(after)} />
      <TooltipStat label="Change" value={points(delta)} />
      <TooltipStat label="95% range" value={`${points(delta - Z * se)} to ${points(delta + Z * se)}`} />
      <TooltipStat
        label="Matches before, after"
        value={`${COMPACT.format(mover.prevMatches)}, ${COMPACT.format(mover.matches)}`}
      />
    </TooltipStats>
  );
}

/**
 * What a patch moved most, heroes or items, in one list: the biggest gains on top and the biggest drops at the bottom,
 * each with its change drawn from the middle of a bar (with the uncertainty around it) so its size and sign read at a
 * glance. One panel holds both ends, so a patch with a single gainer and four losers is still one balanced list.
 * `action` is the way on to the full analytics view.
 */
export function PatchMoverPanel({
  title,
  gains,
  drops,
  metric,
  action,
  className,
}: {
  title: string;
  gains: readonly Mover[];
  drops: readonly Mover[];
  /** Which change ranked them: a hero's win rate, or an item's share of builds. */
  metric: keyof typeof METRICS;
  action?: React.ReactNode;
  className?: string;
}) {
  const keys = METRICS[metric];
  const rows = [...gains, ...drops]
    .flatMap((mover) => {
      const delta = mover[keys.delta];
      return delta === null ? [] : [{ mover, delta, se: mover[keys.se] ?? 0 }];
    })
    // The biggest changes by size, so one end of a lopsided patch does not crowd out the other; shown gains first.
    .toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MAX_ROWS)
    .toSorted((a, b) => b.delta - a.delta);
  // One scale for the whole list, so the bars compare: the longest change with its interval reaches the edge.
  const scale = Math.max(...rows.map(({ delta, se }) => Math.abs(delta) + Z * se), 0.001);
  return (
    <Panel className={className}>
      <PanelHeader title={title} size="sm">
        {action}
      </PanelHeader>
      <PanelBody>
        <RankedEntityList density="compact" columns="single">
          {rows.map(({ mover, delta, se }, index) => (
            <RankedEntityRow
              key={mover.id}
              rank={index + 1}
              entity={mover.item ? { item: mover.item } : { heroId: mover.id }}
              meta={`${COMPACT.format(mover.matches)} matches`}
            >
              <RankedEntityMetric
                label="Change"
                labelDisplay={index === 0 ? "visible" : "hidden"}
                className="@md:w-32"
                value={<Delta value={delta} unit=" pp" />}
                change={{ value: delta, scale, interval: [delta - Z * se, delta + Z * se] }}
                details={<MoverDetails mover={mover} metric={metric} delta={delta} se={se} />}
              />
              <RankedEntityMetric
                label={keys.label}
                labelDisplay={index === 0 ? "visible" : "hidden"}
                value={formatPercent(mover[keys.value])}
              />
            </RankedEntityRow>
          ))}
        </RankedEntityList>
      </PanelBody>
    </Panel>
  );
}
