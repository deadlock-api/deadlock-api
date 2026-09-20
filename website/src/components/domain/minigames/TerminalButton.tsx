import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * The games' monospace, uppercase take on Button. `soft` is the main action of a screen, `outline` everything else.
 * The square corners come from the `.theme-terminal` scope (`--radius: 0`, set by GamePage), not from this component:
 * outside that scope it is as rounded as any Button.
 */
export function TerminalButton({ className, variant = "outline", ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant={variant}
      className={cn("cursor-target font-mono text-xs tracking-wider uppercase", className)}
      {...props}
    />
  );
}
