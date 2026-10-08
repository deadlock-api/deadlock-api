/** URL slug derived from a display name (e.g. "Grey Talon" -> "grey-talon"). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The candidate a numeric URL segment names by id ("15" for the hero with id 15): links built from API ids. */
export function findByIdSegment<T extends { id: number }>(candidates: readonly T[], segment: string): T | undefined {
  if (!/^\d+$/.test(segment)) return undefined;
  return candidates.find((candidate) => candidate.id === Number(segment));
}

/** Edits between two strings, a swap of two neighbouring letters ("bebpo") counting as one: the commonest typo. */
export function editDistance(a: string, b: string): number {
  // Three rows: the one before the previous is what a swap reads.
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    before = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * The candidate a mistyped or partial `slug` most likely meant: the closest slug within about a third of its length in
 * edits, else the only slug that contains it ("doorman" for "the-doorman").
 */
export function closestNameBySlug<T extends { name: string }>(candidates: readonly T[], slug: string): T | undefined {
  const target = slugify(slug);
  let best: T | undefined;
  let bestDistance = Math.max(2, Math.floor(target.length / 3)) + 1;
  for (const candidate of candidates) {
    const distance = editDistance(target, slugify(candidate.name));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (best || target.length < 4) return best;
  const containing = candidates.filter((candidate) => slugify(candidate.name).includes(target));
  return containing.length === 1 ? containing[0] : undefined;
}
