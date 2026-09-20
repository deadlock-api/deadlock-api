import { Panel, PanelBody } from "~/components/patterns/panel/Panel";
import { SkeletonMediaRow, SkeletonRows, SkeletonStatTiles } from "~/components/patterns/states/Skeletons";
import { Skeleton } from "~/components/ui/skeleton";

/** Mirrors the overview's columns while the first match-history request is in flight. */
export function OverviewSkeleton() {
  return (
    <div className="@container/matches flex flex-col gap-3">
      <output className="text-sm text-muted-foreground">Loading match history…</output>
      <div
        aria-hidden="true"
        className="grid items-start gap-4 @5xl/matches:grid-cols-[17rem_minmax(0,1fr)] @7xl/matches:grid-cols-[19rem_minmax(0,1fr)]"
      >
        <Panel className="hidden @5xl/matches:flex">
          <PanelBody size="sm" className="flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-full" />
            <SkeletonMediaRow rows={10} variant="divided" />
          </PanelBody>
        </Panel>
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <SkeletonStatTiles count={6} />
          <div className="@container/overview">
            <div className="grid gap-2 @xl/overview:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Panel key={index}>
                  <PanelBody size="sm">
                    <SkeletonRows rows={4} size="xs" variant="solid" />
                  </PanelBody>
                </Panel>
              ))}
            </div>
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
