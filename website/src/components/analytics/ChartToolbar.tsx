import { ChartNoAxesCombined } from "lucide-react";
import type { ReactNode } from "react";

/** Shared compact toolbar for chart metrics, axes, and intervals. */
export function ChartToolbar({
  title,
  children,
  label = "Chart controls",
}: {
  title: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2"
    >
      <div className="sr-only sm:not-sr-only sm:mr-auto sm:flex sm:items-center sm:gap-2">
        <ChartNoAxesCombined className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}
