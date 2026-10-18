import { cva, type VariantProps } from "class-variance-authority";
import { createContext, use } from "react";

import { cn } from "~/lib/utils";

// Every size is one step of the named type scale (`src/styles/utilities.css`), so size, line height, weight and
// tracking always travel together.
const headingVariants = cva("text-balance break-words", {
  variants: {
    size: {
      /** The small uppercase label above a group. */
      eyebrow: "eyebrow",
      xs: "type-label-sm",
      sm: "type-label",
      default: "type-subheading",
      lg: "type-heading-sm",
      xl: "type-heading",
      "2xl": "type-title",
    },
    font: {
      sans: "",
      /** The terminal voice of the mini-games. */
      mono: "font-mono",
    },
  },
  defaultVariants: { size: "sm", font: "sans" },
});

const HeadingLevelContext = createContext(1);

/**
 * The level of the heading that titles the enclosing region: 1 under the page's h1, 2 inside a `Section` with an h2.
 * A region title (`PanelHeader`) takes the next level down from it, so the outline never skips one.
 */
export function HeadingLevel({ level, children }: { level: number; children: React.ReactNode }) {
  return <HeadingLevelContext value={level}>{children}</HeadingLevelContext>;
}

/** The heading level for a title inside the current region: one below the region's own. */
export function useNextHeadingLevel(): "h2" | "h3" | "h4" {
  const level = use(HeadingLevelContext);
  return level <= 1 ? "h2" : level === 2 ? "h3" : "h4";
}

/**
 * A heading that is not the title of a page, section, panel or card: those come from PageHeader, Section, PanelHeader
 * and CardTitle. `as` sets the level by document outline, `size` sets the look.
 */
export function Heading({
  as: Tag = "h3",
  size,
  font,
  className,
  ...props
}: React.ComponentProps<"h2"> & VariantProps<typeof headingVariants> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag data-slot="heading" className={cn(headingVariants({ size, font }), className)} {...props} />;
}
