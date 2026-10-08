import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { type DecideAnswers, decideRequestBody, type QuestionEntities, requestDecision } from "./decide";
import { MAX_QUESTION_LENGTH } from "./limits";
import { allowQuestion } from "./rate-limit";

// The one call that needs the Mercury API key, so it runs in the Worker and the key never reaches a browser. The
// browser sends the question and the names it found in it; the Worker adds the routing questions and the key.

const MAX_NAMES = 12;
const MAX_NAME_LENGTH = 40;
const MAX_RANKS = 16;

interface DecideSearchInput {
  question: string;
  entities: QuestionEntities;
  rankNames: string[];
}

function names(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid search request");
  return value.map((name) => {
    if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LENGTH) {
      throw new Error("Invalid search request");
    }
    return name;
  });
}

/** Checks a request from the browser: a short question and a few short names, nothing else. */
export function validateDecideInput(input: unknown): DecideSearchInput {
  const data = (input ?? {}) as Partial<Record<keyof DecideSearchInput, unknown>>;
  const question = typeof data.question === "string" ? data.question.trim() : "";
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) throw new Error("Invalid search request");
  const entities = (data.entities ?? {}) as Partial<Record<keyof QuestionEntities, unknown>>;
  return {
    question,
    entities: {
      heroes: names(entities.heroes, MAX_NAMES),
      enemies: names(entities.enemies, MAX_NAMES),
      items: names(entities.items, MAX_NAMES),
    },
    rankNames: names(data.rankNames, MAX_RANKS),
  };
}

/**
 * What the browser hears when there is no decision: the visitor asked too much, or the model failed (an outage, an
 * empty balance, a missing key). The cause of a failure goes to the Worker's logs, not to the visitor.
 */
type DecideSearchResult = { ok: true; answers: DecideAnswers } | { ok: false; reason: "rate_limited" | "unavailable" };

const unavailable = (...why: unknown[]): DecideSearchResult => {
  console.error("ai-search:", ...why);
  return { ok: false, reason: "unavailable" };
};

/** Mercury Decide's answers for a question: a choice with probabilities for the page and for each filter. */
export const decideSearch = createServerFn({ method: "POST" })
  .validator(validateDecideInput)
  .handler(async ({ data, context }): Promise<DecideSearchResult> => {
    // The dev server has no Cloudflare in front, and counts everyone as one visitor.
    const ip = getRequestHeader("cf-connecting-ip") ?? "local";
    if (!(await allowQuestion(ip, context.env?.AI_SEARCH_RATE_LIMITER))) return { ok: false, reason: "rate_limited" };
    const key = process.env.INCEPTION_API_KEY;
    if (!key) return unavailable("INCEPTION_API_KEY is not set");
    let response: Response;
    try {
      response = await requestDecision(key, decideRequestBody(data.question, data.entities, data.rankNames), 15_000);
    } catch (error) {
      return unavailable("Mercury did not answer", error);
    }
    // 402 is an empty balance, 429 Mercury's own rate limit, 5xx an outage.
    if (!response.ok) return unavailable(`Mercury answered ${response.status}`, (await response.text()).slice(0, 300));
    const decision = (await response.json()) as { answers: DecideAnswers };
    return { ok: true, answers: decision.answers };
  });
