import { useEffect, useState } from "react";

/**
 * Which of the elements with these ids the reader is at: the last one to cross a band just above the middle of the
 * viewport, so a long page's index can mark its current chapter. Null until the first one does, and on the server.
 * Observes once per set of ids and disconnects on unmount.
 */
export function useActiveAnchor(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(" ");
  useEffect(() => {
    const elements = key
      .split(" ")
      .map((id) => (id ? document.getElementById(id) : null))
      .filter((element): element is HTMLElement => element != null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // The band is thin, so at most one chapter crosses it at a time; the last entry wins a fast scroll.
        const crossing = entries.filter((entry) => entry.isIntersecting).at(-1);
        if (crossing) setActive(crossing.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [key]);
  return active;
}
