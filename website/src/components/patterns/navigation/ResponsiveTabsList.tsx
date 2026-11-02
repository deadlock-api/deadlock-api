import type { VariantProps } from "class-variance-authority";
import { useCallback } from "react";

import { assignRef } from "~/components/ui/hooks/assign-ref";
import { TabsList, tabsListVariants, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

interface ResponsiveTabProps extends Omit<React.ComponentProps<"button">, "value"> {
  value: string;
  /**
   * The tab's own URL, when each tab is a page. The tab renders as a link to it, so crawlers find the page and a
   * modified click opens it in a new tab; a plain click still selects through `onValueChange`.
   */
  href?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/** A plain primary click selects the tab through Radix (on mouse down or key); the link only serves the other clicks. */
function keepPlainClick(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
  }
}

/** One tab of a `ResponsiveTabsList`. */
export function ResponsiveTab({ value, href, disabled = false, className, children, ...props }: ResponsiveTabProps) {
  if (href && !disabled) {
    return (
      <TabsTrigger value={value} className={className} {...props} asChild>
        {/* `type` would carry the trigger's "button" onto the link, where it means a MIME type. */}
        <a href={href} type={undefined} onClick={keepPlainClick}>
          {children}
        </a>
      </TabsTrigger>
    );
  }
  return (
    <TabsTrigger value={value} disabled={disabled} className={className} {...props}>
      {children}
    </TabsTrigger>
  );
}

/** Scrolls the list sideways until its active tab is in view, on mount and whenever the active tab changes. */
function keepActiveTabInView(list: HTMLElement): () => void {
  const reveal = () => {
    const tab = list.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]');
    if (!tab || list.scrollWidth <= list.clientWidth) return;
    const box = list.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.left < box.left) list.scrollLeft -= box.left - tabBox.left + tabBox.width / 2;
    else if (tabBox.right > box.right) list.scrollLeft += tabBox.right - box.right + tabBox.width / 2;
  };
  const observer = new MutationObserver(reveal);
  observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
  const resize = new ResizeObserver(reveal);
  resize.observe(list);
  return () => {
    observer.disconnect();
    resize.disconnect();
  };
}

interface ResponsiveTabsListProps extends React.ComponentProps<"div">, VariantProps<typeof tabsListVariants> {
  /** `ResponsiveTab`s. */
  children?: React.ReactNode;
}

/**
 * Page-level tabs: the section's sibling pages, always visible as tabs. When they do not fit their container they
 * scroll sideways, the edge with more tabs past it fades out, and the active tab is kept in view; they never fold into
 * a select, which hid where on the site a visitor was.
 */
export function ResponsiveTabsList({
  variant = "nav",
  className,
  "aria-label": label,
  ref,
  children,
  ...props
}: ResponsiveTabsListProps) {
  const composedRef = useCallback(
    (node: HTMLDivElement | null) => {
      assignRef(ref, node);
      if (!node) return;
      const stop = keepActiveTabInView(node);
      return () => {
        stop();
        assignRef(ref, null);
      };
    },
    [ref],
  );
  return (
    <TabsList
      ref={composedRef}
      data-slot="responsive-tabs-list"
      variant={variant}
      aria-label={label}
      className={cn("w-full scroll-fade-x scrollbar-none overflow-x-auto overflow-y-hidden", className)}
      {...props}
    >
      {children}
    </TabsList>
  );
}
