import { stagger as staggerDelay, type Transition, type Variants } from "framer-motion";

import { useHydrated } from "~/hooks/useHydrated";

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
  show: { transition: { delayChildren: staggerDelay(DURATION.fast / 2, { startDelay: DURATION.fast }) } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: enter },
};

/**
 * The `initial` of an entrance: `from` once the client has taken over, `false` (start at the end state) while server
 * rendering and hydrating. The server HTML is never hidden; only a page or group mounted by a client-side navigation
 * animates in.
 */
export function useEnterFrom<T>(from: T): T | false {
  return useHydrated() ? from : false;
}
