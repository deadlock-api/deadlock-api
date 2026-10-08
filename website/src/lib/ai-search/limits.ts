/** Longer than any real question; it also bounds what one search can cost. The field and the server both hold to it. */
export const MAX_QUESTION_LENGTH = 200;

/** Questions one visitor may ask the model a minute; the Worker's `AI_SEARCH_RATE_LIMITER` binding holds the same. */
export const QUESTIONS_PER_MINUTE = 10;
