// What a page marks with `data-find`, so a link can point at it (`#find-<key>`, outlined by FindOnPage): a hero's row
// or tile, an item's, or the spot that shows one stat. The page registry builds the same keys from a question.

export const findKey = {
  hero: (id: number) => `hero-${id}`,
  item: (id: number) => `item-${id}`,
  /** The page's own key for the stat: `avg_duration_s` on the games overview, `avg_kills_per_match` on a scoreboard. */
  stat: (key: string) => `stat-${key}`,
};
