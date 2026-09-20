import { Collapsible as CollapsiblePrimitive } from "radix-ui";

import { DISABLED_STATE, FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      // No radius here: with `asChild` the class lands on the child, whose own radius must keep winning.
      className={cn(FOCUS_RING, DISABLED_STATE, className)}
      {...props}
    />
  );
}

function CollapsibleContent({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return <CollapsiblePrimitive.CollapsibleContent data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
