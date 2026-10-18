import { motion } from "framer-motion";

import { cn } from "~/lib/utils";

interface Hint {
  label: string;
  value: string | React.ReactNode;
}

interface HintRevealProps {
  hints: Hint[];
  revealedCount: number;
  className?: string;
}

/**
 * The hints of a guessing round, one per wrong guess. Every hint is laid out from the start: a locked one shows its
 * label and a placeholder over its value, which is laid out invisibly, so a reveal only swaps text and never moves the
 * guess field under it.
 */
export function HintReveal({ hints, revealedCount, className }: HintRevealProps) {
  return (
    <dl data-slot="hint-reveal" className={cn("flex flex-col gap-2", className)}>
      {hints.map((hint, i) => {
        const revealed = i < revealedCount;
        return (
          <div
            key={hint.label}
            data-state={revealed ? "revealed" : "locked"}
            className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2"
          >
            <dt className="shrink-0 font-mono eyebrow">[{hint.label}]</dt>
            <dd className="grid text-xs text-foreground sm:text-sm">
              <motion.span
                key={revealed ? "revealed" : "locked"}
                initial={revealed ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                className={cn("col-start-1 row-start-1", !revealed && "invisible")}
              >
                {hint.value}
              </motion.span>
              {!revealed && (
                <span className="col-start-1 row-start-1 font-mono text-muted-foreground">
                  <span aria-hidden="true">???</span>
                  <span className="sr-only">Locked</span>
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
