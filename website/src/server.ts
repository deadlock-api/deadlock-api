import type { Register } from "@tanstack/react-router";
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server";

import headersFile from "../public/_headers?raw";
import { headersFor, parseHeadersFile } from "./lib/static-headers";

const handler = createStartHandler(defaultStreamHandler);
const HEADER_RULES = parseHeadersFile(headersFile);

function isHtmlResponse(res: Response): boolean {
  const ct = res.headers.get("content-type");
  return !!ct && ct.toLowerCase().includes("text/html");
}

export default {
  async fetch(...args) {
    const request = args[0] as Request;
    const url = new URL(request.url);
    let changed = false;
    if (url.hostname === "www.deadlock-api.com") {
      url.hostname = "deadlock-api.com";
      changed = true;
    }
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      changed = true;
    }
    if (changed) return Response.redirect(url.toString(), 301);

    const res = await handler(args[0], {
      ...args[1],
      // Cloudflare creates 103 responses from Link headers. Keep hints limited
      // to public CSS/fonts; never replay route data or private resources.
      responseLinkHeader: {
        filter: ({ hint }) =>
          hint.rel === "preload" && (hint.as === "style" || hint.as === "font") && hint.href.startsWith("/assets/"),
      },
    });
    // Worker responses skip `_headers` (it only covers static assets), so the security headers are added here.
    const missing = [...headersFor(HEADER_RULES, url.pathname)].filter(([name]) => !res.headers.has(name));
    const uncached = isHtmlResponse(res) && !res.headers.has("cache-control");
    if (missing.length === 0 && !uncached) return res;
    const headers = new Headers(res.headers);
    for (const [name, value] of missing) headers.set(name, value);
    if (uncached) {
      headers.set("Cache-Control", "private, max-age=0, must-revalidate");
      headers.append("Vary", "Cookie");
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
} satisfies { fetch: RequestHandler<Register> };
