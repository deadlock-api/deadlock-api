import { cva, type VariantProps } from "class-variance-authority";
import { ArrowRightIcon, ExternalLinkIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { cloneElement, isValidElement } from "react";

import { CardContent, cardVariants } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

const arrowLinkVariants = cva(
  [FOCUS_RING, "group/arrow-link inline-flex shrink-0 items-center rounded-sm font-medium text-primary"],
  {
    variants: {
      size: {
        sm: "gap-1 text-xs [&_svg]:size-3",
        default: "gap-1.5 text-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/**
 * "View", "Read more", "Play": a label whose arrow nudges forward on hover. Inside a `LinkCard` it is a span, because
 * the card is the link; on its own, pass the link through `asChild`.
 */
function ArrowLink({
  size,
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof arrowLinkVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp data-slot="arrow-link" className={cn(arrowLinkVariants({ size }), className)} {...props}>
      <Slot.Slottable>{children}</Slot.Slottable>
      <ArrowRightIcon
        aria-hidden="true"
        className="transition-transform duration-fast ease-standard group-hover/arrow-link:translate-x-0.5 group-hover/card:translate-x-0.5 motion-reduce:transition-none rtl:-scale-x-100"
      />
    </Comp>
  );
}

const HEADING_SIZE = { sm: "sm", default: "default", lg: "lg" } as const;

interface LinkCardProps extends Omit<React.ComponentProps<"a">, "title" | "media"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A line above the title: a `MetaList`, a date, "Newer post". */
  eyebrow?: React.ReactNode;
  /** An `IconTile hover="card"`, an icon or an image beside the title. A bare icon takes the brand color on hover. */
  media?: React.ReactNode;
  /** The label of the `ArrowLink` at the bottom. */
  cta?: React.ReactNode;
  /** Tags or a status badge in the bottom row, opposite the `cta`. */
  footer?: React.ReactNode;
  /** Which side of the bottom row the `cta` takes. */
  ctaPosition?: "start" | "end";
  /** `sm` for a dense grid of destinations, `default` for a feature card, `lg` for an entry of a list of articles. */
  size?: "sm" | "default" | "lg";
  /** `horizontal` puts the media beside the whole text block instead of beside the title. */
  orientation?: "vertical" | "horizontal";
  /** `end` mirrors a horizontal card: the media on the trailing edge, the text end-aligned. For "next" links. */
  mediaPosition?: "start" | "end";
  /** Marks a link that leaves the site: an icon beside the title. */
  external?: boolean;
  /** Clamp the description to this many lines. */
  clamp?: 2 | 3;
  tone?: VariantProps<typeof cardVariants>["tone"];
  as?: "h2" | "h3" | "h4";
  /** The child is the link (a router `Link`, a `SmartLink`); its own children land under the description. */
  asChild?: boolean;
}

/** A Card that is one link to one destination. Anything with a second action inside is a `Card`, not this. */
export function LinkCard({
  title,
  description,
  eyebrow,
  media,
  cta,
  footer,
  ctaPosition = "start",
  size = "default",
  orientation = "vertical",
  mediaPosition = "start",
  external = false,
  clamp,
  tone = "card",
  as = "h3",
  asChild = false,
  className,
  children,
  ...props
}: LinkCardProps) {
  // Radix only finds a `Slottable` that is a direct child, and the body here is nested inside CardContent.
  const link = asChild && isValidElement<{ children?: React.ReactNode }>(children) ? children : null;
  const body = link ? link.props.children : children;
  const cardSize = size === "sm" ? "sm" : "default";
  const horizontal = orientation === "horizontal";

  const mediaSlot = media && (
    <span
      data-slot="link-card-media"
      className="flex shrink-0 items-center text-muted-foreground transition-colors duration-fast ease-standard group-hover/card:text-primary group-focus-visible/card:text-primary [&>svg]:size-4"
    >
      {media}
    </span>
  );
  const heading = (
    <Heading
      as={as}
      size={HEADING_SIZE[size]}
      className={cn(
        "flex min-w-0 items-center gap-1.5 transition-colors duration-fast ease-standard group-hover/card:text-primary",
        horizontal && "block truncate text-nowrap",
      )}
    >
      {title}
      {external && (
        <>
          <ExternalLinkIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-fast ease-standard group-hover/card:opacity-100 group-focus-visible/card:opacity-100"
          />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </Heading>
  );
  const eyebrowSlot = eyebrow && (
    <div data-slot="link-card-eyebrow" className="text-xs text-muted-foreground">
      {eyebrow}
    </div>
  );
  const descriptionSlot = description && (
    <p
      data-slot="link-card-description"
      className={cn(
        "leading-relaxed text-muted-foreground",
        size === "default" || size === "lg" ? "text-sm" : "text-xs",
        clamp === 2 && "line-clamp-2",
        clamp === 3 && "line-clamp-3",
      )}
    >
      {description}
    </p>
  );
  const ctaSlot = cta && <ArrowLink size={size === "sm" ? "sm" : "default"}>{cta}</ArrowLink>;
  const bottomRow = (cta || footer) && (
    <div
      data-slot="link-card-footer"
      className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1"
    >
      {ctaPosition === "start" && ctaSlot}
      {footer && <div className="flex min-w-0 flex-wrap items-center gap-2">{footer}</div>}
      {ctaPosition === "end" && ctaSlot}
    </div>
  );

  const rootProps = {
    "data-slot": "link-card",
    "data-size": cardSize,
    "data-interaction": "pressable",
    className: cn(cardVariants({ tone, size: cardSize, interaction: "pressable" }), "h-full", className),
    ...(external && { target: "_blank", rel: "noopener noreferrer" }),
    ...props,
  };
  const content = horizontal ? (
    <CardContent
      className={cn("flex min-w-0 flex-1 items-center gap-3", mediaPosition === "end" && "flex-row-reverse text-end")}
    >
      {mediaSlot}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {eyebrowSlot}
        {heading}
        {descriptionSlot}
        {body}
        {bottomRow}
      </div>
    </CardContent>
  ) : (
    <CardContent className={cn("flex min-w-0 flex-1 flex-col", size === "sm" ? "gap-2" : "gap-3")}>
      {eyebrowSlot}
      <div className="flex min-w-0 items-center gap-3">
        {mediaSlot}
        {heading}
      </div>
      {descriptionSlot}
      {body}
      {bottomRow}
    </CardContent>
  );

  if (link) return <Slot.Root {...rootProps}>{cloneElement(link, undefined, content)}</Slot.Root>;
  return <a {...rootProps}>{content}</a>;
}
