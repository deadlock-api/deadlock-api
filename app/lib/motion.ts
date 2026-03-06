import type { Variants } from "framer-motion";

/** Page-level fade transition */
export const pageFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15, ease: "easeInOut" },
} as const;

/** Modal/dialog fade+scale */
export const modalFade: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.1, ease: "easeIn" } },
};

/** Button press feedback */
export const buttonPress = {
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 500, damping: 30 },
} as const;
