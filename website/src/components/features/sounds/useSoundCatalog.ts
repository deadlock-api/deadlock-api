import { useQuery } from "@tanstack/react-query";
import type { Hero } from "deadlock_api_client";
import { useMemo } from "react";

import { combineQueryStates } from "~/components/patterns/states/QueryRenderer";
import { heroCodename } from "~/lib/hero-roster";
import { countSounds, heroMentionFinder, humanizeSoundName, isSoundTree, type SoundTree } from "~/lib/sounds";
import { soundHeroesQueryOptions, soundIndexQueryOptions } from "~/queries/sound-queries";

/** Voice folders that are not heroes, by the name players know them by. */
const VOICE_NAMES: Record<string, string> = {
  announcer: "Announcer",
  neutral_gremlin: "Gremlin",
  npc_reporter: "Reporter",
  spirit_jar: "Spirit Jar",
  t1_guardians: "Guardians",
};

export interface VoiceCharacter {
  /** The voice folder, also the URL value. */
  id: string;
  name: string;
  hero: Hero | undefined;
  count: number;
}

export interface SoundCatalog {
  index: SoundTree;
  vo: SoundTree;
  /** Codename to display name, for labels that mention a hero (`kill_hornet` -> "Kill Vindicta"). */
  names: ReadonlyMap<string, string>;
  heroes: ReadonlyMap<string, Hero>;
  /** Heroes first, then the other voices, each by name. */
  characters: VoiceCharacter[];
  /** Finds the hero a line is about in its file name's words. */
  findHero: ReturnType<typeof heroMentionFinder>;
}

export function nameOf(catalog: Pick<SoundCatalog, "names">, codename: string): string {
  return catalog.names.get(codename) ?? VOICE_NAMES[codename] ?? humanizeSoundName(codename);
}

export function useSoundCatalog() {
  const indexQuery = useQuery(soundIndexQueryOptions);
  const heroesQuery = useQuery(soundHeroesQueryOptions);
  const state = combineQueryStates(indexQuery, heroesQuery);

  const catalog = useMemo((): SoundCatalog | undefined => {
    const index = indexQuery.data;
    if (!index || !heroesQuery.data) return undefined;
    const heroes = new Map<string, Hero>();
    const names = new Map<string, string>();
    for (const hero of heroesQuery.data) {
      const codename = heroCodename(hero.class_name);
      heroes.set(codename, hero);
      names.set(codename, hero.name);
    }
    const vo = isSoundTree(index.vo) ? index.vo : {};
    const characters = Object.entries(vo)
      .filter((entry): entry is [string, SoundTree] => isSoundTree(entry[1]))
      .map(([id, tree]) => ({
        id,
        name: nameOf({ names }, id),
        hero: heroes.get(id),
        count: countSounds(tree),
      }))
      .sort((a, b) => Number(!a.hero) - Number(!b.hero) || a.name.localeCompare(b.name));
    const findHero = heroMentionFinder([...names].map(([codename, name]) => ({ codename, name })));
    return { index, vo, names, heroes, characters, findHero };
  }, [indexQuery.data, heroesQuery.data]);

  return { catalog, ...state, refetch: () => Promise.all([indexQuery.refetch(), heroesQuery.refetch()]) };
}
