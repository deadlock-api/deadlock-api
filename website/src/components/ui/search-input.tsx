import { SearchIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Input } from "~/components/ui/input";
import { DISABLED_STATE, FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

interface SearchInputProps extends Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "type" | "size"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: "default" | "sm";
  /** `ghost` has no frame of its own, for a search that is the header of a dialog or popover. */
  variant?: "default" | "ghost";
}

/**
 * A text field that filters what is below it. The input is the element this component stands for: `ref`,
 * `aria-label`, `placeholder` and handlers reach it, and `className` sizes the row around it.
 */
export function SearchInput({
  value: valueProp,
  defaultValue = "",
  onValueChange,
  onChange,
  size = "default",
  variant = "default",
  className,
  ref,
  ...props
}: SearchInputProps) {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue, onValueChange });
  const inputRef = useRef<HTMLInputElement>(null);
  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const fieldProps = {
    ref: setRefs,
    type: "search",
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      setValue(event.target.value);
    },
    ...props,
  };
  const hideNativeClear = "[&::-webkit-search-cancel-button]:appearance-none";
  const leadingClass = cn(
    "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
    size === "sm" ? "size-3.5" : "size-4",
    variant === "ghost" ? "start-0" : size === "sm" ? "start-2.5" : "start-3",
  );
  return (
    <div data-slot="search-input" data-size={size} data-variant={variant} className={cn("relative min-w-0", className)}>
      <SearchIcon aria-hidden="true" className={leadingClass} />
      {variant === "ghost" ? (
        <input
          data-slot="input"
          className={cn(
            hideNativeClear,
            FOCUS_RING,
            DISABLED_STATE,
            "w-full min-w-0 rounded-sm bg-transparent pe-8 placeholder:text-muted-foreground aria-invalid:ring-3 aria-invalid:ring-destructive/40 [&[readonly]]:cursor-default",
            size === "sm" ? "h-8 ps-5.5 text-sm" : "h-9 ps-6 text-base",
          )}
          {...fieldProps}
        />
      ) : (
        <Input size={size} className={cn(hideNativeClear, size === "sm" ? "px-8" : "px-9")} {...fieldProps} />
      )}
      {value !== "" && !props.disabled && !props.readOnly && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
