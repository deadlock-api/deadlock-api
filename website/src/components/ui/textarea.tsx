import { useFieldControlProps } from "~/components/ui/hooks/use-field-control";
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
        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
      {...fieldProps}
    />
  );
}

export { Textarea };
