import { createServerFn } from "@tanstack/react-start";

import { type DecideAnswers, decideRequestBody, DECIDE_URL, type QuestionEntities } from "./decide";
import { MAX_QUESTION_LENGTH } from "./limits";

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

/** Mercury Decide's answers for a question: a choice with probabilities for the page and for each filter. */
export const decideSearch = createServerFn({ method: "POST" })
  .validator(validateDecideInput)
  .handler(async ({ data }): Promise<DecideAnswers> => {
    const key = process.env.INCEPTION_API_KEY;
    if (!key) throw new Error("The search is not configured");
    const response = await fetch(DECIDE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(decideRequestBody(data.question, data.entities, data.rankNames)),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`The search model answered ${response.status}`);
    const decision = (await response.json()) as { answers: DecideAnswers };
    return decision.answers;
  });
