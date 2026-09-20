import { cn } from "~/lib/utils";

/** A color swatch that opens the native picker. Its value is always a hex string. */
export function ColorInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="color"
      data-slot="color-input"
      className={cn(
        "h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1 shadow-xs outline-none hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input aria-invalid:border-destructive aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}
