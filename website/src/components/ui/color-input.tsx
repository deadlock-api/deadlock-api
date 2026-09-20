import { FOCUS_RING_BORDER, INVALID_STATE } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/** A color swatch that opens the native picker. Its value is always a hex string. */
export function ColorInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="color"
      data-slot="color-input"
      className={cn(
        FOCUS_RING_BORDER,
        INVALID_STATE,
        "h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1 shadow-xs hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input",
        className,
      )}
      {...props}
    />
  );
}
