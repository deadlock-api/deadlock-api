import type { ReactNode } from "react";

import { CoachIcon } from "~/lib/coach/icons";
import type { Tone } from "~/lib/coach/report";
import { toneColor } from "~/lib/coach/tones";
import { cn } from "~/lib/utils";

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function BlockHeading({
  title,
  subtitle,
  icon,
  className,
  action,
}: {
  title?: string | null;
  subtitle?: string | null;
  icon?: string | null;
  className?: string;
  action?: ReactNode;
}) {
  if (!title && !subtitle && !action) return null;
  return (
    <div className={cn("mb-3 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {title ? (
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            {icon ? <CoachIcon name={icon} className="size-4 text-muted-foreground" /> : null}
            {title}
          </h3>
        ) : null}
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

// Compact inline trend line for a stat card.
export function Sparkline({ values, tone = "accent" }: { values: number[]; tone?: Tone }) {
  if (values.length < 2) return null;
  const w = 64;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = toneColor(tone);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A consistent card surface used by most data blocks.
export function CoachCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 shadow-sm backdrop-blur-sm", className)}
    >
      {children}
    </div>
  );
}
