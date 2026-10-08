// The Worker's bindings (wrangler.jsonc), for server code that runs inside a request: the Worker entry hands them over
// before it renders. Under the Vite dev server there is no Worker, so every binding is missing and callers fall back.

/** A Workers rate limiting binding: `success` is false once the key used up its requests in the period. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface WorkerEnv {
  AI_SEARCH_RATE_LIMITER?: RateLimiter;
}

let current: WorkerEnv = {};

/** Called by the Worker entry with each request's `env`, which is the same object for every request of an isolate. */
export function setWorkerEnv(env: WorkerEnv | undefined): void {
  current = env ?? {};
}

export function workerEnv(): WorkerEnv {
  return current;
}
