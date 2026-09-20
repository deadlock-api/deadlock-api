import { CheckIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { cloneElement, isValidElement } from "react";

import { cn } from "~/lib/utils";

interface OptionRowProps extends React.ComponentProps<"button"> {
  selected?: boolean;
  /** The row the keyboard cursor is on, in a list that manages its own arrow-key navigation. */
  active?: boolean;
  hint?: React.ReactNode;
  /** A quiet second line under the label. */
  description?: React.ReactNode;
  /** An image or icon before the label. */
  leading?: React.ReactNode;
  /** Extra columns on the trailing edge, before the check mark. */
  trailing?: React.ReactNode;
  /** The single child is the row's element (a router `Link`, an `<a>`); its own children are the label. */
  asChild?: boolean;
}

/** One choice in a popover or dialog list; the selected row carries a check mark. */
export function OptionRow({
  selected = false,
  active = false,
  hint,
  description,
  leading,
  trailing,
  asChild = false,
  className,
  children,
  ...props
}: OptionRowProps) {
  const child = asChild && isValidElement<{ children?: React.ReactNode }>(children) ? children : null;
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {leading}
        <span className="flex min-w-0 flex-col">
          <span data-slot="option-row-label" className="min-w-0 truncate">
            {child ? child.props.children : children}
          </span>
          {description && (
            <span
              data-slot="option-row-description"
              className="min-w-0 truncate text-xs font-normal text-muted-foreground"
            >
              {description}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {hint && <span className="font-mono text-2xs font-normal text-muted-foreground">{hint}</span>}
        {trailing}
        {selected && <CheckIcon className="size-3.5 text-primary" />}
      </span>
    </>
  );
  const rowProps = {
    "data-slot": "option-row",
    "data-active": active || undefined,
    "aria-current": selected || undefined,
    className: cn(
      "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-start text-sm whitespace-nowrap outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-accent",
      selected && "font-medium",
      className,
    ),
    ...props,
  };
  if (child) return <Slot.Root {...rowProps}>{cloneElement(child, undefined, content)}</Slot.Root>;
  return (
    <button type="button" {...rowProps}>
      {content}
    </button>
  );
}
