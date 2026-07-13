import type { Register } from "@tanstack/react-router";
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server";

const handler = createStartHandler(defaultStreamHandler);

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

    const res = await handler(...args);
    if (isHtmlResponse(res) && !res.headers.has("cache-control")) {
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },
} satisfies { fetch: RequestHandler<Register> };
