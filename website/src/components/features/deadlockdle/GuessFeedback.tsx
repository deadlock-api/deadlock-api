import { AnimatePresence, motion } from "framer-motion";

import { StateFlash } from "~/components/domain/minigames/StateFlash";
import { Text } from "~/components/ui/text";

interface GuessFeedbackProps {
  /** "correct" | "wrong" | null — triggers the flash overlay */
  type: "correct" | "wrong" | null;
  /** Monotonically increasing key to distinguish consecutive same-type flashes */
  triggerKey?: number;
}

/**
 * Full-area flash overlay for guess feedback.
 * Renders a brief positive/negative wash + text flash, then auto-fades.
 */
export function GuessFeedback({ type, triggerKey = 0 }: GuessFeedbackProps) {
  const glow = (percent: number) =>
    `color-mix(in srgb, var(${type === "correct" ? "--positive" : "--negative"}) ${percent}%, transparent)`;

  return (
    <AnimatePresence>
      {type && (
        <motion.div
          key={`${type}-${triggerKey}`}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="pointer-events-none fixed inset-0 z-50"
        >
          <StateFlash state={type} />
          {/* Center label */}
          <motion.div
            initial={{ opacity: 1, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Text
              tone={type === "correct" ? "positive" : "negative"}
              className="font-game text-3xl tracking-wider uppercase"
              style={{ textShadow: `0 0 30px ${glow(60)}` }}
            >
              {type === "correct" ? <>Correct!</> : <>Wrong!</>}
            </Text>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
