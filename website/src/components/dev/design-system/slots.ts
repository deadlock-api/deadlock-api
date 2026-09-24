import { createContext } from "react";

/**
 * The page is laid out from nav.ts: one empty slot per specimen, in the order of the sidebar. Specimens are written
 * wherever their chapter file has them and portal themselves into their slot, so the page and the index can never
 * disagree about order. This is the registry of mounted slots.
 */
const elements = new Map<string, HTMLElement>();
const listeners = new Set<() => void>();

export const slotStore = {
  register: (id: string, element: HTMLElement | null) => {
    if ((elements.get(id) ?? null) === element) return;
    if (element) elements.set(id, element);
    else elements.delete(id);
    for (const listener of listeners) listener();
  },
  get: (id: string) => elements.get(id) ?? null,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** True under the Showcase, where slots exist. A Specimen rendered anywhere else renders in place. */
export const SlotLayoutContext = createContext(false);
