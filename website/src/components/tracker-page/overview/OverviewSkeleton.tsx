import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

/** Mirrors the overview's columns while the first match-history request is in flight. */
export function OverviewSkeleton() {
  return (
    <div className="@container/matches flex flex-col gap-3 motion-reduce:[&_[data-slot=skeleton]]:animate-none">
      <output className="text-sm text-muted-foreground">Loading match history…</output>
      <div
        aria-hidden="true"
        className="grid items-start gap-4 @5xl/matches:grid-cols-[17rem_minmax(0,1fr)] @7xl/matches:grid-cols-[19rem_minmax(0,1fr)]"
      >
        <Card className="hidden gap-0 py-0 @5xl/matches:flex">
          <CardHeader className="gap-3 border-b px-3 py-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-full" />
          </CardHeader>
          <CardContent className="flex flex-col divide-y px-3 pb-2">
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="@container/overview flex min-w-0 flex-col gap-2">
          <Skeleton className="mb-1 h-7 w-40" />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border @xs/overview:grid-cols-3 @3xl/overview:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2 bg-card px-3 py-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
          <div className="grid gap-2 @xl/overview:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} className="gap-0 py-0">
                <CardHeader className="px-3 py-3">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="flex flex-col gap-3 px-3 pb-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="gap-0 py-0">
            <CardHeader className="px-3 py-3">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
