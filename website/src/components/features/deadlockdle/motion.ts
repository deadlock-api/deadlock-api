import type { Transition, Variants } from "framer-motion";

/**
 * framer-motion animates in JavaScript and takes seconds as numbers, so it cannot read `var(--duration-*)`. These
 * mirror the motion tokens in `src/styles/tokens.css`; change them together. Reduced motion is handled by the
 * `MotionConfig reducedMotion="user"` of the games' layout routes, since the token collapse does not reach JavaScript.
 */
export const DURATION = { fast: 0.15, normal: 0.2, slow: 0.3 } as const;

export const enter: Transition = { duration: DURATION.slow, ease: "easeOut" };

/** The parent of a group whose children arrive one after the other; each child takes `fadeUp`. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: DURATION.fast / 2, delayChildren: DURATION.fast } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: enter },
};
