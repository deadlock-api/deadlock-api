import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ComingSoonTeaser } from "~/components/coach/ComingSoonTeaser";
import { useAiAgentAccess } from "~/lib/coach/use-ai-agent-access";
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
  const { data: hasAccess, isLoading } = useAiAgentAccess();

  // Until access resolves, render the teaser shell so non-patrons (the common
  // case) never see a flash of the coach workspace. Patrons with `ai_agent_access`
  // get the real workspace via the nested route.
  if (isLoading || !hasAccess) {
    return <ComingSoonTeaser />;
  }

  return <Outlet />;
}
