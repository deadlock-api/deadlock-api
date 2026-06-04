import { useQuery } from "@tanstack/react-query";

import { fetchAiAgentAccess } from "./client";

// Gates the /chat routes: only patrons with `ai_agent_access` see the coach;
// everyone else gets the "coming soon" teaser.
//
// Client-only: the access check depends on the per-user `patron_session` cookie,
// so it's meaningless during SSR/prerender — and calling it at build time hit the
// coach API and crashed the prerender (ECONNRESET). Disabling it on the server
// keeps /chat prerenderable (it renders the teaser shell, identical to the
// client's loading state) while the real check runs after hydration.
export function useAiAgentAccess() {
  return useQuery({
    queryKey: ["coach-ai-agent-access"],
    queryFn: fetchAiAgentAccess,
    enabled: typeof document !== "undefined",
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
