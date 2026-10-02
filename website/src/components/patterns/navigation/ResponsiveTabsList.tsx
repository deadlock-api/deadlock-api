import type { VariantProps } from "class-variance-authority";
import { createContext, use, useLayoutEffect, useRef, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TabsList, tabsListVariants, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

const DisplayContext = createContext<"tabs" | "measure" | "select">("tabs");

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

/** One tab of a `ResponsiveTabsList`: a tab trigger, or an entry of the select the list collapses to. */
export function ResponsiveTab({ value, href, disabled = false, className, children, ...props }: ResponsiveTabProps) {
  const display = use(DisplayContext);
  if (display === "select") {
    return (
      // The collapsed list draws a tab as a Radix `SelectItem`, whose root is a div: same attributes, other event target.
      <SelectItem
        value={value}
        disabled={disabled}
        className={className}
        {...(props as Omit<React.ComponentProps<typeof SelectItem>, "value">)}
      >
        {children}
      </SelectItem>
    );
  }
  // The hidden measuring copy must not repeat the real tab's id (Radix derives it from the value) or its
  // aria-controls, or the panel would be labelled by an inert duplicate.
  const measure = display === "measure" ? { id: undefined, "aria-controls": undefined, tabIndex: -1 } : {};
  // The measuring copy stays a button: one link per tab, not two.
  if (href && !disabled && display === "tabs") {
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
    <TabsTrigger value={value} disabled={disabled} className={className} {...props} {...measure}>
      {children}
    </TabsTrigger>
  );
}

interface ResponsiveTabsListProps
  extends Omit<React.ComponentProps<"div">, "defaultValue">, VariantProps<typeof tabsListVariants> {
  /** The active tab, for the select the list collapses to. The tabs themselves read it from the `Tabs` around them. */
  value?: string;
  onValueChange?: (value: string) => void;
  /** `ResponsiveTab`s. */
  children?: React.ReactNode;
}

/** Page-level tabs that collapse to a select when they do not fit their container. */
export function ResponsiveTabsList({
  value,
  onValueChange,
  variant = "nav",
  className,
  "aria-label": label,
  children,
  ...props
}: ResponsiveTabsListProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const check = () => setOverflows(el.scrollWidth > el.clientWidth);
    check();

    void document.fonts?.ready.then(check);

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tabs = children;

  return (
    <div
      data-slot="responsive-tabs-list"
      data-display={overflows ? "select" : "tabs"}
      className={cn("relative", className)}
      {...props}
    >
      {overflows ? (
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="w-full" aria-label={label ?? "Select tab"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <DisplayContext value="select">{tabs}</DisplayContext>
          </SelectContent>
        </Select>
      ) : (
        <TabsList variant={variant} aria-label={label} className="w-full scrollbar-none overflow-x-auto">
          <DisplayContext value="tabs">{tabs}</DisplayContext>
        </TabsList>
      )}

      <TabsList
        ref={measureRef}
        variant={variant}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute inset-s-0 top-0 w-full scrollbar-none overflow-x-auto"
      >
        <DisplayContext value="measure">{tabs}</DisplayContext>
      </TabsList>
    </div>
  );
}
