import { useMemo } from "react";

import { HeroSelectionGrid } from "~/components/domain/selectors/HeroSelector";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const NO_HEROES: readonly number[] = [];

/** Compact portrait roster for chart sidebars. */
export function ChartHeroSelector({
  heroes,
  availableHeroIds,
  value: valueProp,
  defaultValue = NO_HEROES,
  onValueChange,
  onHeroHighlight,
  className,
  ...props
}: Omit<React.ComponentProps<"section">, "defaultValue" | "children"> & {
  heroes: readonly { id: number; name: string }[];
  availableHeroIds: readonly number[];
  value?: readonly number[];
  defaultValue?: readonly number[];
  onValueChange?: (heroIds: number[]) => void;
  onHeroHighlight?: (id: number | null) => void;
}) {
  const [selectedHeroIds, onSelectionChange] = useControllableState<readonly number[]>({
    value: valueProp,
    defaultValue,
    onValueChange: onValueChange as ((heroIds: readonly number[]) => void) | undefined,
  });
  const availableSet = useMemo(() => new Set(availableHeroIds), [availableHeroIds]);
  const visibleCount = selectedHeroIds.filter((id) => availableSet.has(id)).length;
  const disabledIds = useMemo(
    () => new Set(heroes.filter((hero) => !availableSet.has(hero.id)).map((hero) => hero.id)),
    [heroes, availableSet],
  );

  return (
    <Card asChild size="sm" className={cn("min-h-0 gap-2", className)}>
      <section aria-label="Chart heroes" {...props}>
        <CardContent className="flex flex-wrap items-center gap-2">
          <div className="me-auto flex flex-col gap-1">
            <Heading>Heroes</Heading>
            <p className="text-xs text-muted-foreground">
              {visibleCount} / {availableHeroIds.length} selected
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={visibleCount === availableHeroIds.length}
              onClick={() => onSelectionChange([...availableHeroIds])}
            >
              Show all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selectedHeroIds.length === 0}
              onClick={() => onSelectionChange([])}
              aria-label="Clear selection"
            >
              Clear
            </Button>
          </div>
        </CardContent>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              SCROLLBAR_THIN,
              "max-h-64 min-h-0 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain pe-1 lg:max-h-none lg:flex-1",
            )}
          >
            <HeroSelectionGrid
              size="sm"
              heroes={heroes}
              value={selectedHeroIds}
              disabledHeroIds={disabledIds}
              onHeroHighlight={onHeroHighlight}
              onValueChange={onSelectionChange}
              className="grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1 lg:grid-cols-4"
            />
          </div>
        </CardContent>
      </section>
    </Card>
  );
}
