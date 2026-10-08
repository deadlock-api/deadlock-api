import { type RefObject, useEffect } from "react";

// `/` and Ctrl+K (Cmd+K) focus a search from anywhere on the page. With several on the page, the most prominent visible
// one takes it: the home page's search bar before the sidebar's field.

interface Target {
  input: RefObject<HTMLInputElement | null>;
  priority: number;
}

const targets = new Set<Target>();

/** Whether a key press belongs to a field the visitor is typing in, which a shortcut must not take over. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

function onKeyDown(event: KeyboardEvent) {
  const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target);
  const commandK = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.altKey;
  if (!slash && !commandK) return;
  // A hidden one (the sidebar on a phone, where its search lives in the closed menu) cannot take the focus.
  const input = [...targets]
    .filter((target) => target.input.current?.checkVisibility())
    .sort((a, b) => b.priority - a.priority)[0]?.input.current;
  if (!input) return;
  event.preventDefault();
  input.focus();
  input.select();
}

/** Lets the shortcut focus this search's field; a higher `priority` wins over other searches on the page. */
export function useSearchShortcut(input: RefObject<HTMLInputElement | null>, priority: number): void {
  useEffect(() => {
    const target = { input, priority };
    if (targets.size === 0) document.addEventListener("keydown", onKeyDown);
    targets.add(target);
    return () => {
      targets.delete(target);
      if (targets.size === 0) document.removeEventListener("keydown", onKeyDown);
    };
  }, [input, priority]);
}
