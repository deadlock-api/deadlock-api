import { SearchIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { Button } from "~/components/ui/button";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Input } from "~/components/ui/input";
import { Kbd } from "~/components/ui/kbd";
import { CONTROL_SURFACE, DISABLED_STATE, FOCUS_RING } from "~/components/ui/recipes";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

interface SearchInputProps extends Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "type" | "size"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: "default" | "sm";
  /**
   * `ghost` has no frame of its own, for a search that is the header of a dialog or popover. `bar` is a page's main
   * search: a tall rounded field with room for an `action` inside it; it has one size and ignores `size`.
   */
  variant?: "default" | "ghost" | "bar";
  /** The submit button of a `bar`, drawn inside the field at its end. */
  action?: React.ReactNode;
  /** A key that focuses the field from anywhere ("/"), shown at its end while it is empty and not focused. */
  shortcut?: string;
  /**
   * The search is running: a spinner takes the clear button's place, and the field says it is busy. The field stays
   * editable and focused, so the asker can change the query while it runs.
   */
  loading?: boolean;
  /** What the spinner announces. */
  loadingLabel?: string;
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
  loading = false,
  loadingLabel = "Searching",
  action,
  shortcut,
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
    "aria-busy": loading || undefined,
    "aria-keyshortcuts": shortcut,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      setValue(event.target.value);
    },
    ...props,
  };
  const hideNativeClear = "[&::-webkit-search-cancel-button]:appearance-none";
  const clearButton = (className?: string) => (
    <Button
      // Not the form's submit: Enter in a search inside a form would press it and clear the field instead.
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Clear search"
      className={cn("text-muted-foreground", className)}
      onClick={() => {
        setValue("");
        inputRef.current?.focus();
      }}
    >
      <XIcon />
    </Button>
  );
  const editable = !props.disabled && !props.readOnly;

  if (variant === "bar") {
    return (
      <div
        data-slot="search-input"
        data-variant="bar"
        className={cn(
          CONTROL_SURFACE,
          // The frame draws the field's focus, for the input only: the action inside has a ring of its own.
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50",
          "group flex h-12 min-w-0 items-center gap-2 rounded-full ps-4 pe-1.5 hover:border-muted-foreground has-disabled:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/40",
          className,
        )}
      >
        <SearchIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <input
          data-slot="input"
          className={cn(
            hideNativeClear,
            "h-full min-w-0 flex-1 bg-transparent text-base placeholder:text-muted-foreground focus-visible:outline-none disabled:pointer-events-none",
          )}
          {...fieldProps}
        />
        {loading ? (
          <Spinner size="sm" label={loadingLabel} />
        ) : value !== "" && editable ? (
          clearButton()
        ) : (
          shortcut && (
            <Kbd aria-hidden="true" className="pointer-events-none group-focus-within:hidden">
              {shortcut}
            </Kbd>
          )
        )}
        {action}
      </div>
    );
  }
  const leadingClass = cn(
    "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
    size === "sm" ? "size-3.5" : "size-4",
    variant === "ghost" ? "inset-s-0" : size === "sm" ? "inset-s-2.5" : "inset-s-3",
  );
  return (
    <div
      data-slot="search-input"
      data-size={size}
      data-variant={variant}
      className={cn("group relative min-w-0", className)}
    >
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
      {loading ? (
        <Spinner
          size={size === "sm" ? "xs" : "sm"}
          label={loadingLabel}
          className={cn("absolute top-1/2 -translate-y-1/2", variant === "ghost" ? "inset-e-0" : "inset-e-2.5")}
        />
      ) : value !== "" && editable ? (
        clearButton("absolute inset-e-1 top-1/2 -translate-y-1/2")
      ) : (
        shortcut && (
          <Kbd
            aria-hidden="true"
            className="pointer-events-none absolute inset-e-2 top-1/2 -translate-y-1/2 group-focus-within:hidden"
          >
            {shortcut}
          </Kbd>
        )
      )}
    </div>
  );
}
