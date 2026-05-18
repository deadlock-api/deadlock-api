import { createFileRoute } from "@tanstack/react-router";

import { buildSitemapIndexXml } from "~/lib/sitemap";

export const Route = createFileRoute("/sitemap_index.xml")({
  server: {
    handlers: {
      GET: () => {
        return new Response(buildSitemapIndexXml(), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
