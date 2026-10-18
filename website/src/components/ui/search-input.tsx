import { SearchIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { assignRef } from "~/components/ui/hooks/assign-ref";
import { useControllableState } from "~/components/ui/hooks/use-controllable-state";
import { Input } from "~/components/ui/input";
import { Kbd } from "~/components/ui/kbd";
import { CONTROL_SURFACE, DISABLED_STATE, FOCUS_RING } from "~/components/ui/recipes";
import { RollingTextPausedContext } from "~/components/ui/rolling-text";
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
  /**
   * What a `bar` shows while empty, in place of the placeholder text: something richer than a string, such as a
   * `RollingText` of examples. `placeholder` stays the field's accessible hint, drawn invisible.
   */
  placeholderContent?: React.ReactNode;
  /**
   * A lead-in before `placeholderContent` ("Ask anything:"), dropped when the field is too narrow for both, so the
   * content keeps the room. A `RollingText` in the content holds still while the field has the focus.
   */
  placeholderLead?: React.ReactNode;
  /**
   * A key that focuses the field from anywhere ("/"), shown at its end while it is empty and not focused, and not on
   * a touch screen, which has no such key.
   */
  shortcut?: string;
  /**
   * The search is running: a spinner takes the clear button's place, and the field says it is busy. The field stays
   * editable and focused, so the asker can change the query while it runs.
   */
  loading?: boolean;
  /** What the spinner announces. */
  loadingLabel?: string;
  /**
   * `identifier`: the query is a name or an id (a Steam name, an account id, a link), not prose: no spellcheck
   * underlines, autocomplete, autocorrect or autocapitalisation.
   */
  kind?: "text" | "identifier";
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
  kind = "text",
  action,
  placeholderContent,
  placeholderLead,
  shortcut,
  className,
  ref,
  ...props
}: SearchInputProps) {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue, onValueChange });
  const inputRef = useRef<HTMLInputElement>(null);
  /** Whether the bar has the focus, which holds its rolling placeholder still. */
  const [focused, setFocused] = useState(false);
  const setRefs = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    assignRef(ref, node);
  };
  const fieldProps = {
    ref: setRefs,
    type: "search",
    value,
    "aria-busy": loading || undefined,
    "aria-keyshortcuts": shortcut,
    ...(kind === "identifier"
      ? { spellCheck: false, autoComplete: "off", autoCorrect: "off", autoCapitalize: "off" }
      : undefined),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      setValue(event.target.value);
    },
    ...props,
  };
  const hideNativeClear = "[&::-webkit-search-cancel-button]:appearance-none";
  const editable = !props.disabled && !props.readOnly;
  // The end of the field, one thing at a time: progress while loading, a clear button once there is text, else the
  // shortcut key. The spinner takes the clear button's box, so it shows where the button was.
  const trailing = loading ? (
    <span className="flex size-6 items-center justify-center">
      <Spinner size={size === "sm" && variant !== "bar" ? "xs" : "sm"} label={loadingLabel} />
    </span>
  ) : value !== "" && editable ? (
    <Button
      // Not the form's submit: Enter in a search inside a form would press it and clear the field instead.
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label="Clear search"
      className="text-muted-foreground"
      onClick={() => {
        setValue("");
        inputRef.current?.focus();
      }}
    >
      <XIcon />
    </Button>
  ) : (
    shortcut && (
      <Kbd aria-hidden="true" className="pointer-events-none group-focus-within:hidden pointer-coarse:hidden">
        {shortcut}
      </Kbd>
    )
  );

  if (variant === "bar") {
    return (
      <div
        data-slot="search-input"
        data-variant="bar"
        className={cn(
          CONTROL_SURFACE,
          // The frame draws the field's focus, for the input only: the action inside has a ring of its own.
          "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
          "group flex h-12 min-w-0 items-center gap-2 rounded-full ps-4 pe-1.5 hover:border-muted-foreground has-disabled:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/40",
          className,
        )}
        onFocus={() => setFocused(true)}
        onBlur={(event) => setFocused(event.currentTarget.contains(event.relatedTarget))}
      >
        <SearchIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <span className="@container relative flex h-full min-w-0 flex-1 items-center">
          <input
            data-slot="input"
            className={cn(
              hideNativeClear,
              "h-full w-full min-w-0 bg-transparent text-base placeholder:text-muted-foreground focus-visible:outline-none disabled:pointer-events-none",
              placeholderContent !== undefined && "placeholder:text-transparent",
            )}
            {...fieldProps}
          />
          {placeholderContent !== undefined && value === "" && (
            <span
              data-slot="search-input-placeholder"
              className="pointer-events-none absolute inset-0 flex min-w-0 items-center text-base whitespace-nowrap text-muted-foreground"
            >
              {placeholderLead != null && (
                <span data-slot="search-input-placeholder-lead" className="hidden shrink-0 @xs:inline">
                  {placeholderLead}&nbsp;
                </span>
              )}
              <RollingTextPausedContext value={focused}>{placeholderContent}</RollingTextPausedContext>
            </span>
          )}
        </span>
        {trailing}
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
      {trailing && (
        <span className={cn("absolute inset-y-0 flex items-center", variant === "ghost" ? "inset-e-0" : "inset-e-1")}>
          {trailing}
        </span>
      )}
    </div>
  );
}
