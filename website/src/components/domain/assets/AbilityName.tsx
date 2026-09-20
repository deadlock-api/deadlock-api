import { EntityName, type EntityNameProps } from "~/components/domain/assets/EntityName";
import { useAbilityById } from "~/hooks/useAssetById";

export function AbilityName({
  abilityId,
  ...props
}: Omit<EntityNameProps, "name" | "loading" | "link" | "size"> & { abilityId: number }) {
  const { ability, isLoading } = useAbilityById(abilityId);
  return <EntityName name={ability?.name ?? "Unknown Ability"} loading={isLoading} {...props} />;
}
