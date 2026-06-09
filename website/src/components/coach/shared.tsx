import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useRef } from "react";

import { CoachIcon } from "~/lib/coach/icons";
import type { Evidence, Tone } from "~/lib/coach/report";
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

// Lets evidence chips jump the report's replay to a moment. Replay blocks
// register a seek handler; a chip's click asks each handler in turn (a clip
// replay declines moments outside its window).
type ReplaySeekHandler = (t: number) => boolean;

const ReplaySeekContext = createContext<{
  register: (fn: ReplaySeekHandler) => () => void;
  seek: (t: number) => boolean;
} | null>(null);

export function ReplaySeekProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<Set<ReplaySeekHandler>>(new Set());
  const value = useMemo(
    () => ({
      register: (fn: ReplaySeekHandler) => {
        handlers.current.add(fn);
        return () => {
          handlers.current.delete(fn);
        };
      },
      seek: (t: number) => {
        for (const fn of handlers.current) {
          if (fn(t)) return true;
        }
        return false;
      },
    }),
    [],
  );
  return <ReplaySeekContext.Provider value={value}>{children}</ReplaySeekContext.Provider>;
}

export function useReplaySeek() {
  return useContext(ReplaySeekContext);
}

// "Where does this number come from" chip on stat cards and callouts.
// Clicking it (when the claim has a moment) seeks the report's replay there.
export function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const ctx = useReplaySeek();
  const window =
    evidence.t_start != null && evidence.t_end != null
      ? `${formatClock(evidence.t_start)}-${formatClock(evidence.t_end)}`
      : evidence.seek_t != null
        ? formatClock(evidence.seek_t)
        : null;
  const seekT = evidence.seek_t ?? evidence.t_start ?? null;
  const base =
    "mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-muted-foreground";
  const label = (
    <>
      <CoachIcon name="clock" className="size-2.5 shrink-0 opacity-70" />
      <span className="truncate">
        {evidence.source}
        {window ? ` · ${window}` : ""}
      </span>
    </>
  );
  if (ctx == null || seekT == null) {
    return <span className={base}>{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => ctx.seek(seekT)}
      className={cn(base, "transition hover:border-primary/40 hover:text-foreground")}
      title="View this moment on the replay"
    >
      {label}
      <CoachIcon name="play" className="size-2.5 shrink-0 text-primary" />
    </button>
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
