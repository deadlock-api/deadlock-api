import { Skeleton } from "~/components/ui/skeleton";
import { Stat, StatGroup } from "~/components/ui/stat";
import { cn } from "~/lib/utils";

interface SkeletonLayoutProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** What is loading, announced once: "companions". Leave out when a parent already announces it. */
  label?: string;
}

function SkeletonLayout({ label, className, children, ...props }: SkeletonLayoutProps & { children: React.ReactNode }) {
  return (
    <div className={cn("motion-reduce:[&_[data-slot=skeleton]]:animate-none", className)} {...props}>
      {label && <output className="sr-only">Loading {label}</output>}
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

const ROW_HEIGHT = { xs: "h-4", sm: "h-6", default: "h-8" };
const FADE = ["opacity-100", "opacity-90", "opacity-80", "opacity-70", "opacity-60", "opacity-50", "opacity-40"];

/** Stand-in for a list or a table body: full-width bars that fade out towards the bottom. */
export function SkeletonRows({
  rows = 5,
  size = "default",
  variant = "fade",
  className,
  ...props
}: SkeletonLayoutProps & {
  rows?: number;
  size?: keyof typeof ROW_HEIGHT;
  /** `fade` dims the rows towards the bottom, for a list of unknown length; `solid` is for a known count. */
  variant?: "fade" | "solid";
}) {
  return (
    <SkeletonLayout data-slot="skeleton-rows" className={cn("flex flex-col gap-2", className)} {...props}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("w-full", ROW_HEIGHT[size], variant === "fade" && FADE[Math.floor((i / rows) * FADE.length)])}
        />
      ))}
    </SkeletonLayout>
  );
}

/** Stand-in for a list of people or entities: an avatar and two lines of text per row. */
export function SkeletonMediaRow({ rows = 1, className, ...props }: SkeletonLayoutProps & { rows?: number }) {
  return (
    <SkeletonLayout data-slot="skeleton-media-row" className={cn("flex flex-col divide-y", className)} {...props}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </SkeletonLayout>
  );
}

/** Stand-in for a `StatGroup variant="joined"`: label, value and hint per tile, in the same stepping grid. */
export function SkeletonStatTiles({ count = 4, className, ...props }: SkeletonLayoutProps & { count?: number }) {
  return (
    <SkeletonLayout data-slot="skeleton-stat-tiles" className={cn("@container", className)} {...props}>
      <StatGroup variant="joined" size="sm" className="grid-cols-2 @xs:grid-cols-3 @3xl:grid-cols-6">
        {Array.from({ length: count }, (_, i) => (
          <Stat
            key={i}
            className="gap-2"
            label={<Skeleton className="h-3 w-16" />}
            value={<Skeleton className="h-6 w-20" />}
            sub={<Skeleton className="h-3 w-full" />}
          />
        ))}
      </StatGroup>
    </SkeletonLayout>
  );
}
