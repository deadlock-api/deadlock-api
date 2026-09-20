import { GamePage } from "~/components/domain/minigames/GamePage";
import { TerminalBadge } from "~/components/domain/minigames/TerminalBadge";
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
