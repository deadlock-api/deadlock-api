import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

const sectionTitleVariants = cva("font-semibold tracking-tight", {
  variants: {
    size: {
      sm: "text-sm",
      default: "text-xl",
      lg: "text-2xl",
    },
  },
  defaultVariants: { size: "default" },
});

interface SectionProps
  extends Omit<React.ComponentProps<"section">, "title">, VariantProps<typeof sectionTitleVariants> {
  title: ReactNode;
  description?: ReactNode;
  /** Controls on the trailing edge of the heading row. */
  actions?: ReactNode;
  /** The heading level. Pick by document outline, not by looks; `size` sets the looks. */
  as?: "h2" | "h3" | "h4";
  /** `hidden` keeps the heading in the outline but does not draw it, for a tab panel whose tab already names it. */
  titleDisplay?: "visible" | "hidden";
  /** `center` for marketing pages; data and content pages stay start-aligned. */
  align?: "start" | "center";
}

/** A titled region of a page. Every block under a PageHeader that has a name is one of these. */
export function Section({
  title,
  description,
  actions,
  as: Heading = "h2",
  size,
  titleDisplay = "visible",
  align = "start",
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section data-slot="section" className={cn("flex min-w-0 flex-col gap-4", className)} {...props}>
      {titleDisplay === "hidden" ? (
        <Heading className="sr-only">{title}</Heading>
      ) : (
        <div
          className={cn(
            "flex flex-wrap items-end gap-x-4 gap-y-2",
            align === "center" ? "justify-center text-center" : "justify-between",
          )}
        >
          <div className={cn("flex min-w-0 flex-col gap-1", align === "center" && "items-center")}>
            <Heading className={sectionTitleVariants({ size })}>{title}</Heading>
            {description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
