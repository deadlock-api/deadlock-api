import { cn } from "~/lib/utils";

interface MaskedIconProps extends Omit<React.ComponentProps<"span">, "children"> {
  /** The image URL. Only its shape is used: the glyph is painted in the current text color. */
  src: string;
  /** What the glyph stands for. Without it the icon is decorative and hidden from assistive technology. */
  label?: string;
}

/**
 * An image used as a glyph: the art becomes a mask and the color comes from `currentColor`, so a team emblem or a
 * lane icon takes the tone of the text it sits in instead of shipping one bitmap per theme.
 */
export function MaskedIcon({ src, label, className, style, ...props }: MaskedIconProps) {
  return (
    <span
      data-slot="masked-icon"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block size-4 shrink-0 bg-current", className)}
      style={{
        maskImage: `url(${src})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        ...style,
      }}
      {...props}
    />
  );
}
