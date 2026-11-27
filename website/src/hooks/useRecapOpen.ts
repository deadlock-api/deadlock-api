import { useSyncExternalStore } from "react";

import { IS_DEV } from "~/lib/constants";
import { isRecapOpen } from "~/lib/year-recap/availability";

const subscribe = () => () => {};

/**
 * Whether the yearly recap is open right now (1 December to 15 January, UTC), for chrome that every page renders, such
 * as the sidebar entry. False on the server and through hydration, which have no clock to agree on, and the real
 * answer after; always true on the dev server. A page about the recap decides in its loader instead.
 */
export function useRecapOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => IS_DEV || isRecapOpen(new Date()),
    () => IS_DEV,
  );
}
