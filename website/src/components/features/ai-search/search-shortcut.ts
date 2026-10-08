import { type RefObject, useEffect } from "react";

import { isTyping } from "~/lib/keyboard";

// `/` and Ctrl+K (Cmd+K) focus a search from anywhere on the page. With several on the page, the most prominent visible
// one takes it: the home page's search bar before the sidebar's field.

interface Target {
  input: RefObject<HTMLInputElement | null>;
  primary: boolean;
}

const targets = new Set<Target>();

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

/** Lets the shortcut focus this search's field; a `primary` one (the page's own search bar) wins over the others. */
export function useSearchShortcut(input: RefObject<HTMLInputElement | null>, primary: boolean): void {
  useEffect(() => {
    const target = { input, primary };
    if (targets.size === 0) document.addEventListener("keydown", onKeyDown);
    targets.add(target);
    return () => {
      targets.delete(target);
      if (targets.size === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, [input, primary]);
}
