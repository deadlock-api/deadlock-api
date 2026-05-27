import { createFileRoute } from "@tanstack/react-router";

import { CoachWorkspace } from "~/components/coach/CoachWorkspace";

export const Route = createFileRoute("/chat/")({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): { demo?: string } => ({
    demo: typeof search.demo === "string" ? search.demo : undefined,
  }),
});

function ChatPage() {
  const { demo } = Route.useSearch();
  return <CoachWorkspace demo={demo} />;
}
