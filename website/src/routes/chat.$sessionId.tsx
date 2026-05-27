import { createFileRoute } from "@tanstack/react-router";

import { CoachWorkspace } from "~/components/coach/CoachWorkspace";

export const Route = createFileRoute("/chat/$sessionId")({
  component: ChatSessionPage,
});

function ChatSessionPage() {
  const { sessionId } = Route.useParams();
  // Key by id so navigating between chats remounts with fresh state.
  return <CoachWorkspace key={sessionId} sessionId={sessionId} />;
}
