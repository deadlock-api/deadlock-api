// The website server's own API key (the Worker secret `DEADLOCK_API_KEY`). Requests the server makes (SSR, loaders,
// server functions, OG images) all reach the API from one Cloudflare Worker, so without a key they share one identity:
// one rate limit bucket and one capped share of the API's database query slots. With the key they get the key
// quotas and are exempt from the per-client share. Browser requests never carry it; they are counted per visitor.

/** `{ "X-API-Key": key }` on the server when the key is configured, else nothing. Never set in the browser. */
export function serverApiKeyHeaders(): Record<string, string> {
  if (typeof window !== "undefined" || typeof process === "undefined") return {};
  const key = process.env.DEADLOCK_API_KEY;
  return key ? { "X-API-Key": key } : {};
}
