import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { Card } from "~/components/ui/card";
import { KeyValueList } from "~/components/ui/key-value";
import { cn } from "~/lib/utils";

/** A short leaderboard of heroes or items as cards: two across in a narrow container, four across in a wide one. */
export function RankedEntityGrid({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="ranked-entity-grid" className={cn("@container", className)} {...props}>
      <ol className="grid grid-cols-2 gap-3 @xl:grid-cols-4">{children}</ol>
    </div>
  );
}

/**
 * One place in a RankedEntityGrid: the rank, the hero or item with its name linked to its page, and the numbers that
 * earned the place as `KeyValue` children.
 */
export function RankedEntityCard({
  rank,
  entity,
  className,
  children,
  ...props
}: React.ComponentProps<"li"> & {
  /** 1-based. */
  rank: number;
  entity: { heroId: number } | { itemId: number };
}) {
  return (
    <li data-slot="ranked-entity-card" className={cn("flex", className)} {...props}>
      <Card size="xs" className="w-full items-center p-3 text-center">
        <span className="text-xs font-medium text-muted-foreground tabular-nums">#{rank}</span>
        {"heroId" in entity ? (
          <>
            <HeroImage heroId={entity.heroId} shape="circle" title="" className="size-12" />
            <HeroName
              heroId={entity.heroId}
              linkToDetail
              className="max-w-full text-sm leading-tight font-medium whitespace-normal"
            />
          </>
        ) : (
          <>
            <ItemImage itemId={entity.itemId} className="size-12" />
            <ItemName
              itemId={entity.itemId}
              linkToDetail
              className="max-w-full text-sm leading-tight font-medium whitespace-normal"
            />
          </>
        )}
        <KeyValueList variant="plain" className="mt-auto w-full text-start">
          {children}
        </KeyValueList>
      </Card>
    </li>
  );
}
