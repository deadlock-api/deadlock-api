import { useQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AiCoachGate } from "~/components/coach/AiCoachGate";
import { getSessionTree } from "~/lib/coach/client";
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
  const { data: hasAccess, isLoading: accessLoading } = useAiAgentAccess();
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };

  const { data: sessionTree, isLoading: sessionLoading } = useQuery({
    queryKey: ["coach-session-tree", sessionId],
    queryFn: () => getSessionTree(sessionId!),
    enabled: !!sessionId && typeof document !== "undefined",
    retry: false,
    staleTime: 60_000,
  });

  let content: ReactNode;
  if (sessionId && sessionLoading) {
    content = <AiCoachGate />;
  } else if (sessionId && sessionTree) {
    content = <Outlet />;
  } else if (accessLoading || !hasAccess) {
    content = <AiCoachGate />;
  } else {
    content = <Outlet />;
  }

  return content;
}
