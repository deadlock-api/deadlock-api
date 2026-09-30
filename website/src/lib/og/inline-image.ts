/**
 * Images for the share cards as data URIs, kept for the life of the isolate: the logo, rank badges and backgrounds
 * repeat on every card. Per-card images (an avatar, a crosshair) are loaded with `keep = false`, since the edge cache
 * already answers a repeated card. Handing satori data URIs also spares it its own fetches.
 */
const IMAGE_CACHE = new Map<string, Promise<string | undefined>>();
const IMAGE_CACHE_SIZE = 300;

export async function fetchDataUri(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const type = response.headers.get("content-type") ?? "image/png";
  return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

export function inlineImage(url: string | undefined, keep = true): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  if (!keep) return fetchDataUri(url).catch(() => undefined);
  const hit = IMAGE_CACHE.get(url);
  if (hit) return hit;
  // Oldest out first; a Map iterates in insertion order.
  if (IMAGE_CACHE.size >= IMAGE_CACHE_SIZE) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value!);
  const load = fetchDataUri(url).catch(() => {
    // A failed image is not remembered: the next card tries again, this one draws its fallback.
    IMAGE_CACHE.delete(url);
    return undefined;
  });
  IMAGE_CACHE.set(url, load);
  return load;
}
