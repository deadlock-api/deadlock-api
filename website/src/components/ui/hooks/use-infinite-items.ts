import { useCallback, useState } from "react";

/**
 * The first `step` of `list`, and `showMore` to add the next `step`; pair it with `LoadMore`, which calls `showMore`
 * as the end of the list nears the viewport. A new `list` (another filter) starts over at the first `step`.
 */
export function useInfiniteItems<T>(list: readonly T[], { step = 60 }: { step?: number } = {}) {
  const [count, setCount] = useState(step);
  const [source, setSource] = useState(list);
  if (source !== list) {
    setSource(list);
    setCount(step);
  }
  const showMore = useCallback(() => setCount((current) => current + step), [step]);
  return { items: list.slice(0, count), total: list.length, showMore };
}
