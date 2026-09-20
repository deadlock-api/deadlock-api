import { Skeleton } from "~/components/ui/skeleton";
import { useAbilityById } from "~/hooks/useAssetById";
import { cn } from "~/lib/utils";

export function AbilityName({
  abilityId,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { abilityId: number }) {
  const { ability, isLoading } = useAbilityById(abilityId);

  if (isLoading) {
    return <Skeleton className={cn("inline-block h-4 w-20", className)} />;
  }

  return (
    <span className={cn("truncate", className)} {...props}>
      {ability?.name ?? "Unknown Ability"}
    </span>
  );
}
