import { GamePage } from "~/components/domain/minigames/GamePage";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { day } from "~/dayjs";
import { getDayNumber, getTodayDate } from "~/lib/deadlockdle/seed";

import { AttemptsIndicator } from "./AttemptsIndicator";

interface GameShellProps {
  title: string;
  subtitle?: string;
  totalAttempts: number;
  usedAttempts: number;
  status: "playing" | "won" | "lost";
  children: React.ReactNode;
  hideAttempts?: boolean;
  date?: string;
}

export function GameShell({
  title,
  subtitle,
  totalAttempts,
  usedAttempts,
  status,
  children,
  hideAttempts,
  date,
}: GameShellProps) {
  const isArchive = date != null && date !== getTodayDate();

  return (
    <GamePage
      title={title}
      subtitle={subtitle}
      hub="/games/deadlockdle"
      hubSearch={isArchive ? { date } : {}}
      badge={
        isArchive && (
          <TerminalBadge variant="warning" size="sm">
            Archive · Day {getDayNumber(date)} · {day(date).format("MMM D, YYYY")}
          </TerminalBadge>
        )
      }
    >
      {!hideAttempts && <AttemptsIndicator total={totalAttempts} used={usedAttempts} status={status} />}
      {children}
    </GamePage>
  );
}

/** The page chrome while the puzzle's data loads, so the server-rendered page already carries its title. */
export function GameShellLoading({ title, subtitle, date }: Pick<GameShellProps, "title" | "subtitle" | "date">) {
  return (
    <GameShell
      title={title}
      subtitle={subtitle}
      date={date}
      status="playing"
      totalAttempts={0}
      usedAttempts={0}
      hideAttempts
    >
      <LoadingState label="puzzle" />
    </GameShell>
  );
}

/** The page chrome when the puzzle's data failed to load, so the page offers a retry instead of loading forever. */
export function GameShellError({
  title,
  subtitle,
  date,
  onRetry,
  retrying,
}: Pick<GameShellProps, "title" | "subtitle" | "date"> & { onRetry: () => void; retrying: boolean }) {
  return (
    <GameShell
      title={title}
      subtitle={subtitle}
      date={date}
      status="playing"
      totalAttempts={0}
      usedAttempts={0}
      hideAttempts
    >
      <ErrorState
        title="Could not load today's puzzle"
        description="Your progress is saved. Try loading the puzzle again."
        onRetry={onRetry}
        retrying={retrying}
      />
    </GameShell>
  );
}
