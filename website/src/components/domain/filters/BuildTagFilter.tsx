import { useQuery } from "@tanstack/react-query";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AssetImage } from "~/components/domain/assets/AssetImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import {
  TriStateGroup,
  TriStateItem,
  TriStateSection,
  TriStateSelector,
} from "~/components/patterns/filter-bar/TriStateSelector";
import { abilitiesQueryOptions, buildTagsQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";

type BuildTagFilterProps = Omit<React.ComponentProps<typeof TriStateSelector>, "children" | "popoverWidth"> & {
  /** The ability and item tags to offer, most used first; the style tags are always offered. */
  tagIds?: readonly number[];
};

const NO_TAGS: readonly number[] = [];

/**
 * The tags an author gives a build, each included, excluded or left alone: the game's style tags ("Spirit", "For New
 * Players"), then the abilities and items the builds are about. A chosen tag stays listed when no build carries it.
 */
export function BuildTagFilter({
  tagIds = NO_TAGS,
  label = "Tags",
  value,
  defaultValue,
  ...props
}: BuildTagFilterProps) {
  const { data: styleTags = [] } = useQuery(buildTagsQueryOptions);
  const { data: abilities = [] } = useQuery(abilitiesQueryOptions);
  const { data: items = [] } = useQuery(itemUpgradesQueryOptions);

  const offered = [...new Set([...tagIds, ...(value ?? defaultValue ?? new Map()).keys()])];
  const styleIds = new Set(styleTags.map((tag) => tag.id));
  const abilityById = new Map(abilities.map((ability) => [ability.id, ability]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const abilityTags = offered.flatMap((id) => {
    const ability = abilityById.get(id);
    return ability && !styleIds.has(id) ? [{ id, name: ability.name ?? `Ability ${id}` }] : [];
  });
  const itemTags = offered.flatMap((id) => {
    const item = itemById.get(id);
    return item && !styleIds.has(id) && !abilityById.has(id) ? [{ id, item }] : [];
  });

  return (
    <TriStateSelector
      label={label}
      value={value}
      defaultValue={defaultValue}
      popoverWidth="wide"
      width="compact"
      {...props}
    >
      <TriStateSection label="Tagged with">
        <TriStateGroup label="Style">
          {styleTags.map((tag) => (
            <TriStateItem
              key={tag.id}
              value={tag.id}
              label={tag.label}
              icon={<AssetImage asset={{ png: tag.icon, alt: "" }} className="size-5" placeholderClassName="size-5" />}
            />
          ))}
        </TriStateGroup>
        {abilityTags.length > 0 && (
          <TriStateGroup label="Abilities">
            {abilityTags.map(({ id, name }) => (
              <TriStateItem
                key={id}
                value={id}
                label={name}
                icon={<AbilityImage abilityId={id} className="size-5" />}
              />
            ))}
          </TriStateGroup>
        )}
        {itemTags.length > 0 && (
          <TriStateGroup label="Items">
            {itemTags.map(({ id, item }) => (
              <TriStateItem
                key={id}
                value={id}
                label={item.name}
                icon={<ItemImage item={item} alt="" title="" className="size-5" />}
              />
            ))}
          </TriStateGroup>
        )}
      </TriStateSection>
    </TriStateSelector>
  );
}
