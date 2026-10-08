import { queryOptions } from "@tanstack/react-query";
import type { Hero } from "deadlock_api_client";

import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { isSoundTree, type SoundTree } from "~/lib/sounds";

import { queryKeys } from "./query-keys";

/**
 * The whole sound index: about 1 MB on the wire, 17 MB of JSON. It is only read in the browser (the sound browser
 * renders its list after hydration), never dehydrated into the HTML.
 */
export const soundIndexQueryOptions = queryOptions({
  queryKey: queryKeys.assets.sounds(),
  queryFn: async (): Promise<SoundTree> => {
    const res = await api.assets_bucket_api.sounds();
    if (!isSoundTree(res.data)) throw new Error("Unexpected sound index");
    return res.data;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});

/** Every hero, retired and unreleased ones too: voice folders exist for heroes the roster no longer lists. */
export const soundHeroesQueryOptions = queryOptions({
  queryKey: ["assets-heroes-all"],
  queryFn: async (): Promise<Hero[]> => {
    const res = await api.heroes_api.listHeroes({ onlyActive: false });
    return res.data;
  },
  staleTime: CACHE_DURATIONS.FOREVER,
});
