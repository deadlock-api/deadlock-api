import { useMemo } from "react";

import { HeroSelectionGrid } from "~/components/selectors/HeroSelector";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/** Compact portrait roster for chart sidebars. */
export function ChartHeroSelector({
  heroes,
  availableHeroIds,
  selectedHeroIds,
  onSelectionChange,
  onHeroHighlight,
  className,
}: {
  heroes: readonly { id: number; name: string }[];
  availableHeroIds: readonly number[];
  selectedHeroIds: readonly number[];
  onSelectionChange: (ids: number[]) => void;
  onHeroHighlight?: (id: number | null) => void;
  className?: string;
}) {
  const availableSet = useMemo(() => new Set(availableHeroIds), [availableHeroIds]);
  const visibleCount = selectedHeroIds.filter((id) => availableSet.has(id)).length;
  const disabledIds = useMemo(
    () => new Set(heroes.filter((hero) => !availableSet.has(hero.id)).map((hero) => hero.id)),
    [heroes, availableSet],
  );

  return (
    <section
      aria-label="Chart heroes"
      className={cn("flex min-h-0 min-w-0 flex-col gap-2 rounded-xl border bg-card p-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold">Heroes</h3>
          <p className="mt-1 text-xs text-muted-foreground">
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
      </div>
      <div className="max-h-64 min-h-0 scrollbar-thin [scrollbar-gutter:stable] overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:flex-1">
        <HeroSelectionGrid
          compact
          heroes={heroes}
          selectedHeroes={selectedHeroIds}
          disabledHeroIds={disabledIds}
          onHeroHighlight={onHeroHighlight}
          onHeroSelected={(id) =>
            onSelectionChange(
              selectedHeroIds.includes(id)
                ? selectedHeroIds.filter((heroId) => heroId !== id)
                : [...selectedHeroIds, id],
            )
          }
          className="grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1 lg:grid-cols-4"
        />
      </div>
    </section>
  );
}
