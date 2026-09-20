import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const kdaLineVariants = cva("inline-flex items-baseline gap-0.5 font-bold tracking-wide text-foreground tabular-nums", {
  variants: {
    /** `sm` takes the text size of its parent (a table cell, a list row); `default` and `lg` are a card's headline. */
    size: { sm: "font-semibold tracking-normal", default: "text-base leading-none", lg: "text-xl leading-none" },
  },
  defaultVariants: { size: "default" },
});

/** Kills / deaths / assists of one player in one match: the numbers in ink, the slashes muted. */
export function KdaLine({
  kills,
  deaths,
  assists,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof kdaLineVariants> & {
    kills: number;
    deaths: number;
    assists: number;
  }) {
  const slash = <span className="font-medium text-muted-foreground">/</span>;
  return (
    <span
      data-slot="kda-line"
      data-size={size ?? "default"}
      className={cn(kdaLineVariants({ size }), className)}
      {...props}
    >
      <span className="sr-only">{`${kills} kills, ${deaths} deaths, ${assists} assists`}</span>
      <span aria-hidden="true" className="contents">
        {kills}
        {slash}
        {deaths}
        {slash}
        {assists}
      </span>
    </span>
  );
}
