import type { Register } from "@tanstack/react-router";
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server";

import headersFile from "../public/_headers?raw";
import { isCacheableRequest, serveCachedHtml } from "./lib/html-cache";
import { headersFor, parseHeadersFile } from "./lib/static-headers";
import { setWorkerEnv, type WorkerEnv } from "./lib/worker-env";

const handler = createStartHandler(defaultStreamHandler);
const HEADER_RULES = parseHeadersFile(headersFile);

function isHtmlResponse(res: Response): boolean {
  const ct = res.headers.get("content-type");
  return !!ct && ct.toLowerCase().includes("text/html");
}

/** The Workers Static Assets binding (`assets.binding` in wrangler.jsonc). */
interface AssetsBinding {
  fetch(url: string): Promise<Response>;
}

/** The builds whose assets this deploy serves (scripts/preserve-old-assets.mjs); read once per isolate. */
let servedBuilds: Promise<ReadonlySet<string>> | undefined;

function readServedBuilds(assets: AssetsBinding | undefined, origin: string): Promise<ReadonlySet<string>> {
  servedBuilds ??= (async () => {
    if (!assets) return new Set<string>();
    const res = await assets.fetch(`${origin}/asset-history.json`);
    if (!res.ok) throw new Error(`asset-history.json: HTTP ${res.status}`);
    const history = (await res.json()) as { builds?: Record<string, unknown> };
    return new Set(Object.keys(history.builds ?? {}));
  })().catch(() => {
    // A failed read is not kept: the next request tries again.
    servedBuilds = undefined;
    return new Set<string>();
  });
  return servedBuilds;
}

/** The part of the Workers `ExecutionContext` this entry uses; absent in the Vite dev server. */
interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Adds what every Worker-rendered page carries: the `_headers` security headers and, for HTML, a Cache-Control. */
function finalize(url: URL, res: Response): Response {
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
}

export default {
  async fetch(request: Request, env: Parameters<RequestHandler<Register>>[1], ctx?: WorkerContext) {
    // Undefined under the Vite dev server, which runs this entry without a Worker around it.
    setWorkerEnv((env as WorkerEnv | undefined) ?? {});
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

    const render = (req: Request) =>
      handler(req, {
        ...env,
        // Cloudflare creates 103 responses from Link headers. Keep hints limited
        // to public CSS/fonts; never replay route data or private resources.
        responseLinkHeader: {
          filter: ({ hint }) =>
            hint.rel === "preload" && (hint.as === "style" || hint.as === "font") && hint.href.startsWith("/assets/"),
        },
      });

    if (ctx && typeof caches !== "undefined" && isCacheableRequest(request)) {
      return serveCachedHtml(request, {
        cache: await caches.open("ssr-html"),
        render,
        finalize: (res) => finalize(url, res),
        waitUntil: (promise) => ctx.waitUntil(promise),
        buildId: import.meta.env.VITE_BUILD_ID,
        servedBuilds: () => readServedBuilds((env as { ASSETS?: AssetsBinding }).ASSETS, url.origin),
      });
    }
    return finalize(url, await render(request));
  },
};
