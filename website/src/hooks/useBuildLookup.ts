import { useQueryClient } from "@tanstack/react-query";

import type { HeroBuild } from "~/lib/wasm/hero-build";
import { heroBuildCodecQueryOptions } from "~/lib/wasm/load-hero-build";
import { WasmCallError } from "~/lib/wasm/module";
import { heroBuildLookupQueryOptions } from "~/queries/hero-build-stats-query";

export type BuildLookupResult = { status: "found" } | { status: "none" } | { status: "problem"; message: string };

const FOUND: BuildLookupResult = { status: "found" };
const problem = (message: string): BuildLookupResult => ({ status: "problem", message });

export interface BuildIdChoice {
  buildId: number;
  /** The hero the build is for, which the page switches to. */
  heroId: number;
}

/** A whole number typed as a build ID, or null for anything else. */
export function parseBuildId(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Finds a published build from what a player has: its ID, as builds are shared, or a build code copied in game. A
 * found build goes to `onFound` with the hero it is for. A code of a build that is not published (a player's own, or an
 * edited copy, which keeps the ID it was copied from) goes to `onUnpublishedBuild`. `lookUp` answers `found` once the
 * build was handed on, `none` for text that is neither an ID nor a build code (a name to search for), and the problem
 * in words otherwise.
 */
export function useBuildLookup({
  onFound,
  onUnpublishedBuild,
}: {
  onFound: (choice: BuildIdChoice) => void;
  /** A pasted game build that is not published; without it, such a code is answered as not published. */
  onUnpublishedBuild?: (build: HeroBuild) => void;
}) {
  const queryClient = useQueryClient();

  const lookUp = async (text: string): Promise<BuildLookupResult> => {
    const trimmed = text.trim();
    if (!trimmed) return { status: "none" };
    if (/^\d+$/.test(trimmed)) {
      const id = parseBuildId(trimmed);
      if (id === null) return problem("A build ID is a whole number");
      const build = await queryClient.query(heroBuildLookupQueryOptions(id));
      if (!build) return problem(`No published build has the ID ${id}`);
      onFound({ buildId: build.buildId, heroId: build.heroId });
      return FOUND;
    }
    let pasted: HeroBuild;
    try {
      pasted = (await queryClient.query(heroBuildCodecQueryOptions)).decode(trimmed);
    } catch (caught) {
      if (caught instanceof WasmCallError) return { status: "none" };
      throw caught;
    }
    const id = pasted.hero_build_id ?? 0;
    const published = id > 0 ? await queryClient.query(heroBuildLookupQueryOptions(id)) : null;
    // An edited copy keeps the ID of the build it was copied from, often another hero's.
    if (published && published.heroId === pasted.hero_id) {
      onFound({ buildId: published.buildId, heroId: published.heroId });
      return FOUND;
    }
    if (!onUnpublishedBuild) return problem("This build is not published");
    onUnpublishedBuild(pasted);
    return FOUND;
  };

  return { lookUp };
}
