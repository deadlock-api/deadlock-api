import { cn } from "~/lib/utils";

/** A key the reader presses. One element per key: `<Kbd>Ctrl</Kbd> <Kbd>K</Kbd>`. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border bg-muted px-1 font-mono text-2xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
