import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

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
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mx-auto max-w-5xl px-4 py-8"
    >
      <div className="mb-6">
        <Link
          to="/deadlockdle"
          search={isArchive ? { date } : {}}
          className="cursor-target mb-4 inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground/50 uppercase transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Hub
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text font-game text-2xl tracking-tight text-transparent uppercase">
            {title}
          </h1>
          {isArchive && (
            <span className="border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-amber-400 uppercase">
              Archive · Day {getDayNumber(date)} · {day(date).format("MMM D, YYYY")}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 font-mono text-sm text-muted-foreground/60">{subtitle}</p>}

        {!hideAttempts && (
          <div className="mt-3">
            <AttemptsIndicator total={totalAttempts} used={usedAttempts} status={status} />
          </div>
        )}
      </div>

      <div className="space-y-6">{children}</div>
    </motion.div>
  );
}
