import type { Register } from "@tanstack/react-router";
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server";

import { DYNAMIC_DATA_ROUTES } from "./lib/dynamic-data-routes";

const handler = createStartHandler(defaultStreamHandler);

function isHtmlResponse(res: Response): boolean {
  const ct = res.headers.get("content-type");
  return !!ct && ct.toLowerCase().includes("text/html");
}

// Live-data analytics pages are SSR'd per request (not prerendered), so let
// Cloudflare's shared cache hold them briefly to bound origin load while
// keeping the numbers fresh. stale-while-revalidate serves the cached copy
// instantly and refreshes it in the background. The browser still revalidates
// (max-age=0) so a new deploy is picked up on the next navigation.
const DYNAMIC_DATA_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const DEFAULT_HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export default {
  async fetch(...args) {
    const res = await handler(...args);
    if (isHtmlResponse(res) && !res.headers.has("cache-control")) {
      const pathname = new URL((args[0] as Request).url).pathname;
      const headers = new Headers(res.headers);
      headers.set(
        "Cache-Control",
        DYNAMIC_DATA_ROUTES.has(pathname) ? DYNAMIC_DATA_CACHE_CONTROL : DEFAULT_HTML_CACHE_CONTROL,
      );
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },
} satisfies { fetch: RequestHandler<Register> };
