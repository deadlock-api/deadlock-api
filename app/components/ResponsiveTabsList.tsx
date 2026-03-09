import type { VariantProps } from "class-variance-authority";
import { useEffect, useRef, useState } from "react";
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
}

export function ResponsiveTabsList({
  options,
  value,
  onValueChange,
  variant = "line",
  className,
}: ResponsiveTabsListProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const check = () => setOverflows(el.scrollWidth > el.clientWidth);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {overflows && (
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger className="w-full">
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
      )}

      <TabsList
        ref={tabsRef}
        variant={variant}
        className={cn(
          "w-full overflow-x-hidden scrollbar-none",
          overflows && "invisible !h-0 !p-0 !m-0 !min-h-0 !border-0 overflow-hidden",
          className,
        )}
      >
        {options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </>
  );
}
