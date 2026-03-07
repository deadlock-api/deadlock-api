import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface FilterPillProps {
  label: string;
  value?: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

export function FilterPill({ label, value, active, icon, children, className, align = "center" }: FilterPillProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-full border cursor-pointer transition-colors",
            "hover:bg-accent",
            active
              ? "bg-primary/10 border-primary/30 text-foreground"
              : "bg-muted/50 border-border text-muted-foreground",
          )}
        >
          {icon}
          <span className="truncate">
            {label}
            {value != null && `: ${value}`}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-2", className)} align={align}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
