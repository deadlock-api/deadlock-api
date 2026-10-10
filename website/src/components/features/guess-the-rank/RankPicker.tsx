import { AnswerOption, revealedState } from "~/components/domain/minigames/AnswerOption";
import type { RankTierWinRate } from "~/components/domain/rank/RankTierWinRateChart";
import { ImgWithSkeleton } from "~/components/ui/img-with-skeleton";
import { Text } from "~/components/ui/text";

export type RankTier = Pick<RankTierWinRate, "tier" | "name" | "color" | "image">;

/**
 * The rank tiers to guess from, each a badge and its name. Before the answer one tier can be picked (and changed);
 * once `answer` is set the right tier is marked, a wrong pick flagged and the rest faded, and nothing can be picked.
 */
export function RankPicker({
  tiers,
  value,
  onValueChange,
  answer,
  disabled = false,
}: {
  tiers: readonly RankTier[];
  value: number | null;
  onValueChange: (tier: number) => void;
  answer?: number;
  disabled?: boolean;
}) {
  const revealed = answer !== undefined;
  return (
    <div className="@container">
      <fieldset className="grid grid-cols-3 gap-2 @md:grid-cols-4 @2xl:grid-cols-6">
        <legend className="sr-only">Rank tier</legend>
        {tiers.map((tier) => (
          <AnswerOption
            key={tier.tier}
            variant="card"
            state={
              revealed
                ? revealedState(tier.tier === answer, tier.tier === value)
                : tier.tier === value
                  ? "selected"
                  : "idle"
            }
            aria-pressed={revealed ? undefined : tier.tier === value}
            aria-disabled={revealed || disabled || undefined}
            onClick={() => onValueChange(tier.tier)}
          >
            {tier.image && <ImgWithSkeleton src={tier.image} alt="" className="size-12 object-contain" />}
            <Text variant="caption" wrap="truncate" className="w-full">
              {tier.name}
            </Text>
          </AnswerOption>
        ))}
      </fieldset>
    </div>
  );
}
