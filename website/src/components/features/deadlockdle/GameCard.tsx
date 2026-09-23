import type { LucideIcon } from "lucide-react";

import { GameTile } from "~/components/domain/minigames/GameTile";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { getTodayDate } from "~/lib/deadlockdle/seed";
import { gameStorageKey } from "~/lib/deadlockdle/storage";
import type { GameMode } from "~/lib/deadlockdle/types";
import { readLocalStorage } from "~/lib/local-storage";

export type DailyStatus = "untouched" | "won" | "lost" | "playing";

interface GameCardProps {
  mode: GameMode;
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
  date: string;
  /** Today's progress, read from storage by the page once hydrated. */
  status?: DailyStatus;
}

export function getDailyStatus(mode: GameMode, date: string = getTodayDate()): DailyStatus {
  if (typeof window === "undefined") return "untouched";
  try {
    const raw = readLocalStorage(gameStorageKey(mode, date));
    if (!raw) return "untouched";
    const state = JSON.parse(raw);
    if (state.date !== date) return "untouched";

    if (state.status) return state.status;

    if ("completed" in state) {
      if (state.completed) return state.score >= 5 ? "won" : "lost";
      if (state.currentQuestion > 0) return "playing";
      return "untouched";
    }

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

export function getDailyResult(mode: GameMode, date: string = getTodayDate()): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readLocalStorage(gameStorageKey(mode, date));
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.date !== date) return null;

    if (state.status === "won") return null;
    if (state.status === "lost") return null;

    if ("completed" in state && state.completed) return `${state.score}/10`;

    if ("submitted" in state && state.submitted) return `${state.score}/${state.totalFields}`;

    return null;
  } catch {
    return null;
  }
}

const STATUS_BADGE = {
  untouched: null,
  playing: { label: "In Progress", variant: "warning" },
  won: { label: "Completed", variant: "positive" },
  lost: { label: "Failed", variant: "negative" },
} as const;

const STATUS_TONE = {
  untouched: "card",
  playing: "warning",
  won: "positive",
  lost: "negative",
} as const;

export function GameCard({ title, description, icon, path, date, status = "untouched" }: GameCardProps) {
  const badge = STATUS_BADGE[status];

  return (
    <GameTile
      to={path}
      search={date === getTodayDate() ? {} : { date }}
      title={title}
      description={description}
      icon={icon}
      tone={STATUS_TONE[status]}
      badge={
        badge && (
          <TerminalBadge variant={badge.variant} size="sm">
            {badge.label}
          </TerminalBadge>
        )
      }
    />
  );
}
