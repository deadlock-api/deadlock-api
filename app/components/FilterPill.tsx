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
            "inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-full border cursor-pointer transition-all",
            active
              ? "bg-primary/15 border-primary/40 text-foreground shadow-[0_0_8px_rgba(250,68,84,0.15)]"
              : "bg-secondary border-white/[0.08] text-muted-foreground hover:bg-accent hover:text-foreground hover:border-white/[0.14]",
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
