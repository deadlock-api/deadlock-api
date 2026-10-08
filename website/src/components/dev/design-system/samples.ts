/** Sample data the specimens share, so every chapter shows the same items and abilities. */

/** One item of each slot: weapon, vitality, spirit. */
export const SAMPLE_ITEM_IDS = [1548066885, 968099481, 2678489038];
/** Seven's three signature abilities and ultimate. */
export const SAMPLE_ABILITY_IDS = [1065103387, 1074714947, 539192269, 2061574352];
/** An id no asset has, for the fallback state. */
export const UNKNOWN_ID = 0;

/** A win rate tick or reading on the sample charts: 0.534 -> "53%". */
export const percent = (value: number) => `${Math.round(value * 100)}%`;
