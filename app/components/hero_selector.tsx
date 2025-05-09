import { Select } from "@base-ui-components/react/select";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useMemo } from "react";
import type { AssetsHero } from "~/types/assets_hero";

function getHeroImageUrl(hero: AssetsHero | undefined): string | undefined {
  return hero?.images?.minimap_image_webp;
}

// Add helper icon components
function ChevronUpDownIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      stroke="currentcolor"
      strokeWidth="1.5"
      aria-hidden="true"
      {...props}
    >
      <path d="M0.5 4.5L4 1.5L7.5 4.5" />
      <path d="M0.5 7.5L4 10.5L7.5 7.5" />
    </svg>
  );
}

function CheckIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="currentcolor" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" {...props}>
      <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
    </svg>
  );
}

export default function HeroSelector({
  onHeroSelected,
  selectedHero,
  allowSelectNull,
  label,
}: {
  onHeroSelected: (selectedHero: number | null) => void;
  selectedHero?: number | null;
  allowSelectNull?: boolean;
  label?: string;
}) {
  const { data, isLoading } = useQuery<AssetsHero[]>({
    queryKey: ["assets-heroes"],
    queryFn: () => fetch("https://assets.deadlock-api.com/v2/heroes?only_active=true").then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const sortedHeroes = useMemo(() => data?.sort((a, b) => a.name.localeCompare(b.name)) ?? [], [data]);

  if (isLoading) {
    return "";
  }

  return (
    <div className="w-full max-w-xs">
      <span className="block mb-2 text-sm font-medium text-white">{label || "Select Hero"}</span>
      <Select.Root<number> value={selectedHero} onValueChange={onHeroSelected}>
        <Select.Trigger className="flex h-10 min-w-42 items-center justify-between gap-3 rounded-md border border-gray-600 pr-3 pl-3.5 text-base text-gray-100 select-none hover:bg-gray-700 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-blue-800 active:bg-gray-700 data-[popup-open]:bg-gray-700">
          <Select.Value placeholder="Select Hero...">
            {(_, value) => {
              const selectedHero = sortedHeroes.find((opt) => opt.id === value);
              if (!selectedHero) {
                return <span className="truncate">Select Hero...</span>;
              }
              return (
                <div className="flex items-center gap-2">
                  <img
                    src={getHeroImageUrl(selectedHero)}
                    alt={selectedHero.name}
                    className="h-5 w-5 object-contain flex-shrink-0"
                  />
                  <span className="truncate">{selectedHero.name}</span>
                </div>
              );
            }}
          </Select.Value>
          <Select.Icon className="flex">
            <ChevronUpDownIcon />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner className="z-50 outline-none" sideOffset={8}>
            <Select.Popup className="group [max-height:var(--available-height)] origin-[var(--transform-origin)] overflow-y-auto rounded-md bg-slate-900 py-1 text-slate-300 shadow-none outline-1 outline-white/10 transition-[transform,scale,opacity] data-[ending-style]:scale-100 data-[ending-style]:opacity-100 data-[ending-style]:transition-none data-[starting-style]:scale-90 data-[starting-style]:opacity-0 data-[side=none]:data-[starting-style]:scale-100 data-[side=none]:data-[starting-style]:opacity-100 data-[side=none]:data-[starting-style]:transition-none">
              {allowSelectNull && (
                <Select.Item
                  key={0}
                  value={0}
                  className="grid min-w-[var(--anchor-width)] cursor-default grid-cols-[1.5rem_1fr] items-center gap-2 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] group-data-[side=none]:pr-12 group-data-[side=none]:text-base group-data-[side=none]:leading-4 data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-900 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-gray-900"
                >
                  <Select.ItemIndicator className="col-start-1 flex justify-center">
                    <CheckIcon className="size-3" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 flex items-center gap-2">
                    <span className="truncate">None</span>
                  </Select.ItemText>
                </Select.Item>
              )}
              {sortedHeroes.map((hero) => (
                <Select.Item
                  key={hero.id}
                  value={hero.id}
                  className="grid min-w-[var(--anchor-width)] cursor-default grid-cols-[1.5rem_1fr] items-center gap-2 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] group-data-[side=none]:pr-12 group-data-[side=none]:text-base group-data-[side=none]:leading-4 data-[highlighted]:relative data-[highlighted]:z-0 data-[highlighted]:text-gray-900 data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0 data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm data-[highlighted]:before:bg-gray-300"
                >
                  <Select.ItemIndicator className="col-start-1 flex justify-center">
                    <CheckIcon className="size-3" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 flex items-center gap-2">
                    <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-5 w-5 object-contain flex-shrink-0" />
                    <span className="truncate">{hero.name}</span>
                  </Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
