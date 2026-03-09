import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { HERO_STATS, TIME_INTERVALS } from "~/types/api_hero_stats";

export function HeroStatSelector<T extends readonly string[]>({
  value,
  onChange,
  options,
}: {
  value: T[number];
  onChange: (val: T[number]) => void;
  options?: T;
}) {
  const items = options ?? HERO_STATS;
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => val && onChange(val)}
      variant="outline"
      className="flex-wrap"
    >
      {items.map((key) => (
        <ToggleGroupItem key={key as string} value={key as string} className="text-xs capitalize">
          {(key as string).replace(/_/g, " ")}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function HeroTimeIntervalSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(val) => val && onChange(val)} variant="outline">
      {TIME_INTERVALS.map((key) => (
        <ToggleGroupItem key={key.label} value={key.query} className="text-xs capitalize">
          {key.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export const BY_RANK_STATS = [...HERO_STATS, "pickrate"] as const;
export type ByRankStat = (typeof BY_RANK_STATS)[number];
