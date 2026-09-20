import { useFieldControlProps } from "~/components/ui/hooks/use-field-control";
import { FOCUS_RING_BORDER, INVALID_STATE } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const fieldProps = useFieldControlProps(props);
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-input/30 px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input",
        // iOS zooms the page when a focused field is under 16px. That is about touch, not about the viewport width.
        "pointer-coarse:text-base",
        "[&[readonly]]:cursor-default [&[readonly]]:border-dashed [&[readonly]]:bg-transparent [&[readonly]]:shadow-none",
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
