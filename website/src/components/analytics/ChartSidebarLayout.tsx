import type { ReactNode } from "react";

/** Keep the chart in charge of height, with a scrollable 18rem selector alongside it on wide screens. */
export function ChartSidebarLayout({ children, sidebar }: { children: ReactNode; sidebar: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">{children}</div>
      <div className="relative min-h-0 min-w-0 lg:[&>*]:absolute lg:[&>*]:inset-0">{sidebar}</div>
    </div>
  );
}
