/** 1-based position of `value` among `values` when sorted from highest to lowest. */
export function rankOf(value: number, values: number[]): number {
  return 1 + values.filter((other) => other > value).length;
}
