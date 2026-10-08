import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useCloseSideNavDrawer } from "~/components/patterns/navigation/SideNavShell";
import { Button } from "~/components/ui/button";
import { SearchInput } from "~/components/ui/search-input";
import { MAX_QUESTION_LENGTH } from "~/lib/ai-search/search-fns";
import { getAnalytics } from "~/lib/analytics";
import { cn } from "~/lib/utils";

import { setLastSearch, useLastSearch } from "./last-search";
import { routeQuestion } from "./route-question";

/** Questions the home page's field cycles through as its placeholder, to show what it can be asked. */
const PLACEHOLDER_QUESTIONS = [
  "who counters abrams",
  "best heroes in eternus this patch",
  "when to buy toxic bullets on haze",
  "how long are games in phantom+",
  "top players in europe",
];
const PLACEHOLDER_INTERVAL_MS = 3500;

type Outcome = "opened" | "no_match" | "error";

/** One event per question, with the question itself: what visitors ask, how often, and where it took them. */
function trackQuestion(properties: {
  question: string;
  source: "home" | "sidebar";
  outcome: Outcome;
  page?: string;
  alternatives?: string[];
  direct?: boolean;
  durationMs?: number;
}) {
  void getAnalytics().then((posthog) =>
    posthog?.capture("ai_search", {
      question: properties.question,
      source: properties.source,
      outcome: properties.outcome,
      page: properties.page ?? null,
      alternatives: properties.alternatives ?? [],
      direct: properties.direct ?? false,
      duration_ms: properties.durationMs === undefined ? null : Math.round(properties.durationMs),
    }),
  );
}

/** Whether a key press belongs to a field the visitor is typing in, which a shortcut must not take over. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
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
   * `default` is the home page's search bar, its button inside it. `sm` is the sidebar's: it submits on Enter, shows
   * its progress in the field, and takes the focus on `/` or Ctrl+K from anywhere on the page.
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

  useEffect(() => {
    if (size !== "sm") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !isTyping(event.target);
      const commandK = event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey);
      if (!slash && !commandK) return;
      // The sidebar is hidden on a phone, where its search lives in the menu instead.
      if (!input.current?.checkVisibility()) return;
      event.preventDefault();
      input.current.focus();
      input.current.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [size]);

  const question = last && last.version !== draft.version ? last.question : draft.text;
  const source = size === "sm" ? "sidebar" : "home";

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const asked = ++latest.current;
    setSearching(true);
    setUnmatched(false);
    routeQuestion(queryClient, trimmed).then(
      ({ results, direct, durationMs }) => {
        if (asked !== latest.current) return undefined;
        setSearching(false);
        if (results.length === 0) {
          trackQuestion({ question: trimmed, source, outcome: "no_match", direct, durationMs });
          setUnmatched(true);
          toast("No page matches that question");
          return undefined;
        }
        const [best, ...alternatives] = results;
        trackQuestion({
          question: trimmed,
          source,
          outcome: "opened",
          page: best.id,
          alternatives: alternatives.map((result) => result.id),
          direct,
          durationMs,
        });
        setLastSearch(trimmed);
        closeDrawer();
        return navigate({ href: best.href });
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
          shortcut={size === "sm" ? "/" : undefined}
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
