import {
  MODES,
  PAGE_REGISTRY,
  pageSlots,
  registeredPage,
  REGIONS,
  type SelectionMode,
  type SelectionTime,
  SORT_KEYS,
  type SortKey,
  TIMES,
} from "~/lib/page-registry";

import { findMentions, heroTeams } from "./entities";
import { type IntentVocabulary, NO_FILTERS, type SearchIntent } from "./intent";

// The search asks Mercury Decide, a classifier, where a question's answer lives. Each part of the routing is one
// multiple-choice question about the visitor's question, answered with a probability per choice, which also says how
// sure the model is. Heroes and items are found in code (`entities.ts`), which is certain and instant,
// and handed to the model as context.

export const DECIDE_URL = "https://api.inceptionlabs.ai/v1/decisions";
export const DECIDE_MODEL = "mercury-decide";

/**
 * The search opens a page only when the model gives its best page at least this much and does not pick "none". On
 * 1,000 real questions and 50 off-topic ones ("test", other games, support), this kept every real question and stopped
 * 48 of the off-topic ones.
 */
const MIN_PAGE_PROBABILITY = 0.5;

const NONE = "none";

/** What a classifier does not know about Deadlock but needs to read a player's question. */
function glossary(rankNames: readonly string[]): string {
  return [
    "Deadlock is Valve's 6v6 hero shooter MOBA. The two team sides are the Hidden King and the Archmother.",
    "Souls are the currency (gold, net worth). Troopers are the lane creeps (minions); neutrals are jungle camps.",
    "Street Brawl is a separate 4v4 mode.",
    `Ranks from lowest to highest: ${rankNames.join(", ")}. "elo" means rank; "low elo" is the lowest few ranks, "high elo" the top three.`,
    '"op", "broken", "meta" and "strong" ask how good heroes are; "counter" asks which heroes beat a hero.',
  ].join(" ");
}

const TIME_CRITERIA: Record<SelectionTime, string> = {
  current_patch: "this patch, the current patch, since the last patch, after the update",
  previous_patch: "the previous patch, last patch, before the patch",
  current_season: "this season",
  previous_season: "last season, the previous season",
  last_7_days: "the last week, past 7 days",
  last_30_days: "the last month, past 30 days",
};

const SORT_CRITERIA: Record<SortKey, string> = {
  winrate: "win rate, winning, best",
  pickrate: "pick rate, popularity, most played",
  banrate: "ban rate, most banned",
  matches: "number of matches or games",
  wins: "number of wins",
  losses: "number of losses",
  kills: "kills",
  deaths: "deaths, dying",
  assists: "assists",
  kda: "KDA, kill death assist ratio",
  souls: "souls, net worth, farm, gold",
  damage: "damage dealt to players",
  damage_taken: "damage taken, tankiness",
  boss_damage: "damage to bosses and objectives",
  creep_damage: "damage to troopers and creeps",
  neutral_damage: "damage to neutral camps",
  healing: "healing",
  last_hits: "last hits, creep score",
  denies: "denies",
  creep_kills: "troopers or creeps killed",
  neutral_kills: "neutral camps or jungle creeps killed",
  max_health: "max health, hp",
  level: "player level",
  permanent_buffs: "golden statue buffs picked up",
  accuracy: "accuracy, aim",
  shots_hit: "shots hit",
  shots_missed: "shots missed",
  hero_hits: "bullets hit on heroes",
  crits: "crits, headshots",
  duration: "match length, game duration",
};

const REGION_CRITERIA: Record<(typeof REGIONS)[number], string> = {
  Europe: "Europe, EU",
  Asia: "Asia, SEA, China, Japan, Korea",
  NAmerica: "North America, NA, US, Canada",
  SAmerica: "South America, SA, Brazil",
  Oceania: "Oceania, OCE, Australia",
};

/**
 * Words that must be in the question for a mode to count. The model reads "in eternus" as ranked play, but the rank
 * filter already narrows to ranked lobbies, and a mode the asker did not name would only hide matches.
 */
const MODE_WORDS: Record<SelectionMode, RegExp> = {
  ranked: /\b(ranked|comp|competitive|solo ?q(ueue)?)\b/i,
  unranked: /\b(unranked|casual|normals?|quick ?play)\b/i,
  street_brawl: /\b(street ?brawl|brawl|4v4)\b/i,
};

/** "phantom+", "phantom and up": an open upper end, even where the model also picked Phantom as the top. */
const OPEN_UPWARDS = /\+|\b(and|or) (up|above|higher|better)\b|\bplus\b|\babove\b/i;

/** The heroes and items a question names, found in code before the model is asked. */
export interface QuestionEntities {
  heroes: string[];
  /** Heroes after a "vs": the other team, on the team builder. */
  enemies: string[];
  items: string[];
}

export function questionEntities(question: string, vocabulary: IntentVocabulary): QuestionEntities {
  const { heroes, enemies } = heroTeams(question, vocabulary.heroNames);
  return { heroes, enemies, items: findMentions(question, vocabulary.itemNames).map((mention) => mention.name) };
}

type Criteria = Record<string, string>;

function withNone(criteria: Criteria, none: string): Criteria {
  return { [NONE]: none, ...criteria };
}

/** One choice per registered page, and "none" for a question no page answers. The same for every question. */
const PAGE_CRITERIA = withNone(
  Object.fromEntries(
    PAGE_REGISTRY.map((page) => [page.id, `${page.description}.${page.context ? ` ${page.context}` : ""}`]),
  ),
  "no page of the site shows this: the question is not about Deadlock stats, or is not a question",
);

interface DecideRequestBody {
  model: string;
  state: unknown;
  questions: Record<string, { type: "choice"; instructions: string; criteria: Criteria }>;
}

/** The decision request for a question: one choice for the page, one for each filter. */
export function decideRequestBody(
  question: string,
  entities: QuestionEntities,
  rankNames: readonly string[],
): DecideRequestBody {
  const ranks = Object.fromEntries(rankNames.map((name, i) => [name, `${name}, rank ${i + 1} of ${rankNames.length}`]));
  return {
    model: DECIDE_MODEL,
    state: {
      site: "deadlock-api.com, a stats website for Valve's game Deadlock",
      game: glossary(rankNames),
      question,
      heroes_named: [...entities.heroes, ...entities.enemies],
      items_named: entities.items,
    },
    questions: {
      page: {
        type: "choice",
        instructions: "Which page of the site shows the answer to the question?",
        criteria: PAGE_CRITERIA,
      },
      rank_min: {
        type: "choice",
        instructions: 'The lowest rank the question limits the stats to ("phantom+", "eternus games", "high elo").',
        criteria: withNone(ranks, "the question sets no lower rank limit"),
      },
      rank_max: {
        type: "choice",
        instructions: 'The highest rank the question limits the stats to ("below oracle", "low elo").',
        criteria: withNone(ranks, "the question sets no upper rank limit"),
      },
      mode: {
        type: "choice",
        instructions: "The game mode the question limits the stats to.",
        criteria: withNone(
          { ranked: "ranked games", unranked: "unranked or casual games", street_brawl: "Street Brawl, the 4v4 mode" },
          "the question names no mode",
        ),
      },
      time: {
        type: "choice",
        instructions: "The time window the question limits the stats to.",
        criteria: withNone(TIME_CRITERIA, "the question names no time window"),
      },
      region: {
        type: "choice",
        instructions: "The region the question asks about.",
        criteria: withNone(REGION_CRITERIA, "the question names no region"),
      },
      sort: {
        type: "choice",
        instructions: "The stat the question ranks or compares by.",
        criteria: withNone(SORT_CRITERIA, "the question ranks by no particular stat"),
      },
    },
  };
}

interface ChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
}

/** The part of a decision the search reads. */
export type DecideAnswers = Record<string, ChoiceAnswer | undefined>;

function chosen<T extends string>(answer: ChoiceAnswer | undefined, values: readonly T[]): T | null {
  return answer && values.includes(answer.choice as T) ? (answer.choice as T) : null;
}

/** The decision as an intent: the likeliest page and the filters the question set; no page for a question the model could not place. */
export function intentFromDecision(
  answers: DecideAnswers,
  question: string,
  entities: QuestionEntities,
  rankNames: readonly string[],
): SearchIntent {
  const [best] = Object.entries(answers.page?.probabilities ?? {})
    .filter(([id]) => registeredPage(id) !== undefined)
    .sort((a, b) => b[1] - a[1]);
  // "test", a question about another game: no page at all, rather than the least wrong one.
  const page =
    answers.page?.choice !== NONE && best && best[1] >= MIN_PAGE_PROBABILITY ? registeredPage(best[0]) : undefined;
  const mode = chosen(answers.mode, MODES);
  const rankMin = chosen(answers.rank_min, rankNames);
  const rankMax = chosen(answers.rank_max, rankNames);
  // A page that reads an enemy keeps the two sides of "haze vs bebop"; everywhere else both are heroes of the question.
  const twoTeams = page !== undefined && pageSlots(page).has("enemyHeroes");
  return {
    ...NO_FILTERS,
    page: page?.id ?? null,
    heroes: twoTeams ? entities.heroes : [...entities.heroes, ...entities.enemies],
    enemy_heroes: twoTeams ? entities.enemies : [],
    items: entities.items,
    rank_min: rankMin,
    rank_max: rankMax === rankMin && OPEN_UPWARDS.test(question) ? null : rankMax,
    mode: mode && MODE_WORDS[mode].test(question) ? mode : null,
    time: chosen(answers.time, TIMES),
    region: chosen(answers.region, REGIONS),
    sort: chosen(answers.sort, SORT_KEYS),
  };
}
