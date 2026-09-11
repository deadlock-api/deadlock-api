import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export function DashboardPanel({
  title,
  icon: Icon,
  meta,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 gap-0 overflow-hidden rounded-lg py-0", className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-3 py-2">
        <CardTitle>
          <h3 className="flex items-center gap-2 text-xs">
            <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
            {title}
          </h3>
        </CardTitle>
        {meta && <div className="text-[10px] text-muted-foreground tabular-nums">{meta}</div>}
      </CardHeader>
      <CardContent className="px-3 pb-2">{children}</CardContent>
    </Card>
  );
}

export function MetricRows({ rows }: { rows: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-border/60">
      {rows.map(({ label, value, hint }) => (
        <div key={label} className="flex items-center justify-between gap-2 py-1 text-xs" title={hint}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RateBar({ wins, matches }: { wins: number; matches: number }) {
  const rate = matches > 0 ? wins / matches : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-victory" style={{ width: `${rate * 100}%` }} />
    </div>
  );
}
