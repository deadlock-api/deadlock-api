import { createFileRoute } from "@tanstack/react-router";

// RFC 9727 API catalog: lets agents and tools find the public API from the website's origin.
const API_CATALOG = {
  linkset: [
    {
      anchor: "https://api.deadlock-api.com/",
      "service-desc": [{ href: "https://api.deadlock-api.com/openapi.json", type: "application/json" }],
      "service-doc": [{ href: "https://api.deadlock-api.com/docs", type: "text/html" }],
    },
  ],
};

export const Route = createFileRoute("/.well-known/api-catalog")({
  server: {
    handlers: {
      GET: () => {
        return new Response(JSON.stringify(API_CATALOG, null, 2), {
          headers: {
            "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
