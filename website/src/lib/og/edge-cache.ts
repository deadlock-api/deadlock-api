/**
 * Answers a share card from the Workers edge cache, keyed by the card's canonical URL (`url`'s origin and path with
 * `params`), and renders and stores it on a miss. The cache is absent in the Vite dev server, which always renders.
 */
export async function serveCachedCard(
  url: URL,
  params: URLSearchParams,
  render: (params: URLSearchParams) => Promise<Response>,
): Promise<Response> {
  const key = new Request(`${url.origin}${url.pathname}${params.size > 0 ? `?${params}` : ""}`);
  const edge = typeof caches === "undefined" ? undefined : (caches as unknown as { default?: Cache }).default;
  const cached = await edge?.match(key);
  if (cached) return cached;
  const response = await render(params);
  if (edge && response.ok) await edge.put(key, response.clone());
  return response;
}
