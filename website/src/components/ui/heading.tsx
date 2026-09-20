import { cva, type VariantProps } from "class-variance-authority";

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
      /** The game's display face, for a hero or item name set as a title. */
      game: "font-game font-normal tracking-normal",
    },
  },
  defaultVariants: { size: "sm", font: "sans" },
});

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
}: React.ComponentProps<"h2"> & VariantProps<typeof headingVariants> & { as?: "h2" | "h3" | "h4" | "h5" | "h6" }) {
  return <Tag data-slot="heading" className={cn(headingVariants({ size, font }), className)} {...props} />;
}
