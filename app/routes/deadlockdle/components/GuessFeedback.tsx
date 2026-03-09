import { AnimatePresence, motion } from "framer-motion";

interface GuessFeedbackProps {
  /** "correct" | "wrong" | null — triggers the flash overlay */
  type: "correct" | "wrong" | null;
}

/**
 * Full-area flash overlay for guess feedback.
 * Renders a brief green/red border-glow + text flash, then auto-fades.
 */
export function GuessFeedback({ type }: GuessFeedbackProps) {
  return (
    <AnimatePresence>
      {type && (
        <motion.div
          key={type}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="pointer-events-none fixed inset-0 z-50"
        >
          {/* Edge glow */}
          <div
            className="absolute inset-0"
            style={{
              boxShadow:
                type === "correct"
                  ? "inset 0 0 80px rgba(34, 197, 94, 0.25), inset 0 0 200px rgba(34, 197, 94, 0.08)"
                  : "inset 0 0 80px rgba(250, 68, 84, 0.25), inset 0 0 200px rgba(250, 68, 84, 0.08)",
            }}
          />
          {/* Center label */}
          <motion.div
            initial={{ opacity: 1, scale: 0.8 }}
            animate={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span
              className={`text-3xl font-game uppercase tracking-wider ${
                type === "correct" ? "text-green-400" : "text-primary"
              }`}
              style={{
                textShadow: type === "correct" ? "0 0 30px rgba(34, 197, 94, 0.6)" : "0 0 30px rgba(250, 68, 84, 0.6)",
              }}
            >
              {type === "correct" ? "Correct!" : "Wrong!"}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
