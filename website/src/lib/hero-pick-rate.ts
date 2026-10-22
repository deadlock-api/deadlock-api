/**
 * A hero's pick rate: the share of the matches it could have been picked in that it was, `multiplier` heroes a match
 * (`getPickrateMultiplier`). The API counts those matches from the hero's first day in the response on
 * (`bucket_matches_since_first_day`), so the part of a range before a hero's release does not dilute its rate. Rows
 * added over buckets (subtiers into a rank, badges into a band) add both fields.
 */
export function heroPickRate(
  row: { matches: number; bucket_matches_since_first_day: number },
  multiplier: number,
): number {
  return row.bucket_matches_since_first_day > 0 ? (multiplier * row.matches) / row.bucket_matches_since_first_day : 0;
}
