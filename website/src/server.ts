import type { Register } from "@tanstack/react-router";
import { createStartHandler, defaultStreamHandler, type RequestHandler } from "@tanstack/react-start/server";

const handler = createStartHandler(defaultStreamHandler);

function isHtmlResponse(res: Response): boolean {
  const ct = res.headers.get("content-type");
  return !!ct && ct.toLowerCase().includes("text/html");
}

export default {
  async fetch(...args) {
    const res = await handler(...args);
    if (isHtmlResponse(res) && !res.headers.has("cache-control")) {
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  },
} satisfies { fetch: RequestHandler<Register> };
