import { useSyncExternalStore } from "react";

// The last question the search answered, shared by every search on the page: the home page's search redirects, and
// the sidebar's then holds the question, ready to be changed and asked again.

interface LastSearch {
  question: string;
  /** Changes with every answer, so a search shows the new question over what was typed before it. */
  version: number;
}

let current: LastSearch | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLastSearch(): LastSearch | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

export function setLastSearch(question: string): void {
  current = { question, version: (current?.version ?? 0) + 1 };
  for (const listener of listeners) listener();
}
