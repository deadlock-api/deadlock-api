/**
 * Valve's server regions as the demo headers name them (`server_clusters_dict`): `eu_west`, `us_south_central`,
 * `dpkt-frankfurt`. Each gets a readable name and the part of the world it serves.
 */

export const WORLD_AREAS = [
  "europe",
  "northAmerica",
  "southAmerica",
  "asia",
  "oceania",
  "middleEast",
  "africa",
] as const;
export type WorldArea = (typeof WORLD_AREAS)[number];

export const WORLD_AREA_LABEL: Record<WorldArea, string> = {
  europe: "Europe",
  northAmerica: "North America",
  southAmerica: "South America",
  asia: "Asia",
  oceania: "Oceania",
  middleEast: "Middle East",
  africa: "Africa",
};

const NAMES: Record<string, string> = {
  eu_west: "EU West",
  eu_north: "EU North",
  eu_east: "EU East",
  us_east: "US East",
  us_west: "US West",
  us_north_central: "US North Central",
  us_south_central: "US South Central",
  us_southeast: "US Southeast",
  us_southwest: "US Southwest",
  south_america: "South America",
  south_africa: "South Africa",
  hong_kong: "Hong Kong",
};

const AREAS: Record<string, WorldArea> = {
  eu_west: "europe",
  eu_north: "europe",
  eu_east: "europe",
  poland: "europe",
  spain: "europe",
  london: "europe",
  helsinki: "europe",
  falkenstein: "europe",
  frankfurt: "europe",
  vienna: "europe",
  stockholm: "europe",
  amsterdam: "europe",
  paris: "europe",
  us_east: "northAmerica",
  us_west: "northAmerica",
  us_north_central: "northAmerica",
  us_south_central: "northAmerica",
  us_southeast: "northAmerica",
  us_southwest: "northAmerica",
  south_america: "southAmerica",
  peru: "southAmerica",
  argentina: "southAmerica",
  chile: "southAmerica",
  brazil: "southAmerica",
  asia: "asia",
  hong_kong: "asia",
  japan: "asia",
  seoul: "asia",
  singapore: "asia",
  india: "asia",
  australia: "oceania",
  dubai: "middleEast",
  fujairah: "middleEast",
  south_africa: "africa",
};

/** Valve's dedicated-server partners prefix the city: `dpkt-frankfurt` is Frankfurt. */
function baseName(region: string): string {
  return region.toLowerCase().replace(/^dpkt-/, "");
}

/** A region's readable name: "EU West", "Hong Kong", "Frankfurt". */
export function regionName(region: string): string {
  const base = baseName(region);
  return (
    NAMES[base] ??
    base
      .split(/[_-]/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/** The part of the world a region serves; null for one not known yet. */
export function regionArea(region: string): WorldArea | null {
  return AREAS[baseName(region)] ?? null;
}
