import { type Hero, HeroDevelopmentState } from "deadlock_api_client";

/** A released hero anyone can pick in matchmaking (`development_state` is `release`, build 6711+). */
export function isPlayableHero(hero: Pick<Hero, "development_state" | "disabled">): boolean {
  return hero.development_state === HeroDevelopmentState.Release && !hero.disabled;
}
