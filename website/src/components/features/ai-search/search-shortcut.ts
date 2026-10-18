import { type RefObject, useEffect, useSyncExternalStore } from "react";

import { isTyping } from "~/lib/keyboard";

// `/` and Ctrl+K (Cmd+K) focus a search from anywhere on the page. With several on the page, the most prominent visible
// one takes it: the home page's search bar before the sidebar's field.

interface Target {
  input: RefObject<HTMLInputElement | null>;
  primary: boolean;
}

const targets = new Set<Target>();
/** Called when a primary target mounts or unmounts, for `useSearchShortcut`'s answer. */
const listeners = new Set<() => void>();
const hasPrimary = () => [...targets].some((target) => target.primary);
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function onKeyDown(event: KeyboardEvent) {
  const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target);
  const commandK = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey;
  if (!slash && !commandK) return;
  // A hidden one (the sidebar on a phone, where its search lives in the closed menu) cannot take the focus.
  const visible = [...targets].filter((target) => target.input.current?.checkVisibility());
  const input = (visible.find((target) => target.primary) ?? visible[0])?.input.current;
  if (!input) return;
  event.preventDefault();
  input.focus();
  input.select();
}

/**
 * Lets the shortcut focus this search's field; a `primary` one (the page's own search bar) wins over the others.
 * Returns whether the shortcut reaches this field: false for a secondary one while a primary one is mounted, which
 * then should not show the key.
 */
export function useSearchShortcut(input: RefObject<HTMLInputElement | null>, primary: boolean): boolean {
  useEffect(() => {
    const target = { input, primary };
    if (targets.size === 0) document.addEventListener("keydown", onKeyDown);
    targets.add(target);
    if (primary) for (const listener of listeners) listener();
    return () => {
      targets.delete(target);
      if (targets.size === 0) document.removeEventListener("keydown", onKeyDown);
      if (primary) for (const listener of listeners) listener();
    };
  }, [input, primary]);
  const primaryMounted = useSyncExternalStore(subscribe, hasPrimary, () => false);
  return primary || !primaryMounted;
}
