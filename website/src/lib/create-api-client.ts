import { type AxiosInstance, create } from "axios";

import { serverApiKeyHeaders } from "~/lib/server-api-key";

/** The SDK's Axios client. On the server, requests to `apiOrigin` carry the website's API key. */
export function createApiClient(timeout: number, apiOrigin: string): AxiosInstance {
  const client = create({
    timeout,
    headers: {
      Accept: "application/json",
    },
    // Workers rejects the browser-only cache defaults Axios adds to Request.
    // Passing the URL directly to fetch preserves the runtime's own defaults.
    // @ts-expect-error Axios supports null Request, but its constructor type omits it.
    env:
      typeof window === "undefined"
        ? {
            Request: null,
          }
        : undefined,
  });
  // Read per request: the Worker's secrets are in `process.env` by the time a request runs. Only requests to the API
  // carry the key; the client also fetches from other origins.
  if (typeof window === "undefined") {
    const keyOrigin = new URL(apiOrigin).origin;
    client.interceptors.request.use((config) => {
      if (new URL(client.getUri(config)).origin !== keyOrigin) return config;
      for (const [name, value] of Object.entries(serverApiKeyHeaders())) config.headers.set(name, value);
      return config;
    });
  }
  return client;
}
