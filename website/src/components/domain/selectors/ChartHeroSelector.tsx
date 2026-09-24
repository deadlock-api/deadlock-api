import { useMemo } from "react";

import { HeroGrid, HeroGridTile } from "~/components/domain/selectors/HeroGrid";
import { useHeroPicker } from "~/components/domain/selectors/useHeroPicker";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
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
  const availableSet = useMemo(() => new Set(availableHeroIds), [availableHeroIds]);
  const disabledHeroIds = useMemo(
    () => new Set(heroes.filter((hero) => !availableSet.has(hero.id)).map((hero) => hero.id)),
    [heroes, availableSet],
  );
  const picker = useHeroPicker({
    selection: "multiple",
    heroes,
    value: valueProp,
    defaultValue,
    onValueChange,
    disabledHeroIds,
  });
  const selectedHeroIds = picker.value as readonly number[];
  const visibleCount = selectedHeroIds.filter((id) => availableSet.has(id)).length;
  const highlight = (heroId: number | null) => onHeroHighlight?.(heroId);

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
              onClick={() => picker.setSelection([...availableHeroIds])}
            >
              Show all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={selectedHeroIds.length === 0}
              onClick={() => picker.setSelection([])}
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
            <HeroGrid picker={picker} size="sm" aria-label="Heroes to draw">
              {picker.matches.map((hero) => (
                <HeroGridTile
                  key={hero.id}
                  hero={hero}
                  title={availableSet.has(hero.id) ? undefined : `${hero.name}: no data for these filters`}
                  onMouseEnter={() => highlight(hero.id)}
                  onMouseLeave={() => highlight(null)}
                  onFocus={() => highlight(hero.id)}
                  onBlur={() => highlight(null)}
                />
              ))}
            </HeroGrid>
          </div>
        </CardContent>
      </section>
    </Card>
  );
}
