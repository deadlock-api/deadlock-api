// The Worker's bindings (wrangler.jsonc). The Worker entry hands them to Start as request context (`context.env`),
// where server functions read them; under the Vite dev server there is no Worker, `env` is missing, and callers fall
// back.

/** A Workers rate limiting binding: `success` is false once the key used up its requests in the period. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The Workers Static Assets binding (`assets.binding`). */
export interface AssetsBinding {
  fetch(url: string): Promise<Response>;
}

/** The part of a D1 prepared statement the site uses. */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

/** The part of a D1 database binding the site uses; `batch` runs its statements in one transaction, in order. */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<{ results: T[] }[]>;
}

/** The part of an R2 bucket binding the site uses: listing keys, a page (up to 1000) at a time. */
export interface R2Bucket {
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export interface WorkerEnv {
  ASSETS?: AssetsBinding;
  AI_SEARCH_RATE_LIMITER?: RateLimiter;
  /** Guess the Rank's video catalog and votes (src/lib/guess-the-rank, migrations/guess-the-rank). */
  GUESS_THE_RANK_DB?: D1Database;
  /** Guess the Rank's videos, served publicly from https://guess-the-rank.deadlock-api.com. */
  GUESS_THE_RANK_VIDEOS?: R2Bucket;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: { env?: WorkerEnv } };
  }
}
