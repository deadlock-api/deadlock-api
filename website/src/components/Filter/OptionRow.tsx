import { CheckIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface OptionRowProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  hint?: string;
}

/** One choice in a popover list; the selected row carries a check mark. */
export function OptionRow({ selected, onClick, children, hint }: OptionRowProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm whitespace-nowrap hover:bg-accent",
        selected && "font-medium",
      )}
      onClick={onClick}
    >
      <span className="truncate">{children}</span>
      <span className="flex shrink-0 items-center gap-2">
        {hint && <span className="font-mono text-[11px] font-normal text-muted-foreground">{hint}</span>}
        {selected && <CheckIcon className="size-3.5 text-primary" />}
      </span>
    </button>
  );
}
