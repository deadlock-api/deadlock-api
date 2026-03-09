import type { VariantProps } from "class-variance-authority";
import { useLayoutEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TabsList, TabsTrigger, tabsListVariants } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

export interface TabOption {
  value: string;
  label: string;
}

interface ResponsiveTabsListProps extends VariantProps<typeof tabsListVariants> {
  options: TabOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function ResponsiveTabsList({
  options,
  value,
  onValueChange,
  variant = "line",
  className,
  ariaLabel,
}: ResponsiveTabsListProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const check = () => setOverflows(el.scrollWidth > el.clientWidth);
    check();

    document.fonts?.ready.then(check);

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative">
      {overflows ? (
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="w-full" aria-label={ariaLabel ?? "Select tab"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <TabsList variant={variant} className={cn("w-full overflow-x-auto scrollbar-none", className)}>
          {options.map((opt) => (
            <TabsTrigger key={opt.value} value={opt.value}>
              {opt.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}

      {/* Hidden measurement clone — always in the DOM at the container's full
          width so ResizeObserver can reliably detect overflow without causing
          a show/hide flicker loop. */}
      <TabsList
        ref={measureRef}
        variant={variant}
        aria-hidden
        inert
        className={cn("w-full overflow-x-auto scrollbar-none absolute top-0 left-0 invisible pointer-events-none", className)}
      >
        {options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value} tabIndex={-1}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
