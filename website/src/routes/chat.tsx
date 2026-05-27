import { Outlet, createFileRoute } from "@tanstack/react-router";

import { seo } from "~/lib/seo";

export const Route = createFileRoute("/chat")({
  component: ChatLayout,
  head: () =>
    seo({
      title: "Deadlock AI Coach | Deadlock API",
      description:
        "Ask the Deadlock AI Coach about any match, hero, build, or your own trends. Get a custom report with interactive charts, a tactical map, and a match replay, grounded in live Deadlock API data.",
      path: "/chat",
    }),
});

function ChatLayout() {
  return <Outlet />;
}
