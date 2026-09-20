import { AnimatePresence, motion } from "framer-motion";

import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

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
    <Stack gap={2} className={className}>
      <AnimatePresence mode="popLayout">
        {visibleHints.map((hint, i) => (
          <motion.div
            key={hint.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i === revealedCount - 1 ? 0.1 : 0 }}
            className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2"
          >
            <Text variant="eyebrow" className="shrink-0 font-mono">
              [{hint.label}]
            </Text>
            <span className="text-xs text-foreground sm:text-sm">{hint.value}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </Stack>
  );
}
