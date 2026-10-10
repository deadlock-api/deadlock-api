import { CopyButton } from "~/components/ui/copy-button";
import { cn } from "~/lib/utils";

/** Copies a game's result (the share text) to the clipboard, in the games' terminal voice. */
export function ShareButton({ variant = "outline", ...props }: React.ComponentProps<typeof CopyButton>) {
  return (
    <CopyButton
      variant={variant}
      {...props}
      className={cn("cursor-target font-mono text-xs tracking-wider uppercase", props.className)}
    />
  );
}
