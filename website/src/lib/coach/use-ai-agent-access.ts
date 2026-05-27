import { useQuery } from "@tanstack/react-query";

import { fetchAiAgentAccess } from "./client";

// Gates the /chat routes: only patrons with `ai_agent_access` see the coach;
// everyone else gets the "coming soon" teaser.
export function useAiAgentAccess() {
  return useQuery({
    queryKey: ["coach-ai-agent-access"],
    queryFn: fetchAiAgentAccess,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
