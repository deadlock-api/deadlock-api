import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { type DecideAnswers, decideRequestBody, decideWithFallback, type QuestionEntities } from "./decide";
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

/**
 * Mercury Decide's answers for a question: a choice with probabilities for the page and for each filter. Inception's
 * API answers first; OpenRouter's free endpoint answers when it fails.
 */
export const decideSearch = createServerFn({ method: "POST" })
  .validator(validateDecideInput)
  .handler(async ({ data, context }): Promise<DecideSearchResult> => {
    // The dev server has no Cloudflare in front, and counts everyone as one visitor.
    const ip = getRequestHeader("cf-connecting-ip") ?? "local";
    if (!(await allowQuestion(ip, context.env?.AI_SEARCH_RATE_LIMITER))) return { ok: false, reason: "rate_limited" };
    const answers = await decideWithFallback(
      decideRequestBody(data.question, data.entities, data.rankNames),
      process.env,
      { timeoutMs: 8_000, onFailure: (provider, why) => console.error(`ai-search: ${provider} ${why}`) },
    );
    return answers ? { ok: true, answers } : { ok: false, reason: "unavailable" };
  });
