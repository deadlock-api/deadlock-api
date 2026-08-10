import { ChevronDownIcon, type LucideIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";

/** The card chrome every Team Builder block sits in, so they all read as one surface. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  // The blocks supply their own padding and dividers, so the primitive's own spacing is cleared.
  return <Card className={cn("min-w-0 gap-0 overflow-hidden py-0", className)}>{children}</Card>;
}

export function PanelHeader({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    // `min-h-12`, not a fixed height: a wrapped title would overflow and be cut by the card's
    // own `overflow-hidden`.
    <div className="flex min-h-12 shrink-0 items-center justify-between gap-x-3 border-b border-border px-4 py-2">
      <span className="truncate text-sm font-semibold sm:text-[15px]">{title}</span>
      {note !== undefined && <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{note}</span>}
      {children}
    </div>
  );
}

export function PanelViewToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon: LucideIcon }[];
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      className="ml-auto"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label} className="size-7">
          <option.icon className="size-3.5" />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function PanelShowMore({
  expanded,
  total,
  onToggle,
}: {
  expanded: boolean;
  total: number;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      className="h-auto w-full cursor-pointer justify-center gap-1.5 rounded-none py-2 text-xs font-normal text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
    >
      {expanded ? "Show fewer" : `Show all ${total}`}
      <ChevronDownIcon className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
    </Button>
  );
}

export function PanelBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 p-4", className)}>{children}</div>;
}

export function PanelMessage({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-balance text-muted-foreground">{children}</p>;
}

export function PanelSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 p-4", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" style={{ opacity: 1 - i * (0.6 / rows) }} />
      ))}
    </div>
  );
}
