import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { cn } from "~/lib/utils";

import { getTodayDate } from "../lib/seed";
import type { GameMode } from "../lib/types";

export type DailyStatus = "untouched" | "won" | "lost" | "playing";

interface GameCardProps {
  mode: GameMode;
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
}

export function getDailyStatus(mode: GameMode): DailyStatus {
  try {
    const raw = localStorage.getItem(`deadlockdle:${mode}:game`);
    if (!raw) return "untouched";
    const state = JSON.parse(raw);
    if (state.date !== getTodayDate()) return "untouched";

    // Standard game modes use state.status (playing/won/lost)
    if (state.status) return state.status;

    // Trivia uses { completed: boolean, score, currentQuestion, answers[] }
    if ("completed" in state) {
      if (state.completed) return state.score >= 5 ? "won" : "lost";
      if (state.currentQuestion > 0) return "playing";
      return "untouched";
    }

    // Item Stats uses { submitted: boolean, score, totalFields }
    if ("submitted" in state) {
      if (state.submitted) return state.score >= state.totalFields * 0.5 ? "won" : "lost";
      if (Object.keys(state.answers ?? {}).length > 0) return "playing";
      return "untouched";
    }

    return "untouched";
  } catch {
    return "untouched";
  }
}

/** Get a short result label for share text */
export function getDailyResult(mode: GameMode): string | null {
  try {
    const raw = localStorage.getItem(`deadlockdle:${mode}:game`);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.date !== getTodayDate()) return null;

    // Standard game modes: only show detail for failures
    if (state.status === "won") return null;
    if (state.status === "lost") return null;

    // Trivia: score/10
    if ("completed" in state && state.completed) return `${state.score}/10`;

    // Item Stats: score/totalFields
    if ("submitted" in state && state.submitted) return `${state.score}/${state.totalFields}`;

    return null;
  } catch {
    return null;
  }
}

const STATUS_BADGE = {
  untouched: null,
  playing: { label: "In Progress", className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" },
  won: { label: "Completed", className: "border-green-500/30 bg-green-500/10 text-green-400" },
  lost: { label: "Failed", className: "border-primary/30 bg-primary/10 text-primary" },
} as const;

const STATUS_BORDER = {
  untouched: "border-border hover:border-primary/30",
  playing: "border-yellow-500/20 hover:border-yellow-500/40",
  won: "border-green-500/20 hover:border-green-500/40",
  lost: "border-primary/20 hover:border-primary/40",
} as const;

export function GameCard({ mode, title, description, icon: Icon, path }: GameCardProps) {
  const status = useMemo(() => getDailyStatus(mode), [mode]);
  const badge = STATUS_BADGE[status];

  return (
    <Link to={path} prefetch="intent" className="cursor-target group block h-full">
      <div
        className={cn(
          "flex h-full flex-col border bg-card p-4 transition-colors hover:bg-muted/30",
          STATUS_BORDER[status],
        )}
      >
        <div className="mb-2 flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center border border-border bg-muted transition-colors group-hover:border-primary/20 group-hover:bg-primary/5">
            <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="flex items-center gap-1 text-xs font-medium text-primary/80 transition-colors group-hover:text-primary">
            Play
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
          {badge && (
            <span className={cn("border px-2 py-0.5 text-[10px] font-medium", badge.className)}>{badge.label}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
