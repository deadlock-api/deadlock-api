import { cn } from "~/lib/utils";

/** Kills / deaths / assists of one player in one match: the numbers in ink, the slashes muted. */
export function KdaLine({
  kills,
  deaths,
  assists,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  kills: number;
  deaths: number;
  assists: number;
}) {
  const slash = <span className="font-medium text-muted-foreground">/</span>;
  return (
    <span
      data-slot="kda-line"
      className={cn(
        "inline-flex items-baseline gap-0.5 text-base leading-none font-bold tracking-wide text-foreground tabular-nums",
        className,
      )}
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
