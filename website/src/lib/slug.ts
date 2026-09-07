/** URL slug derived from a display name (e.g. "Grey Talon" -> "grey-talon"). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
