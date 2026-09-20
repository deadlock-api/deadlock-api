import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { Disclosure } from "~/components/patterns/content/Disclosure";
import { cn } from "~/lib/utils";

const titleVariants = cva("font-bold tracking-tight text-balance", {
  variants: {
    size: {
      /** Data pages: the heading stays out of the way of filters and tables. */
      default: "text-2xl",
      /** Content pages: docs, tools, landing sections. */
      lg: "text-3xl",
      /** Hubs and marketing. */
      display:
        "bg-linear-to-b from-foreground to-foreground/60 bg-clip-text text-5xl text-transparent sm:text-6xl lg:text-7xl",
    },
  },
  defaultVariants: { size: "default" },
});

interface PageHeaderProps extends Omit<React.ComponentProps<"header">, "title">, VariantProps<typeof titleVariants> {
  title: ReactNode;
  description?: ReactNode;
  /** A display figure above the title, for a page that is about one number: the "404" of a missing page. */
  figure?: ReactNode;
  /** A small line above the title: a section name, a back link. */
  eyebrow?: ReactNode;
  /** A portrait, icon or avatar beside the title. Implies start alignment. */
  media?: ReactNode;
  /** Buttons and menus, on the trailing edge. */
  actions?: ReactNode;
  align?: "center" | "start";
  /** Only for previews that show a header inside another page, which already has its `<h1>`. */
  as?: "h1" | "div";
  /** Longer context, kept behind an "About this data" disclosure so the data stays above the fold. */
  children?: ReactNode;
}

/** The one `<h1>` of a page. */
export function PageHeader({
  title,
  description,
  figure,
  eyebrow,
  media,
  actions,
  size,
  align = media || actions ? "start" : "center",
  as: Title = "h1",
  className,
  children,
  ...props
}: PageHeaderProps) {
  const centered = align === "center";
  return (
    <header
      data-slot="page-header"
      className={cn("flex shrink-0 flex-col gap-1", centered && "items-center text-center", className)}
      {...props}
    >
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2", centered && "justify-center")}>
        {media}
        <div className={cn("flex min-w-0 flex-1 flex-col gap-1", centered && "items-center")}>
          {figure && (
            <p data-slot="page-header-figure" className="text-7xl font-bold tracking-tight text-primary tabular-nums">
              {figure}
            </p>
          )}
          {eyebrow && (
            <div data-slot="page-header-eyebrow" className="text-xs text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <Title className={titleVariants({ size })}>{title}</Title>
          {description && (
            <p
              className={cn("text-sm text-muted-foreground", size && size !== "default" && "max-w-2xl leading-relaxed")}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && (
        <Disclosure
          variant="inline"
          size="sm"
          title="About this data"
          className={cn("max-w-3xl", centered && "[&>summary]:mx-auto")}
        >
          {children}
        </Disclosure>
      )}
    </header>
  );
}
