import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

interface ChartSidebarLayoutProps extends React.ComponentProps<"div"> {
  sidebar: ReactNode;
}

/** Keep the chart in charge of height, with a scrollable 18rem selector alongside it when the layout is wide enough. */
export function ChartSidebarLayout({ children, sidebar, className, ...props }: ChartSidebarLayoutProps) {
  return (
    <div data-slot="chart-sidebar-layout" className={cn("@container min-w-0", className)} {...props}>
      <div className="grid min-w-0 gap-3 @3xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">{children}</div>
        <div className="relative min-h-0 min-w-0 @3xl:*:absolute @3xl:*:inset-0">{sidebar}</div>
      </div>
    </div>
  );
}
