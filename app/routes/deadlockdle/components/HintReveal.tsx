import { AnimatePresence, motion } from "framer-motion";
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

export function HintReveal({ hints, revealedCount, className }: HintRevealProps) {
  const visibleHints = hints.slice(0, revealedCount);

  return (
    <div className={cn("space-y-2", className)}>
      <AnimatePresence mode="popLayout">
        {visibleHints.map((hint, i) => (
          <motion.div
            key={hint.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i === revealedCount - 1 ? 0.1 : 0 }}
            className="flex items-baseline gap-2 text-sm"
          >
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary/60 shrink-0">
              [{hint.label}]
            </span>
            <span className="text-foreground/80">{hint.value}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
