import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

const profileMediaVariants = cva(
  "relative isolate flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-subtle",
  {
    variants: {
      /** `portrait` for character art (3:4), `square` for an icon (an item, a badge, an avatar). */
      shape: {
        portrait: "aspect-3/4 w-16 @lg:w-32",
        square: "size-16 p-1.5 @lg:size-24 @lg:p-3",
      },
    },
    defaultVariants: { shape: "square" },
  },
);

/**
 * The frame of the art in a ProfileHeader. The accent of the header tints its backdrop, so a transparent portrait or
 * icon sits on its own color. Children are the image, sized to fill it (`size-full object-contain`).
 */
export function ProfileHeaderMedia({
  shape,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof profileMediaVariants>) {
  return (
    <div data-slot="profile-header-media" className={cn(profileMediaVariants({ shape }), className)} {...props}>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-radial from-(--profile-accent)/35 to-transparent to-70%"
      />
      {children}
    </div>
  );
}

interface ProfileHeaderProps extends Omit<React.ComponentProps<"header">, "title"> {
  title: ReactNode;
  /** One or two sentences under the title that say what the page is. */
  description?: ReactNode;
  /** A line of facts above the title: a role, a tier, a price. Badges or plain text. */
  eyebrow?: ReactNode;
  /** The art, in a `ProfileHeaderMedia`. */
  media?: ReactNode;
  /** Buttons on the trailing edge. */
  actions?: ReactNode;
  /**
   * A CSS color that identifies the subject (a hero's color, an item's category), glowing behind the art and along
   * the top edge. Defaults to the brand color.
   */
  accent?: string;
  /** Only for previews that show a header inside another page, which already has its `<h1>`. */
  as?: "h1" | "div";
  /** The headline numbers, usually a `StatGroup variant="plain"`, in a strip under the title. */
  children?: ReactNode;
}

/**
 * The opening block of a page about one thing (a hero, an item, a player): its art, name and a strip of headline
 * numbers on one surface, tinted with the subject's own color. It holds the page's one `<h1>`, like PageHeader.
 */
export function ProfileHeader({
  title,
  description,
  eyebrow,
  media,
  actions,
  accent = "var(--primary)",
  as: Title = "h1",
  className,
  style,
  children,
  ...props
}: ProfileHeaderProps) {
  return (
    <header
      data-slot="profile-header"
      className={cn(
        "@container relative isolate flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
      style={{ "--profile-accent": accent, ...style } as React.CSSProperties}
      {...props}
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-(--profile-accent)/70" />
      <div
        aria-hidden="true"
        className="absolute -inset-s-24 -top-32 -z-10 size-96 rounded-full bg-(--profile-accent)/12 blur-3xl"
      />
      {/* Narrow: the art beside the eyebrow and title, the description across the whole width under them. Wide: the
          art spans both rows and the description sits under the title. */}
      <div
        className="grid min-w-0 items-center gap-x-4 gap-y-3 p-4 @lg:gap-x-6 @lg:gap-y-2 @lg:p-6"
        style={{ gridTemplateColumns: media ? "auto minmax(0, 1fr) auto" : "minmax(0, 1fr) auto" }}
      >
        {media && <div className="self-start @lg:row-span-2 @lg:self-center">{media}</div>}
        <div className="flex min-w-0 flex-col gap-2 @lg:self-end">
          {eyebrow && (
            <div
              data-slot="profile-header-eyebrow"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
            >
              {eyebrow}
            </div>
          )}
          <Title className="type-heading text-balance @lg:type-title-lg">{title}</Title>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 @lg:row-span-2">{actions}</div>}
        {description && (
          <p
            className={cn(
              "col-span-full max-w-3xl text-sm leading-relaxed text-pretty text-muted-foreground @lg:self-start",
              media && "@lg:col-span-1 @lg:col-start-2",
            )}
          >
            {description}
          </p>
        )}
      </div>
      {children && (
        <div
          data-slot="profile-header-stats"
          className="border-t border-hairline bg-subtle px-4 py-3 @lg:px-6 @lg:py-4"
        >
          {children}
        </div>
      )}
    </header>
  );
}
