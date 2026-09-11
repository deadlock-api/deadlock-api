import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { FormResult, TrackerHeroRow } from "~/lib/tracker/compute";

import { FormDots } from "../shared/FormDots";

export function TopHeroesCard({
  rows,
  formByHero,
  onSelectHero,
}: {
  rows: TrackerHeroRow[];
  formByHero: Map<number, FormResult[]>;
  onSelectHero: (heroId: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top heroes</CardTitle>
        <CardDescription>Your most played heroes in the selected range</CardDescription>
      </CardHeader>
      <CardContent className="@container space-y-1">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No matches yet.</div>}
        {rows.map((row) => (
          <button
            key={row.heroId}
            type="button"
            onClick={() => onSelectHero(row.heroId)}
            className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
            title="Show this hero's matches"
          >
            <HeroImage heroId={row.heroId} className="size-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <HeroName heroId={row.heroId} className="block truncate text-sm font-medium" />
              <span className="block truncate text-xs text-muted-foreground tabular-nums">
                {row.matches} {row.matches === 1 ? "match" : "matches"} · {row.wins}W – {row.losses}L
              </span>
            </div>
            <FormDots form={formByHero.get(row.heroId) ?? []} className="hidden @sm:flex" />
            <div className="w-14 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
              {row.kdaRatio.toFixed(2)}
              <span className="ml-1 text-xs">KDA</span>
            </div>
            <div className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums">
              {(row.winrate * 100).toFixed(0)}%
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
