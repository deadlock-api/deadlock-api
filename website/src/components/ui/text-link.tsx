import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLinkIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const textLinkVariants = cva([FOCUS_RING, "rounded-sm underline-offset-4 transition-colors"], {
  variants: {
    tone: {
      primary: "text-primary",
      /** Keeps the color of the sentence around it; pair with `underline="always"` so it still reads as a link. */
      inherit: "text-inherit hover:text-primary",
      muted: "text-muted-foreground hover:text-foreground",
    },
    underline: {
      always: "underline",
      hover: "hover:underline",
      /**
       * "There is more behind this": a dotted rule that says the word opens details rather than a page. It is
       * quieter than the link itself until the pointer or the keyboard reaches it, when it goes solid and takes
       * the link's own colour.
       */
      dotted:
        "underline decoration-muted-foreground decoration-dotted underline-offset-4 hover:decoration-current hover:decoration-solid focus-visible:decoration-current focus-visible:decoration-solid",
    },
    /** `sm`: a 12px link that sits in a panel header or a caption line ("All posts", "Become a sponsor"). */
    size: { default: "", sm: "text-xs font-medium" },
  },
  defaultVariants: { tone: "primary", underline: "hover", size: "default" },
});

/**
 * A link inside running text. A link that looks like a button is `<Button asChild>`. With `asChild` the child is the
 * anchor: a router `Link` or a `SmartLink`.
 */
function TextLink({
  tone,
  underline,
  size,
  external = false,
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"a"> &
  VariantProps<typeof textLinkVariants> & {
    asChild?: boolean;
    /** Opens in a new tab and says so: an icon for the eye, a phrase for a screen reader. */
    external?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="text-link"
      className={cn(textLinkVariants({ tone, underline, size }), className)}
      {...(external && { target: "_blank", rel: "noopener noreferrer" })}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      {external && (
        <>
          {"\u202F"}
          <ExternalLinkIcon aria-hidden="true" className="inline size-3 align-baseline" />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </Comp>
  );
}

export { TextLink };
