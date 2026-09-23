import type { LucideIcon } from "lucide-react";

import { GameTile } from "~/components/domain/minigames/GameTile";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { getTodayDate } from "~/lib/deadlockdle/seed";
import { readStoredGame } from "~/lib/deadlockdle/storage";
import type { GameMode } from "~/lib/deadlockdle/types";

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

/** The fields the hub reads from any game's saved state (guess games, trivia, item stats). */
interface StoredGame {
  status?: DailyStatus;
  completed?: boolean;
  currentQuestion?: number;
  submitted?: boolean;
  answers?: Record<string, unknown>;
  score?: number;
  totalFields?: number;
}

function readGame(mode: GameMode, date: string): StoredGame | null {
  if (typeof window === "undefined") return null;
  return readStoredGame(mode, date) as StoredGame | null;
}

export function getDailyStatus(mode: GameMode, date: string = getTodayDate()): DailyStatus {
  const state = readGame(mode, date);
  if (!state) return "untouched";
  if (state.status) return state.status;

  if (state.completed !== undefined) {
    if (state.completed) return (state.score ?? 0) >= 5 ? "won" : "lost";
    return (state.currentQuestion ?? 0) > 0 ? "playing" : "untouched";
  }

  if (state.submitted !== undefined) {
    if (state.submitted) return (state.score ?? 0) >= (state.totalFields ?? 0) * 0.5 ? "won" : "lost";
    return Object.keys(state.answers ?? {}).length > 0 ? "playing" : "untouched";
  }

  return "untouched";
}

export function getDailyResult(mode: GameMode, date: string = getTodayDate()): string | null {
  const state = readGame(mode, date);
  if (!state || state.status === "won" || state.status === "lost") return null;
  if (state.completed) return `${state.score}/10`;
  if (state.submitted) return `${state.score}/${state.totalFields}`;
  return null;
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
