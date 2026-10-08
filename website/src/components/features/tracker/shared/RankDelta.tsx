import { Delta } from "~/components/ui/delta";
import { NoValue } from "~/components/ui/no-value";

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

/** A recorded rank change where every row needs a reading: "0" when unchanged, a marked gap when not recorded. */
export function RankProgress({ value }: { value: number | null | undefined }) {
  if (value == null) return <NoValue label="Not recorded" />;
  return value === 0 ? "0" : <RankDelta value={value} />;
}
