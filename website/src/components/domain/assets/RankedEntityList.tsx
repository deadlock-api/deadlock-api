import { Children } from "react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { NoValue } from "~/components/ui/no-value";
import { ProgressBar } from "~/components/ui/progress-bar";
import { TONE_TEXT, type Tone } from "~/lib/tone";
import { cn } from "~/lib/utils";

/**
 * A short leaderboard of heroes or items (the best items of a hero, the best heroes for an item): one row per place,
 * in one column in a narrow container and two in a wide one. Rows are `RankedEntityRow`.
 */
export function RankedEntityList({ className, style, children, ...props }: React.ComponentProps<"div">) {
  // Two columns fill down, not across, so the ranks read 1-4 then 5-8 like a printed table.
  const rows = Math.ceil(Children.count(children) / 2);
  return (
    <div
      data-slot="ranked-entity-list"
      className={cn("@container", className)}
      style={{ "--ranked-rows": `repeat(${rows}, auto)`, ...style } as React.CSSProperties}
      {...props}
    >
      <ol className="grid gap-x-8 @3xl:grid-flow-col @3xl:grid-cols-2 @3xl:grid-rows-(--ranked-rows)">{children}</ol>
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
  entity: { heroId: number } | { itemId: number };
  /** A quiet line under the name: "1,204 matches". */
  meta?: React.ReactNode;
}) {
  return (
    <li
      data-slot="ranked-entity-row"
      className={cn("flex min-w-0 items-center gap-3 border-b border-hairline py-2.5", className)}
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
        <HeroImage heroId={entity.heroId} shape="circle" ring="border" title="" className="size-10 shrink-0" />
      ) : (
        <ItemImage itemId={entity.itemId} className="size-10 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {"heroId" in entity ? (
          <HeroName heroId={entity.heroId} linkToDetail className={NAME} />
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
 * which side of the pivot it is on.
 */
export function RankedEntityMetric({
  label,
  value,
  share,
  tone,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  /** 0 to 1: draws the value as a bar as well. */
  share?: number;
  tone?: Tone;
}) {
  return (
    <div
      data-slot="ranked-entity-metric"
      className={cn("flex w-12 flex-col items-end gap-1 @md:w-16", className)}
      {...props}
    >
      <dt className="order-2 type-caption text-muted-foreground">{label}</dt>
      <dd className="order-1 flex w-full flex-col items-end gap-1">
        <span className={cn("type-label tabular-nums", tone && TONE_TEXT[tone])}>{value ?? <NoValue />}</span>
        {/* Every metric keeps the bar's row, so the labels of a row line up whether or not a value has a bar. */}
        {share !== undefined ? (
          <ProgressBar variant="thin" value={share} color="var(--chart-share)" className="w-full" />
        ) : (
          <span aria-hidden="true" className="h-1.5" />
        )}
      </dd>
    </div>
  );
}
