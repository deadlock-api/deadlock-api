import { type AxiosInstance, create } from "axios";

export function createApiClient(timeout: number): AxiosInstance {
  return create({
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
}
