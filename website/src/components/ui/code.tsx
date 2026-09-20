import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const codeVariants = cva("rounded-sm bg-muted px-1.5 py-0.5 font-mono break-words text-foreground", {
  variants: {
    /** One step below the text around it: `default` inside body text, `sm` inside captions, `lg` inside prose. */
    size: {
      sm: "text-2xs",
      default: "text-xs",
      lg: "text-sm",
    },
  },
  defaultVariants: { size: "default" },
});

/** A short piece of code inside a sentence: a parameter, a path, a value. A block of code is `HighlightedCode`. */
export function Code({
  size = "default",
  className,
  ...props
}: React.ComponentProps<"code"> & VariantProps<typeof codeVariants>) {
  return <code data-slot="code" data-size={size} className={cn(codeVariants({ size }), className)} {...props} />;
}
