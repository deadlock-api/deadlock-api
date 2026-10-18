import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { HeadingLevel } from "~/components/ui/heading";
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
  /** The heading level. Pick by document outline, not by looks; `size` sets the looks. */
  as?: "h2" | "h3";
  /** `hidden` keeps the heading in the outline but does not draw it, for a tab panel whose tab already names it. */
  titleDisplay?: "visible" | "hidden";
  /** `center` for marketing pages; data and content pages stay start-aligned. */
  align?: "start" | "center";
  /** A control for the whole section ("Import code"), at the trailing end of the title row. */
  action?: ReactNode;
  /**
   * `sticky` keeps the title row at the top of the window, on a frosted strip, while the rest of a long section scrolls
   * under it, so its panels keep their subject in view. From a 64rem window: on a phone or tablet it would cover too
   * much.
   */
  header?: "static" | "sticky";
}

/** A titled region of a page. Every block under a PageHeader that has a name is one of these. */
export function Section({
  title,
  description,
  as: Heading = "h2",
  size,
  titleDisplay = "visible",
  align = "start",
  action,
  header = "static",
  className,
  children,
  ...props
}: SectionProps) {
  const titleRow = (
    <div
      data-slot="section-header"
      data-header={header}
      className={cn(
        "flex flex-wrap items-end gap-x-4 gap-y-2",
        align === "center" ? "justify-center text-center" : "justify-between",
        header === "sticky" && "lg:rounded-b-lg lg:stuck-surface lg:py-2",
      )}
    >
      <div className={cn("flex min-w-0 flex-col gap-1", align === "center" && "items-center")}>
        <Heading className={sectionTitleVariants({ size })}>{title}</Heading>
        {description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div data-slot="section-action">{action}</div>}
    </div>
  );
  return (
    <section data-slot="section" className={cn("flex min-w-0 flex-col gap-4", className)} {...props}>
      {titleDisplay === "hidden" ? (
        <Heading className="sr-only">{title}</Heading>
      ) : header === "sticky" ? (
        // The sticky box can tell when it is stuck, so the title row's surface shows only then.
        <div className="lg:stuck-container lg:sticky lg:top-0 lg:z-10">{titleRow}</div>
      ) : (
        titleRow
      )}
      {/* The panels inside title themselves one level below this heading. */}
      <HeadingLevel level={Heading === "h2" ? 2 : 3}>{children}</HeadingLevel>
    </section>
  );
}
