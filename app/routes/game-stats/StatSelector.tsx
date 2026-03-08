import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { GAME_STAT_CATEGORIES } from "./stat-definitions";

export function StatSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-[180px]">
        <SelectValue placeholder="Stat" />
      </SelectTrigger>
      <SelectContent>
        {GAME_STAT_CATEGORIES.map((category) => (
          <SelectGroup key={category.label}>
            <SelectLabel>{category.label}</SelectLabel>
            {category.stats.map((stat) => (
              <SelectItem key={stat.key} value={stat.key}>
                {stat.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
