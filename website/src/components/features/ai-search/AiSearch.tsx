import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCloseSideNavDrawer } from "~/components/patterns/navigation/SideNavShell";
import { Button } from "~/components/ui/button";
import { SearchInput } from "~/components/ui/search-input";
import { MAX_QUESTION_LENGTH, QUESTIONS_PER_MINUTE } from "~/lib/ai-search/limits";
import type { DecideFailure } from "~/lib/ai-search/search-fns";
import { getAnalytics } from "~/lib/analytics";
import { cn } from "~/lib/utils";

import { setLastSearch, useLastSearch } from "./last-search";
import { useSearchShortcut } from "./search-shortcut";

/** Questions the home page's field cycles through as its placeholder, to show what it can be asked. */
const PLACEHOLDER_QUESTIONS = [
  "who counters abrams",
  "best heroes in eternus this patch",
  "when to buy toxic bullets on haze",
  "how long are games in phantom+",
  "top players in europe",
];
const PLACEHOLDER_INTERVAL_MS = 3500;

type Outcome = "opened" | "not_understood" | DecideFailure | "error";

/** One event per question, with the question itself: what visitors ask, how often, and where it took them. */
function trackQuestion(properties: {
  question: string;
  source: "home" | "sidebar";
  outcome: Outcome;
  page?: string;
  direct?: boolean;
  durationMs?: number;
}) {
  void getAnalytics().then((posthog) =>
    posthog?.capture("ai_search", {
      question: properties.question,
      source: properties.source,
      outcome: properties.outcome,
      page: properties.page ?? null,
      direct: properties.direct ?? false,
      duration_ms: properties.durationMs === undefined ? null : Math.round(properties.durationMs),
    }),
  );
}

/** The placeholder question shown now: it moves on every few seconds, and stays put for reduced motion. */
function useRotatingPlaceholder(enabled: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % PLACEHOLDER_QUESTIONS.length),
      PLACEHOLDER_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [enabled]);
  return PLACEHOLDER_QUESTIONS[index];
}

interface AiSearchProps {
  /**
   * `default` is the home page's search bar, its button inside it. `sm` is the sidebar's: it submits on Enter and shows
   * its progress in the field. `/` or Ctrl+K focus the bar where there is one, the sidebar's field elsewhere.
   */
  size?: "default" | "sm";
  className?: string;
}

/**
 * A question in plain words, read by Mercury Decide, which opens the page of the site that answers it, already
 * filtered. It never answers itself. The field keeps the question after it opens the page, and a question it cannot
 * place is said in a toast, so nothing around the field ever moves.
 */
export function AiSearch({ size = "default", className }: AiSearchProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const closeDrawer = useCloseSideNavDrawer();
  const last = useLastSearch();
  /** What was typed here, and which answer it was typed after: a newer answer shows its question instead. */
  const [draft, setDraft] = useState({ text: "", version: 0 });
  const [searching, setSearching] = useState(false);
  const [unmatched, setUnmatched] = useState(false);
  const example = useRotatingPlaceholder(size === "default");
  /** The question asked last: an answer to an earlier one that arrives late is dropped. */
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      latest.current += 1;
    },
    [],
  );

  useSearchShortcut(input, size === "default" ? 2 : 1);

  const question = last && last.version !== draft.version ? last.question : draft.text;
  const source = size === "sm" ? "sidebar" : "home";

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const asked = ++latest.current;
    setSearching(true);
    setUnmatched(false);
    // The search's code (the page registry, the name matcher, the catalogs) loads with the first question.
    import("./route-question")
      .then(({ routeQuestion }) => routeQuestion(queryClient, trimmed))
      .then(
        ({ result, failure, direct, durationMs }) => {
          if (asked !== latest.current) return undefined;
          setSearching(false);
          if (failure) {
            trackQuestion({ question: trimmed, source, outcome: failure, direct, durationMs });
            if (failure === "rate_limited") {
              toast(`That's a lot of questions. You can ask ${QUESTIONS_PER_MINUTE} a minute; try again shortly.`);
            } else if (failure === "unavailable") {
              toast("The search is unavailable right now", {
                action: { label: "Try again", onClick: () => ask(trimmed) },
              });
            } else {
              toast("The search is unavailable right now");
            }
            return undefined;
          }
          if (!result) {
            trackQuestion({ question: trimmed, source, outcome: "not_understood", direct, durationMs });
            setUnmatched(true);
            toast("Sorry, I didn't understand that. Try asking about a hero, an item or a stat.");
            return undefined;
          }
          trackQuestion({ question: trimmed, source, outcome: "opened", page: result.id, direct, durationMs });
          setLastSearch(trimmed);
          closeDrawer();
          return navigate({ href: result.href });
        },
        () => {
          if (asked !== latest.current) return;
          setSearching(false);
          trackQuestion({ question: trimmed, source, outcome: "error" });
          toast("The search could not answer", { action: { label: "Try again", onClick: () => ask(trimmed) } });
        },
      );
  };

  return (
    <search aria-label="Find a stat" className={cn("w-full", size === "default" && "max-w-2xl", className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <SearchInput
          ref={input}
          name="q"
          variant={size === "sm" ? "default" : "bar"}
          size={size}
          loading={size === "sm" && searching}
          loadingLabel="Finding the page"
          shortcut="/"
          aria-label="Ask for a stat"
          aria-invalid={unmatched || undefined}
          placeholder={size === "sm" ? "Ask for a stat" : `Ask anything: ${example}`}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onValueChange={(text) => {
            setDraft({ text, version: last?.version ?? 0 });
            setUnmatched(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && searching) {
              // Drops the running question instead of clearing the field.
              event.preventDefault();
              latest.current += 1;
              setSearching(false);
            }
          }}
          action={
            size === "default" && (
              <Button type="submit" shape="pill" loading={searching} loadingLabel="Finding the page">
                Search
              </Button>
            )
          }
        />
      </form>
    </search>
  );
}
