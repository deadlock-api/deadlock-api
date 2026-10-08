import { Children, cloneElement, isValidElement } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Tooltip, TooltipTarget } from "~/components/ui/tooltip";
import { TONE_TEXT, type Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";
import type { SlimUpgrade } from "~/queries/asset-queries";

/**
 * A short leaderboard of heroes or items (the best items of a hero, the best heroes for an item): one row per place,
 * in one column in a narrow container and two in a wide one. Rows are `RankedEntityRow`.
 */
export function RankedEntityList({
  density = "default",
  columns = "auto",
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** `compact`: smaller art and tighter rows, for several lists side by side on a dense page. */
  density?: "default" | "compact";
  /** `auto`: two columns in a wide container. `single`: always one, for a list in a panel that is not the page's width. */
  columns?: "auto" | "single";
}) {
  // Two columns fill down, not across, so the ranks read 1-4 then 5-8 like a printed table.
  const rows = columns === "single" ? Children.count(children) : Math.ceil(Children.count(children) / 2);
  // The last row of the first column, which ends its column in the two-column layout and so drops its rule.
  const items = Children.map(children, (child, index) =>
    index === rows - 1 && isValidElement<{ "data-column-end"?: boolean }>(child)
      ? cloneElement(child, { "data-column-end": true })
      : child,
  );
  return (
    <div
      data-slot="ranked-entity-list"
      data-density={density}
      className={cn("group/ranked @container", className)}
      style={{ "--ranked-rows": `repeat(${rows}, auto)`, ...style } as React.CSSProperties}
      {...props}
    >
      <ol
        className={cn(
          "grid gap-x-8",
          columns === "auto" && "@3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-(--ranked-rows)",
        )}
      >
        {items}
      </ol>
    </div>
  );
}

/** A long name ("Improved Bullet Armor") wraps to a second line rather than losing its end in a narrow row. */
const NAME = "line-clamp-2 max-w-full type-label whitespace-normal";

/**
 * One place in a RankedEntityList: the rank, the hero or item art, its name linked to its page with a `meta` line
 * under it (a sample size), and the numbers that earned the place as `RankedEntityMetric` children.
 */
export function RankedEntityRow({
  rank,
  entity,
  meta,
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  /** 1-based. */
  rank: number;
  /** An item the parent already holds (`item`) renders without the item list. */
  entity: { heroId: number } | { itemId: number } | { item: SlimUpgrade };
  /** A quiet line under the name: "1,204 matches". */
  meta?: React.ReactNode;
}) {
  return (
    <li
      data-slot="ranked-entity-row"
      className={cn(
        // No rule under the last row of a column: the panel's edge ends it.
        "flex min-w-0 items-center gap-3 border-b border-hairline py-2.5 group-data-[density=compact]/ranked:gap-2 group-data-[density=compact]/ranked:py-1.5 last:border-b-0 @3xl:data-column-end:border-b-0",
        className,
      )}
      {...props}
    >
      <span
        data-slot="ranked-entity-rank"
        className={cn(
          "w-5 shrink-0 text-center type-label tabular-nums",
          rank === 1 ? "text-primary" : "text-muted-foreground",
        )}
      >
        {rank}
      </span>
      {"heroId" in entity ? (
        <HeroImage
          heroId={entity.heroId}
          shape="circle"
          ring="border"
          title=""
          className="size-10 shrink-0 group-data-[density=compact]/ranked:size-8"
        />
      ) : "item" in entity ? (
        <ItemImage item={entity.item} className="size-10 shrink-0 group-data-[density=compact]/ranked:size-8" />
      ) : (
        <ItemImage itemId={entity.itemId} className="size-10 shrink-0 group-data-[density=compact]/ranked:size-8" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {"heroId" in entity ? (
          <HeroName heroId={entity.heroId} linkToDetail className={NAME} />
        ) : "item" in entity ? (
          <ItemName item={entity.item} linkToDetail className={NAME} />
        ) : (
          <ItemName itemId={entity.itemId} linkToDetail className={NAME} />
        )}
        {meta && <span className="truncate type-caption text-muted-foreground tabular-nums">{meta}</span>}
      </div>
      <dl className="flex shrink-0 items-start gap-2 @md:gap-4">{children}</dl>
    </li>
  );
}

/**
 * One number of a RankedEntityRow: the value over its label, and with `share` a thin bar under the value for a
 * number that is a part of a whole (how often it is bought). `tone` colors the value; the number itself still says
 * which side of the pivot it is on. With `change` the bar is signed: a gain right, a loss left. With `details` the value
 * opens a hover card.
 */
export function RankedEntityMetric({
  label,
  labelDisplay = "visible",
  value,
  share,
  change,
  details,
  tone,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  /**
   * `hidden` keeps the label for screen readers only: a list that labels its first row, so the rest stay one line
   * tall.
   */
  labelDisplay?: "visible" | "hidden";
  value: React.ReactNode;
  /** 0 to 1: draws the value as a bar as well. */
  share?: number;
  /** A signed value drawn from the middle of a thin track instead of a share: `scale` is where it reaches the edge. */
  change?: { value: number | null; scale: number; interval?: readonly [number, number] };
  /** What stands behind the number (the numbers before and after, the sample): a hover card on the value, reachable by keyboard. */
  details?: React.ReactNode;
  tone?: Tone;
}) {
  const body = (
    <>
      <span className={cn("type-label tabular-nums", tone && TONE_TEXT[tone])}>{value ?? <NoValue />}</span>
      {/* Every metric keeps the bar's row, so the labels of a row line up whether or not a value has a bar. */}
      {change ? (
        <DivergingBar value={change.value} scale={change.scale} interval={change.interval} className="w-full" />
      ) : share !== undefined ? (
        <ProgressBar variant="thin" value={share} color="var(--chart-share)" className="w-full" />
      ) : (
        <span aria-hidden="true" className="h-1.5 group-data-[density=compact]/ranked:hidden" />
      )}
    </>
  );
  return (
    <div
      data-slot="ranked-entity-metric"
      className={cn("flex w-12 flex-col items-end gap-1 @md:w-16", className)}
      {...props}
    >
      <dt className={cn("order-2 type-caption text-muted-foreground", labelDisplay === "hidden" && "sr-only")}>
        {label}
      </dt>
      <dd className="order-1 flex w-full flex-col items-end gap-1">
        {details ? (
          <Tooltip content={details}>
            <TooltipTarget display="block" className="flex w-full flex-col items-end gap-1">
              {body}
            </TooltipTarget>
          </Tooltip>
        ) : (
          body
        )}
      </dd>
    </div>
  );
}
