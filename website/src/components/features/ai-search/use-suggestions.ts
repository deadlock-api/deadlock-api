import { type QueryClient, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";

import { CACHE_DURATIONS } from "~/constants/cache";
import { bareMatchIdOf, matchLookupOf } from "~/lib/ai-search/lookup";
import { useDebouncedValue } from "~/lib/utils";

/** One row of the search's dropdown: the page the question routes to, a hero's page, or a player's tracker. */
export type Suggestion =
  | {
      kind: "page";
      key: string;
      id: string;
      href: string;
      title: string;
      filters: string[];
      heroId?: number;
      /** For a match's page: whether we have the match, once known. */
      stored?: boolean;
    }
  | { kind: "match"; key: string; matchId: number; href: string }
  | { kind: "hero"; key: string; id: number; href: string; name: string }
  | { kind: "player"; key: string; accountId: number; href: string; name: string; avatar?: string };

/** Heroes and players follow the typing closely; the page waits a little longer, since it asks the model. */
const LOOKUP_DELAY_MS = 250;
const ROUTE_DELAY_MS = 600;
const MAX_PLAYERS = 4;
/** A Steam name is a word or two; a longer question ("who counters abrams") only finds players by accident. */
const MAX_NAME_WORDS = 2;

const loadRouter = () => import("./route-question");

/**
 * Where a question routes, cached per question for the session so the dropdown and Enter share one model call. A
 * rate-limited answer is not kept: the same question may route once the minute is over.
 */
export function routeQueryOptions(queryClient: QueryClient, question: string) {
  return queryOptions({
    queryKey: ["ai-search", "route", question],
    queryFn: async () => (await loadRouter()).routeQuestion(queryClient, question),
    staleTime: (query) => (query.state.data?.kind === "rate_limited" ? 0 : Infinity),
    retry: false,
  });
}

/**
 * What the dropdown under the search offers for `question` while it is typed: the page the search would open, with
 * its filters, the hero pages it can mean, and the Steam players by that name. Each distinct question asks the model
 * at most once. `pagePending` holds while the page for the question as typed is still being worked out.
 */
export function useSuggestions(question: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const trimmed = question.trim();
  // A number (an account ID or a match) or a match lookup is not a Steam name; the Player Tracker row covers the ID.
  const nameLike =
    trimmed.split(/\s+/).length <= MAX_NAME_WORDS &&
    bareMatchIdOf(trimmed) === undefined &&
    matchLookupOf(trimmed) === undefined;
  const lookupTerm = useDebouncedValue(trimmed, LOOKUP_DELAY_MS);
  const routeTerm = useDebouncedValue(trimmed, ROUTE_DELAY_MS);

  const route = useQuery({ ...routeQueryOptions(queryClient, routeTerm), enabled: enabled && routeTerm.length >= 3 });
  const heroes = useQuery({
    queryKey: ["ai-search", "heroes", lookupTerm],
    queryFn: async () => (await loadRouter()).suggestHeroes(queryClient, lookupTerm),
    enabled: enabled && lookupTerm.length >= 2,
    staleTime: Infinity,
  });
  // Loaded with the first question, like the router, so the field in every page's sidebar stays light. The Steam
  // search answers 404 when no profile matches, which here is just no players.
  const players = useQuery({
    queryKey: ["ai-search", "players", lookupTerm],
    queryFn: async () => {
      const { steamSearchQueryOptions } = await import("~/queries/steam-queries");
      return queryClient.query(steamSearchQueryOptions(lookupTerm));
    },
    enabled: enabled && nameLike && lookupTerm.length >= 2,
    staleTime: Infinity,
    retry: false,
  });

  // Whether we have the match a number names: a bare number only offers a match we have, "match <id>" says whether
  // it is stored. One row looked up by its key, loaded with the first question like the rest of the search.
  const matchId = bareMatchIdOf(lookupTerm) ?? matchLookupOf(lookupTerm);
  const stored = useQuery({
    queryKey: ["ai-search", "match-stored", matchId],
    queryFn: async () => {
      const { graphql } = await import("~/lib/graphql");
      const result = await graphql.query({
        matches: { __args: { where: { match_id: { eq: matchId } }, limit: 1 }, match_id: true },
      });
      return result.matches.length > 0;
    },
    enabled: enabled && matchId !== undefined,
    staleTime: CACHE_DURATIONS.FIVE_MINUTES,
    retry: false,
  });
  const matchStored = matchId !== undefined && lookupTerm === trimmed ? stored.data : undefined;

  const routed = route.data?.kind === "opened" && routeTerm === trimmed ? route.data : undefined;
  const page: Suggestion[] = routed
    ? [
        {
          kind: "page",
          key: `page:${routed.href}`,
          id: routed.id,
          href: routed.href,
          title: routed.title,
          filters: routed.filters,
          heroId: routed.heroId,
          stored: routed.id === "match" ? matchStored : undefined,
        },
      ]
    : [];
  const pagePath = routed?.href.split("#")[0];
  // A bare number opens a player's tracker first; it may just as well be a match.
  const bareMatchId = bareMatchIdOf(trimmed);
  const matchRows: Suggestion[] =
    bareMatchId !== undefined && matchStored === true && pagePath !== `/matches/${bareMatchId}`
      ? [{ kind: "match", key: `match:${bareMatchId}`, matchId: bareMatchId, href: `/matches/${bareMatchId}` }]
      : [];
  const heroRows: Suggestion[] = (lookupTerm === trimmed ? (heroes.data ?? []) : [])
    .filter((hero) => hero.href !== pagePath)
    .map((hero) => ({ kind: "hero", key: `hero:${hero.id}`, id: hero.id, href: hero.href, name: hero.name }));
  const playerRows: Suggestion[] = (nameLike && lookupTerm === trimmed && !players.isError ? (players.data ?? []) : [])
    .slice(0, MAX_PLAYERS)
    .map((profile) => ({
      kind: "player",
      key: `player:${profile.account_id}`,
      accountId: profile.account_id,
      href: `/tracker/players/${profile.account_id}`,
      name: profile.personaname,
      avatar: profile.avatarmedium || profile.avatar,
    }));

  return {
    page,
    matches: matchRows,
    heroes: heroRows,
    players: playerRows,
    all: [...page, ...matchRows, ...heroRows, ...playerRows],
    pagePending: trimmed.length >= 3 && (routeTerm !== trimmed || route.isFetching),
  };
}
