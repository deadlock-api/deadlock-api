import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { type DecideAnswers, decideRequestBody, DECIDE_URL, type QuestionEntities } from "./decide";
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

/** Why the search has no answer: too many questions from this visitor, the model failed, or no key is set. */
export type DecideFailure = "rate_limited" | "unavailable" | "not_configured";

export type DecideSearchResult = { ok: true; answers: DecideAnswers } | { ok: false; reason: DecideFailure };

/** The asker's address as Cloudflare saw it; the dev server has no such header and counts everyone as one. */
function clientIp(): string {
  return getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/**
 * Mercury Decide's answers for a question: a choice with probabilities for the page and for each filter. A failure is
 * an answer too, so the browser can tell the asker which kind it was; each is logged for the Worker's logs.
 */
export const decideSearch = createServerFn({ method: "POST" })
  .validator(validateDecideInput)
  .handler(async ({ data }): Promise<DecideSearchResult> => {
    if (!(await allowQuestion(clientIp()))) return { ok: false, reason: "rate_limited" };
    const key = process.env.INCEPTION_API_KEY;
    if (!key) {
      console.error("ai-search: INCEPTION_API_KEY is not set");
      return { ok: false, reason: "not_configured" };
    }
    let response: Response;
    try {
      response = await fetch(DECIDE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(decideRequestBody(data.question, data.entities, data.rankNames)),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      console.error("ai-search: Mercury did not answer", error);
      return { ok: false, reason: "unavailable" };
    }
    if (!response.ok) {
      // 402 is an empty balance, 429 Mercury's own rate limit, 5xx an outage.
      console.error(`ai-search: Mercury answered ${response.status}`, (await response.text()).slice(0, 300));
      return { ok: false, reason: "unavailable" };
    }
    const decision = (await response.json()) as { answers: DecideAnswers };
    return { ok: true, answers: decision.answers };
  });
