import { cn } from "~/lib/utils";

import { FilterDescriptionProvider } from "./FilterDescription";

export function Root({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto flex w-fit flex-wrap items-center justify-center gap-2",
        "rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-3.5",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_8px_rgba(0,0,0,0.25)]",
        className,
      )}
    >
      <FilterDescriptionProvider>{children}</FilterDescriptionProvider>
    </div>
  );
}
