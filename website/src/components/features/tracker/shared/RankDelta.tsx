import { Delta } from "~/components/ui/delta";

/** A signed rank change colored by direction; renders nothing for zero or unknown values. */
export function RankDelta({
  value,
  className,
  title,
}: {
  value: number | null | undefined;
  className?: string;
  title?: string;
}) {
  if (value == null) return null;
  return <Delta value={value} format="number" digits={0} className={className} title={title} />;
}
