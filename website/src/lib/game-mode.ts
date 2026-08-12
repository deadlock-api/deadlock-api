import { type Mode, MODE_CONFIG } from "~/components/selectors/ModeSelector";

export function getEffectiveRankRange(
  mode: Mode,
  minRankId: number | null | undefined,
  maxRankId: number | null | undefined,
): { effectiveMinRankId: number | undefined; effectiveMaxRankId: number | undefined } {
  if (!MODE_CONFIG[mode].supportsRank) {
    return { effectiveMinRankId: undefined, effectiveMaxRankId: undefined };
  }
  return {
    effectiveMinRankId: minRankId ?? undefined,
    effectiveMaxRankId: maxRankId ?? undefined,
  };
}
