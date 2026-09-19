import type { ComponentProps } from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "~/lib/utils";

/** A consistent, compact plot surface; denser charts can opt into a taller viewport. */
export function ChartSurface({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ComponentProps<typeof ResponsiveContainer>["children"];
}) {
  return (
    <figure
      aria-label={label}
      className={cn("h-[280px] min-w-0 rounded-xl border bg-card p-2 select-none sm:h-[320px]", className)}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </figure>
  );
}
