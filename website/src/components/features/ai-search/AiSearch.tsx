import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Button } from "~/components/ui/button";
import { ProgressBar } from "~/components/ui/progress-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { usePromptApiStatus } from "~/hooks/usePromptApiStatus";
import { warmUpModel } from "~/lib/ai-search/language-model";
import { getAnalytics } from "~/lib/analytics";
import { cn } from "~/lib/utils";

import { routeQuestion } from "./route-question";

type Phase =
  | { kind: "idle" }
  /** `loaded` is set while the question waits for the model download, 0 to 1. */
  | { kind: "searching"; loaded?: number }
  | { kind: "no-match" }
  | { kind: "failed" };

function track(href: string | undefined) {
  void getAnalytics().then((posthog) => posthog?.capture("ai_search", { page: href?.split("?")[0] ?? null }));
}

/**
 * A question in plain words, sent to the browser's own model (Chrome's Prompt API), which picks the page and filters
 * that answer it; the search then goes there. It never answers itself. Renders nothing where the browser cannot run
 * the model, and stays hidden before hydration unless the document head marked the browser as able
 * (`PROMPT_API_FLAG_SCRIPT`), so it takes no room it will not use.
 */
export function AiSearch({ className }: { className?: string }) {
  const availability = usePromptApiStatus();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  if (availability === "unsupported" || availability === "unavailable") return null;

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setPhase({ kind: "searching" });
    routeQuestion(queryClient, trimmed, {
      signal: controller.signal,
      onProgress: (loaded) => {
        if (!controller.signal.aborted) setPhase({ kind: "searching", loaded });
      },
    }).then(
      (href) => {
        if (controller.signal.aborted) return undefined;
        track(href);
        if (!href) {
          setPhase({ kind: "no-match" });
          return undefined;
        }
        setPhase({ kind: "idle" });
        return navigate({ href });
      },
      () => {
        if (!controller.signal.aborted) setPhase({ kind: "failed" });
      },
    );
  };

  const cancel = () => {
    pending.current?.abort();
    setPhase({ kind: "idle" });
  };

  const searching = phase.kind === "searching";
  const loaded = phase.kind === "searching" ? phase.loaded : undefined;
  const downloading = loaded !== undefined && loaded < 1;

  return (
    <search aria-label="Find a stat" className={cn("prompt-api-only w-full max-w-xl", className)}>
      <Stack gap={1}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <Inline gap={2} wrap="nowrap">
            <div className="relative flex-1">
              <SearchInput
                name="q"
                aria-label="Ask for a stat"
                placeholder="Ask for a stat: best counter against bebop"
                autoComplete="off"
                enterKeyHint="search"
                aria-invalid={phase.kind === "no-match" || undefined}
                value={question}
                onValueChange={(value) => {
                  setQuestion(value);
                  if (phase.kind === "no-match" || phase.kind === "failed") setPhase({ kind: "idle" });
                }}
                onFocus={warmUpModel}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && searching) {
                    event.preventDefault();
                    cancel();
                  }
                }}
              />
              {downloading && (
                <ProgressBar
                  variant="thin"
                  value={loaded}
                  max={1}
                  aria-label="Downloading the search model"
                  className="absolute inset-x-2 bottom-0"
                />
              )}
            </div>
            <Button
              type="submit"
              loading={searching}
              loadingLabel="Finding the page"
              disabled={availability === "checking"}
            >
              Go
              {/* The spinner takes the arrow's place, so the button keeps its width and the field does not move. */}
              {!searching && <ArrowRight aria-hidden="true" />}
            </Button>
          </Inline>
        </form>

        {/* One line, held open while idle, so nothing moves when a question fails or waits for the model download. */}
        <div className="min-h-4">
          {downloading ? (
            <output>
              <Text variant="caption" tone="muted" align="center" as="p">
                Downloading Chrome's on-device model, once: {Math.round((loaded ?? 0) * 100)}%
              </Text>
            </output>
          ) : phase.kind === "no-match" ? (
            <ErrorState variant="inline" title="No page matches that question" className="py-0" />
          ) : phase.kind === "failed" ? (
            <ErrorState
              variant="inline"
              title="The on-device model could not answer"
              onRetry={() => ask(question)}
              className="py-0"
            />
          ) : null}
        </div>
      </Stack>
    </search>
  );
}
