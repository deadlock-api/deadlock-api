import { MotionConfig } from "framer-motion";
import type { Variants } from "framer-motion";
import { type ReactNode, useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobileQuery(callback: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getIsMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function useIsMobile() {
  return useSyncExternalStore(subscribeMobileQuery, getIsMobile, () => false);
}

/** Wraps children with MotionConfig that disables all framer-motion animations on mobile */
export function MobileMotionConfig({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  return <MotionConfig reducedMotion={isMobile ? "always" : "user"}>{children}</MotionConfig>;
}

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
