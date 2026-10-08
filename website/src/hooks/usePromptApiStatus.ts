import { useQuery } from "@tanstack/react-query";

import { useHydrated } from "~/hooks/useHydrated";
import { isPromptApiSupported, modelAvailability } from "~/lib/ai-search/prompt-api";

/** `checking` until hydration and the browser's answer; `unsupported` where the browser has no Prompt API at all. */
export type PromptApiStatus = "checking" | "unsupported" | LanguageModelAvailability;

/** Whether this browser can run Chrome's built-in model, and whether it still has to download it. */
export function usePromptApiStatus(): PromptApiStatus {
  const hydrated = useHydrated();
  const supported = hydrated && isPromptApiSupported();
  const { data } = useQuery({
    queryKey: ["prompt-api-availability"],
    queryFn: modelAvailability,
    enabled: supported,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!hydrated) return "checking";
  if (!supported) return "unsupported";
  return data ?? "checking";
}
