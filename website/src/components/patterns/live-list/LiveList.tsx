import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

// `relative`: the list is the containing block of what is positioned inside its entries (a screen-reader-only label
// is absolute), so the entries it cuts off cannot stretch the page.
const liveListVariants = cva("relative flex min-h-0 flex-col overflow-hidden", {
  variants: {
    /** `fade`: the oldest entries fade out where the list cuts them off. `cut`: they end at the edge. */
    edge: { fade: "mask-b-from-70%", cut: "" },
  },
  defaultVariants: { edge: "fade" },
});

interface LiveListProps extends React.ComponentProps<"ol">, VariantProps<typeof liveListVariants> {
  /** Names the list for assistive technology. */
  label?: string;
}

/**
 * A list that new entries enter at the top of as they arrive, the oldest falling off the bottom: a live feed. Each
 * `LiveListItem` opens its own height as it enters, so the entries below glide down rather than jump, and glows for a
 * moment. It is a `log` that does not announce its entries (several a second would drown everything else); put a
 * count beside it that says what is arriving. With reduced motion entries simply appear.
 */
export function LiveList({ label = "Live feed", edge, className, ...props }: LiveListProps) {
  return (
    <ol
      data-slot="live-list"
      role="log"
      aria-live="off"
      aria-label={label}
      className={cn(liveListVariants({ edge }), className)}
      {...props}
    />
  );
}

const liveListItemVariants = cva("", {
  variants: {
    density: { default: "px-1 py-2", compact: "px-1 py-1" },
  },
  defaultVariants: { density: "default" },
});

interface LiveListItemProps extends React.ComponentProps<"li">, VariantProps<typeof liveListItemVariants> {}

/** One entry of a `LiveList`. Children are its content; it brings its rule, padding and entrance. */
export function LiveListItem({ density, className, children, ...props }: LiveListItemProps) {
  return (
    <li data-slot="live-list-item" className="shrink-0 border-b border-border/60 last:border-b-0" {...props}>
      <div data-slot="live-list-item-body" className="min-h-0 overflow-hidden">
        <div className={cn(liveListItemVariants({ density }), className)}>{children}</div>
      </div>
    </li>
  );
}
