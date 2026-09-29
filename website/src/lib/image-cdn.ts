/**
 * The image through Cloudflare's resizer: scaled down to `width`, re-encoded (AVIF or WebP by Accept) and cached at the
 * edge; on any failure it redirects to the original. Origins must be in the zone's allowed transformation origins.
 */
export function cdnImageUrl(url: string, width: number, quality = 85): string {
  return `https://deadlock-api.com/cdn-cgi/image/fit=scale-down,width=${width},quality=${quality},format=auto,onerror=redirect/${url}`;
}
