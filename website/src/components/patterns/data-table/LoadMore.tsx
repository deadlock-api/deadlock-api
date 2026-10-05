import { useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const LOOKAHEAD = "800px 0px";

interface LoadMoreProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** Rows shown now. */
  loaded: number;
  /** Rows there are. */
  total: number;
  /** Shows the next rows, such as `useInfiniteItems().showMore`. */
  onLoadMore: () => void;
  /** One row, for the button and the announcement: "line". */
  noun?: string;
  nounPlural?: string;
}

/**
 * The end of a list that grows as it is scrolled (infinite scroll): a "Show more" button that presses itself as it
 * comes within 800px of the viewport, so the next rows are there before the reader reaches them, and that a keyboard
 * or screen reader user presses on purpose. It announces how many rows are shown, and is gone once all are. While
 * there is more it sits on a hairline, as the footer of a panel's list.
 */
export function LoadMore({
  loaded,
  total,
  onLoadMore,
  noun = "row",
  nounPlural = `${noun}s`,
  className,
  ...props
}: LoadMoreProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasMore = loaded < total;

  // Re-observed after every load (`loaded`), so a button still in view after a short page loads again: an observer
  // only reports changes, and a button that never left the viewport would not report again.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: LOOKAHEAD },
    );
    observer.observe(button);
    return () => observer.disconnect();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `loaded` is the re-observe trigger
  }, [loaded, hasMore, onLoadMore]);

  return (
    <div
      data-slot="load-more"
      data-state={hasMore ? "more" : "done"}
      className={cn("flex justify-center data-[state=more]:border-t data-[state=more]:p-2", className)}
      {...props}
    >
      <output aria-live="polite" className="sr-only">
        {`Showing ${Math.min(loaded, total).toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${total === 1 ? noun : nounPlural}`}
      </output>
      {hasMore && (
        <Button ref={buttonRef} variant="ghost" size="sm" onClick={onLoadMore}>
          Show more {nounPlural}
        </Button>
      )}
    </div>
  );
}
