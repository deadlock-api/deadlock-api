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

export interface WorkerEnv {
  ASSETS?: AssetsBinding;
  AI_SEARCH_RATE_LIMITER?: RateLimiter;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: { env?: WorkerEnv } };
  }
}
