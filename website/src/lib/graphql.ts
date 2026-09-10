import { createClient } from "deadlock_api_graphql_client";

import { API_ORIGIN } from "~/lib/constants";

/** A non-2xx GraphQL response. The generated client keeps only the status text, which HTTP/2 leaves empty. */
export class GraphqlHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GraphqlHttpError";
  }
}

export const graphql = createClient({
  url: `${API_ORIGIN}/v1/graphql`,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);
    if (!response.ok) throw new GraphqlHttpError(response.status, `${response.status}: ${await response.text()}`);
    return response;
  },
});

export function isGraphqlRateLimited(error: unknown): boolean {
  return error instanceof GraphqlHttpError && error.status === 429;
}
