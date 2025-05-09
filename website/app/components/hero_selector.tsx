import { Select } from "@base-ui-components/react/select";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useMemo } from "react";
import type { AssetsHero } from "~/types/assets_hero";
import { twc } from "react-twc";

function getHeroImageUrl(hero: AssetsHero | undefined): string | undefined {
  return hero?.images?.minimap_image_webp;
}

const StyledPopup = twc(Select.Popup)`
  group
  [max-height:var(--available-height)]
  origin-[var(--transform-origin)]
  overflow-y-auto
  rounded-md
  bg-slate-900
  py-1
  text-slate-300
  shadow-none
  outline-1
  outline-white/10
  transition-[transform,scale,opacity]
  data-[ending-style]:scale-100
  data-[ending-style]:opacity-100
  data-[ending-style]:transition-none
  data-[starting-style]:scale-90
  data-[starting-style]:opacity-0
  data-[side=none]:data-[starting-style]:scale-100
  data-[side=none]:data-[starting-style]:opacity-100
  data-[side=none]:data-[starting-style]:transition-none
`;

const StyledItem = twc(Select.Item)`
  grid min-w-[var(--anchor-width)] cursor-default grid-cols-[1.5rem_1fr] items-center gap-2 py-2 pr-4 pl-2.5 text-sm leading-4 outline-none select-none
  group-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)]
  group-data-[side=none]:pr-12
  group-data-[side=none]:text-base
  group-data-[side=none]:leading-4
  data-[highlighted]:relative
  data-[highlighted]:z-0
  data-[highlighted]:text-gray-900
  data-[highlighted]:before:absolute
  data-[highlighted]:before:inset-x-1
  data-[highlighted]:before:inset-y-0
  data-[highlighted]:before:z-[-1]
  data-[highlighted]:before:rounded-sm
  data-[highlighted]:before:bg-gray-300
`;

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
            <span className="icon-[material-symbols--unfold-more-rounded] text-lg" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner className="z-50 outline-none" sideOffset={8}>
            <StyledPopup>
              {allowSelectNull && (
                <StyledItem key={0} value={0}>
                  <Select.ItemIndicator className="col-start-1 flex justify-center">
                    <span className="icon-[material-symbols--check-rounded] size-3" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 flex items-center gap-2">
                    <span className="truncate">None</span>
                  </Select.ItemText>
                </StyledItem>
              )}
              {sortedHeroes.map((hero) => (
                <StyledItem key={hero.id} value={hero.id}>
                  <Select.ItemIndicator className="col-start-1 flex justify-center">
                    <span className="icon-[material-symbols--check-rounded] size-3" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 flex items-center gap-2">
                    <img src={getHeroImageUrl(hero)} alt={hero.name} className="h-5 w-5 object-contain flex-shrink-0" />
                    <span className="truncate">{hero.name}</span>
                  </Select.ItemText>
                </StyledItem>
              ))}
            </StyledPopup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
