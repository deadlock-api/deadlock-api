import { cn } from "~/lib/utils";

import { FilterRootContext } from "./FilterCell";

export function Root({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full overflow-hidden rounded-xl border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.25)] lg:w-fit",
        className,
      )}
    >
      {/* Every cell draws a right and bottom hairline; pulling the grid 1px past the edge hides the outer ones. */}
      <div className="-mr-px -mb-px flex flex-wrap items-stretch">
        <FilterRootContext.Provider value={true}>{children}</FilterRootContext.Provider>
      </div>
    </div>
  );
}
