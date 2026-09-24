import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const heroGlowVariants = cva(
  "pointer-events-none absolute inset-s-1/2 -z-10 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl rtl:translate-x-1/2",
  {
    variants: {
      size: {
        sm: "top-0 size-72",
        default: "-top-12 size-80",
      },
    },
    defaultVariants: { size: "default" },
  },
);

const heroVariants = cva("relative isolate flex min-w-0 flex-col items-center text-center", {
  variants: {
    size: {
      sm: "gap-4 py-4",
      default: "gap-6 py-8",
    },
  },
  defaultVariants: { size: "default" },
});

/**
 * The opening block of a hub or marketing page: a centred column of `PageHeader`, `HeroLead` and `HeroActions`
 * over a soft brand-colored glow. `HeroActions` also holds a row of pills under the title. Every part is optional.
 */
export function Hero({
  size = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof heroVariants>) {
  return (
    <section data-slot="hero" data-size={size} className={cn(heroVariants({ size }), className)} {...props}>
      <div data-slot="hero-glow" aria-hidden="true" className={heroGlowVariants({ size })} />
      {children}
    </section>
  );
}

/** The paragraph that says what the page is, in a measure that stays readable. */
export function HeroLead({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="hero-lead"
      className={cn("max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The calls to action, in a row that wraps on a narrow screen. */
export function HeroActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="hero-actions"
      className={cn("flex flex-wrap items-center justify-center gap-3", className)}
      {...props}
    />
  );
}
