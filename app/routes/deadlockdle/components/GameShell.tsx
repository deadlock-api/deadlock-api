import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";

import { AttemptsIndicator } from "./AttemptsIndicator";

interface GameShellProps {
  title: string;
  subtitle?: string;
  totalAttempts: number;
  usedAttempts: number;
  status: "playing" | "won" | "lost";
  children: React.ReactNode;
  hideAttempts?: boolean;
}

export function GameShell({
  title,
  subtitle,
  totalAttempts,
  usedAttempts,
  status,
  children,
  hideAttempts,
}: GameShellProps) {
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
          className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground/50 uppercase transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Hub
        </Link>

        <h1 className="bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text font-game text-2xl tracking-tight text-transparent uppercase">
          {title}
        </h1>
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
