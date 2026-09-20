import { useFieldControlProps } from "~/components/ui/hooks/use-field-control";
import { CONTROL_SURFACE, DISABLED_STATE, FOCUS_RING_BORDER, INVALID_STATE, READ_ONLY } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const fieldProps = useFieldControlProps(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        DISABLED_STATE,
        CONTROL_SURFACE,
        "flex field-sizing-content min-h-16 w-full px-3 py-2 placeholder:text-muted-foreground hover:border-muted-foreground",
        // iOS zooms the page when a focused field is under 16px. That is about touch, not about the viewport width.
        "pointer-coarse:text-base",
        READ_ONLY,
        FOCUS_RING_BORDER,
        INVALID_STATE,
        className,
      )}
      {...props}
      {...fieldProps}
    />
  );
}

export { Textarea };
